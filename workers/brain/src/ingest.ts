// POST /ingest-event — minimal behavioral telemetry, forwarded to Ollie's
// (separate) Supabase project. The worker is the only holder of the service
// key; the client never talks to Supabase directly.
//
// Trust boundary: the client's row is treated as hostile. Table + columns are
// whitelisted, everything else is dropped, and user_hash is ALWAYS computed
// server-side from the verified Clerk sub — a client-sent user_hash is ignored.

export interface IngestEnv {
  USER_HASH_SALT?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
}

// Allowed tables → allowed client-supplied columns (per the Ollie schemas).
// user_hash and app are server-controlled and deliberately absent here.
const FUNNEL_EVENT_TYPES = new Set([
  'onboarding_completed',
  'first_dump',
  'dump_submitted',
  'route_corrected',
  'notif_permission',
  'account_deleted',
]);
const RETENTION_EVENT_TYPES = new Set([
  'installed',
  'session_started',
  'd1_returned',
  'd7_returned',
  'd30_returned',
]);

const COLUMNS: Record<string, Record<string, 'string' | 'number'>> = {
  funnel_events: {
    event_type: 'string',
    value: 'string',
    minutes_since_install: 'number',
    app_version: 'string',
    event_at: 'string',
  },
  retention_events: {
    event_type: 'string',
    event_at: 'string',
    session_count: 'number',
    hours_since_install: 'number',
    device_id: 'string',
    app_version: 'string',
  },
};

// hex SHA-256 of `${salt}:${clerkSub}` — stable per user, unlinkable without
// the salt. WebCrypto only (no deps).
export async function hashUser(salt: string, clerkSub: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${clerkSub}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Whitelist-copy the client row: keep only known columns with the right
// primitive type; silently drop the rest (including any client user_hash/app).
export function sanitizeRow(
  table: string,
  raw: Record<string, unknown>,
): Record<string, unknown> | null {
  const allowed = COLUMNS[table];
  if (!allowed) return null;
  const row: Record<string, unknown> = {};
  for (const [col, kind] of Object.entries(allowed)) {
    const v = raw[col];
    if (kind === 'string' && typeof v === 'string' && v.length <= 200) row[col] = v;
    if (kind === 'number' && typeof v === 'number' && Number.isFinite(v)) row[col] = v;
  }
  const types = table === 'funnel_events' ? FUNNEL_EVENT_TYPES : RETENTION_EVENT_TYPES;
  if (typeof row.event_type !== 'string' || !types.has(row.event_type)) return null;
  if (typeof row.event_at !== 'string') row.event_at = new Date().toISOString();
  return row;
}

/**
 * Handle a verified, rate-limited /ingest-event request. `userId` is the
 * Clerk sub from the JWT — auth + rate limiting happen in the caller.
 * Returns { status, body } so the caller keeps its own json() helper.
 */
export async function handleIngest(
  request: Request,
  env: IngestEnv,
  userId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!env.USER_HASH_SALT || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return { status: 503, body: { error: 'telemetry not configured' } };
  }

  let table = '';
  let rawRow: Record<string, unknown> = {};
  try {
    const body = (await request.json()) as { table?: unknown; row?: unknown };
    table = typeof body.table === 'string' ? body.table : '';
    if (body.row && typeof body.row === 'object') rawRow = body.row as Record<string, unknown>;
  } catch {
    /* falls through to the whitelist check */
  }

  const row = sanitizeRow(table, rawRow);
  if (!row) return { status: 400, body: { error: 'bad table or row' } };

  row.user_hash = await hashUser(env.USER_HASH_SALT, userId);
  if (table === 'funnel_events') row.app = 'roomie';

  const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: env.SUPABASE_SERVICE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    console.log(JSON.stringify({ metric: 'ingest_error', table, status: res.status }));
    return { status: 502, body: { error: 'ingest failed' } };
  }
  return { status: 202, body: { ok: true } };
}
