// Per-user daily call cap for the Brain worker.
//
// The old guard was a single module-level counter — global (one noisy user
// burned everyone's quota) and per-isolate (reset on cold start). This keys the
// count by userId + date in Cloudflare KV so the cap is genuinely per-person and
// survives restarts. It stays a COST guard, not an exact limiter: KV is
// eventually consistent, so two concurrent requests can both read the same prior
// count — worst case a user slips a handful over the cap, never a bill blowout.

export const DAILY_CAP = 200;
const TWO_DAYS_SECONDS = 172_800; // yesterday's keys self-evict

// Minimal shape of a Cloudflare KV namespace — declared locally so the worker
// doesn't need @cloudflare/workers-types just for this.
export interface CounterStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export function capKey(userId: string, isoDate: string): string {
  return `cap:${userId}:${isoDate}`;
}

// Records one call for this user today and returns true if they are now OVER the
// cap (i.e. the request should be rejected with 429). If no store is bound
// (local dev / pre-deploy) it never blocks — the caller keeps its own fallback.
export async function overDailyCap(
  store: CounterStore | undefined,
  userId: string,
  now: Date,
  cap: number = DAILY_CAP,
): Promise<boolean> {
  if (!store) return false;
  const key = capKey(userId, now.toISOString().slice(0, 10));
  const prev = Number((await store.get(key)) ?? '0') || 0;
  const next = prev + 1;
  await store.put(key, String(next), { expirationTtl: TWO_DAYS_SECONDS });
  return next > cap;
}
