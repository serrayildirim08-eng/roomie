// Roomie Brain worker — POST /draft: one household note in, draft fragments
// out. NEVER persists; the app writes only after the user confirms.
//
// Cascade: Groq gpt-oss-120b (JSON mode) → Cloudflare Workers AI (no key).
// Auth: Clerk session JWT (Bearer). Cost guard: per-isolate daily call cap —
// crude but honest for a one-flat dogfood; a KV counter can replace it when
// there are strangers in the building.

import { verifyClerkJwt } from './clerk-verify';
import { cloudflareJson, type CfAiBinding } from './cloudflare-ai';
import { groqChat, type GroqHttpError } from './groq';
import { SYSTEM_PROMPT, userPrompt } from './prompt';
import { overDailyCap, type CounterStore } from './rate-limit';
import { itemizeReceipt } from './receipt';
import { parseDraft, type Draft } from './schema';

interface Env {
  AI: CfAiBinding;
  GROQ_API_KEY?: string;
  CLERK_ISSUER?: string;
  // Per-user daily counter (KV). When bound, the cap is per-person and survives
  // cold starts; when absent (local/pre-deploy) we fall back to the crude
  // in-memory global guard below so a leaked token still can't run up a bill.
  RATE_LIMIT?: CounterStore;
}

// Fallback bill-guard for when RATE_LIMIT KV isn't bound yet: a single
// per-isolate counter (global, resets on redeploy/idle). Superseded by the
// per-user KV cap as soon as the namespace is provisioned.
const DAILY_CAP = 200;
let capDay = '';
let capCount = 0;

function overCapInMemory(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== capDay) {
    capDay = today;
    capCount = 0;
  }
  capCount += 1;
  return capCount > DAILY_CAP;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}

async function classify(text: string, env: Env): Promise<{ draft: Draft; source: string }> {
  // Tier 1 — Groq JSON mode.
  if (env.GROQ_API_KEY) {
    try {
      const choice = await groqChat(
        {
          apiKey: env.GROQ_API_KEY,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt(text) },
          ],
          jsonMode: true,
          maxTokens: 700,
        },
        'roomie-draft',
      );
      const { draft, dropped } = parseDraft(choice.message.content ?? '');
      if (dropped > 0) console.log(JSON.stringify({ metric: 'draft_dropped', dropped }));
      return { draft, source: 'groq' };
    } catch (e) {
      const status = (e as GroqHttpError).status;
      console.log(
        JSON.stringify({
          metric: 'draft_fallback',
          from: 'groq',
          status,
          message: (e as Error).message?.slice(0, 200),
        }),
      );
      // fall through to Workers AI on rate limit, upstream error, or bad JSON
    }
  }

  // Tier 2 — Cloudflare Workers AI (same platform, no key).
  const raw = await cloudflareJson(
    env.AI,
    { system: SYSTEM_PROMPT, user: userPrompt(text), maxTokens: 700 },
    'roomie-draft',
  );
  const { draft, dropped } = parseDraft(raw);
  if (dropped > 0) console.log(JSON.stringify({ metric: 'draft_dropped', dropped }));
  return { draft, source: 'cloudflare' };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname === '/health') return json({ ok: true });
    const route = url.pathname;
    if ((route !== '/draft' && route !== '/receipt-itemize') || request.method !== 'POST') {
      return json({ error: 'not found' }, 404);
    }

    // Auth: Clerk session JWT.
    const auth = request.headers.get('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const userId = await verifyClerkJwt(token, env);
    if (!userId) return json({ error: 'unauthorized' }, 401);

    // Per-user cap when KV is bound; crude global guard otherwise.
    const over = env.RATE_LIMIT
      ? await overDailyCap(env.RATE_LIMIT, userId, new Date())
      : overCapInMemory();
    if (over) return json({ error: 'daily cap reached' }, 429);

    if (route === '/receipt-itemize') {
      if (!env.GROQ_API_KEY) return json({ error: 'vision unavailable' }, 503);
      let imageUrl = '';
      try {
        const body = (await request.json()) as { imageUrl?: unknown };
        imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl : '';
      } catch {
        /* falls through to the check below */
      }
      // Only Instant storage URLs — this endpoint is not a general vision proxy.
      if (!imageUrl.startsWith('https://')) return json({ error: 'imageUrl required' }, 400);
      const read = await itemizeReceipt(env.GROQ_API_KEY, imageUrl);
      if (!read) return json({ error: 'could not read the receipt' }, 502);
      return json(read);
    }

    let text = '';
    try {
      const body = (await request.json()) as { text?: unknown };
      text = typeof body.text === 'string' ? body.text.trim() : '';
    } catch {
      /* fall through to the empty-text check */
    }
    if (!text) return json({ error: 'text required' }, 400);
    if (text.length > 500) return json({ error: 'too long' }, 400);

    const startedAt = Date.now();
    try {
      const { draft, source } = await classify(text, env);
      console.log(
        JSON.stringify({
          metric: 'draft',
          source,
          fragments: draft.fragments.length,
          latency_ms: Date.now() - startedAt,
        }),
      );
      return json({ ...draft, source });
    } catch (e) {
      console.log(JSON.stringify({ metric: 'draft_error', message: (e as Error).message }));
      // Honest failure — the app shows "Brain couldn't read that", nothing
      // is guessed, nothing is written.
      return json({ error: 'classify failed' }, 502);
    }
  },
};
