import { describe, expect, it } from 'vitest';
import { DAILY_CAP, capKey, overDailyCap, type CounterStore } from './rate-limit';

// A fake KV: an in-memory Map, enough to prove the counter logic.
function fakeStore(): CounterStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: async (k) => map.get(k) ?? null,
    put: async (k, v) => {
      map.set(k, v);
    },
  };
}

const alice = 'user_alice';
const bob = 'user_bob';
const day = new Date('2026-07-03T12:00:00Z');

describe('overDailyCap', () => {
  it('allows calls up to the cap and blocks the one past it', async () => {
    const store = fakeStore();
    // First DAILY_CAP calls are allowed (not over).
    for (let i = 0; i < DAILY_CAP; i += 1) {
      expect(await overDailyCap(store, alice, day)).toBe(false);
    }
    // The next one tips over.
    expect(await overDailyCap(store, alice, day)).toBe(true);
  });

  it('is per-user — one user maxing out does not block another', async () => {
    const store = fakeStore();
    for (let i = 0; i < DAILY_CAP + 5; i += 1) await overDailyCap(store, alice, day);
    // Bob is untouched — his first call is still allowed.
    expect(await overDailyCap(store, bob, day)).toBe(false);
  });

  it('resets per calendar day (separate key)', async () => {
    const store = fakeStore();
    for (let i = 0; i < DAILY_CAP + 1; i += 1) await overDailyCap(store, alice, day);
    const nextDay = new Date('2026-07-04T00:05:00Z');
    expect(await overDailyCap(store, alice, nextDay)).toBe(false);
    expect(store.map.has(capKey(alice, '2026-07-03'))).toBe(true);
    expect(store.map.has(capKey(alice, '2026-07-04'))).toBe(true);
  });

  it('sets a TTL so old day keys self-evict', async () => {
    const store = fakeStore();
    let ttl: number | undefined;
    const spy: CounterStore = {
      get: store.get,
      put: async (k, v, opts) => {
        ttl = opts?.expirationTtl;
        await store.put(k, v);
      },
    };
    await overDailyCap(spy, alice, day);
    expect(ttl).toBeGreaterThan(0);
  });

  it('never blocks when no store is bound (pre-deploy fallback)', async () => {
    for (let i = 0; i < DAILY_CAP + 50; i += 1) {
      expect(await overDailyCap(undefined, alice, day)).toBe(false);
    }
  });
});
