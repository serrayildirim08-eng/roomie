// Chore soft-state machine — pure functions, no React, no IO, no clock.
// Caller passes `nowMs` so tests can exercise every boundary deterministically.
//
// Mirrors the Kitchen aging philosophy (aging.ts): "null shelf life → fresh
// forever; silence wins." A chore with no cadence emits no signal at all —
// we'd rather say nothing than nag. There is no "late", no countdown, no
// scoreboard. Soft framing only.
//
// Bands on `elapsedDays = (nowMs − lastActivityAtMs) / day`, relative to the
// soft cadence:
//
//   elapsed < 0.75 × cadence  → all_good       (no hint shown)
//   0.75 × cadence ≤ … < 1.0  → coming_up
//   1.0 × cadence ≤ …         → needs_attention
//
// A chore at exactly the cadence (elapsed === cadence) graduates to the next
// state — 'needs_attention'. A snooze ("resting until") wins over everything.

export type ChoreSoftState = 'all_good' | 'coming_up' | 'needs_attention' | 'snoozed';

const MS_PER_DAY = 86_400_000;

/**
 * Decide which soft band a chore sits in. Unknown/zero cadence means "no
 * signal" → always 'all_good'. An active snooze wins over the cadence bands.
 */
export function choreSoftState(input: {
  cadenceDays?: number | null;
  lastActivityAtMs?: number | null;
  snoozedUntilMs?: number | null;
  nowMs: number;
}): ChoreSoftState {
  const { cadenceDays, lastActivityAtMs, snoozedUntilMs, nowMs } = input;

  // Resting until — soft pause beats any cadence signal.
  if (snoozedUntilMs != null && nowMs < snoozedUntilMs) return 'snoozed';

  // No cadence → no due signal at all (silence wins).
  if (cadenceDays == null || !Number.isFinite(cadenceDays) || cadenceDays <= 0) {
    return 'all_good';
  }

  const elapsedDays = (nowMs - (lastActivityAtMs ?? nowMs)) / MS_PER_DAY;
  if (elapsedDays < cadenceDays * 0.75) return 'all_good';
  if (elapsedDays < cadenceDays * 1.0) return 'coming_up';
  return 'needs_attention';
}

/**
 * Human hint for a soft state. 'all_good' shows nothing (null) — no news is
 * good news. No harsh words: "Could use attention", never "late"/"overdue".
 */
export function softStateLabel(s: ChoreSoftState): string | null {
  switch (s) {
    case 'all_good':
      return null;
    case 'coming_up':
      return 'Coming up';
    case 'needs_attention':
      return 'Could use attention';
    case 'snoozed':
      return 'Resting';
  }
}

export const AREAS = [
  'kitchen',
  'bathroom',
  'living',
  'trash',
  'admin',
  'supplies',
  'other',
] as const;

const AREA_LABELS: Record<(typeof AREAS)[number], string> = {
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  living: 'Living room',
  trash: 'Trash & recycling',
  admin: 'Admin',
  supplies: 'Supplies',
  other: 'Other',
};

/** Friendly label for an area key. Unknown/null → null (show nothing). */
export function areaLabel(a?: string | null): string | null {
  if (a == null) return null;
  return AREA_LABELS[a as (typeof AREAS)[number]] ?? null;
}

export const EFFORTS = ['tiny', 'normal', 'big'] as const;

const EFFORT_LABELS: Record<(typeof EFFORTS)[number], string> = {
  tiny: 'Tiny',
  normal: 'Normal',
  big: 'Bigger reset',
};

/** Friendly label for an effort key. Unknown/null → null. */
export function effortLabel(e?: string | null): string | null {
  if (e == null) return null;
  return EFFORT_LABELS[e as (typeof EFFORTS)[number]] ?? null;
}

/**
 * Map a CHORE_LIBRARY group name to an area key. Anything we don't recognize
 * falls back to 'other' (a safe, signal-free bucket).
 */
export function inferAreaFromGroup(
  group: string,
): 'kitchen' | 'bathroom' | 'living' | 'trash' | 'admin' | 'supplies' | 'other' {
  switch (group) {
    case 'Kitchen':
      return 'kitchen';
    case 'Bathroom':
      return 'bathroom';
    case 'Floors & living room':
      return 'living';
    case 'Trash & recycling':
      return 'trash';
    case 'Other':
      return 'other';
    default:
      return 'other';
  }
}
