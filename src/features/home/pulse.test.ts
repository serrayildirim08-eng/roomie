// Home Pulse summary tests — the pure copy logic. A fixed `nowMs` (local noon)
// keeps the "today" boundary deterministic across timezones.

import { describe, expect, it } from 'vitest';

import { pulseSummary, type PulseInput } from './pulse';

// Local noon, July 1 2026 — built numerically so start-of-day is the same
// local midnight regardless of the test runner's timezone.
const NOW = new Date(2026, 6, 1, 12, 0, 0).getTime();
const DAY = 86_400_000;

const members = [
  { userId: 'me', name: 'Me' },
  { userId: 'b', name: 'Bea' },
];

function base(): PulseInput {
  return {
    myUserId: 'me',
    members,
    expenses: [],
    settlements: [],
    pantry: [],
    chores: [],
    activityCreatedAt: [],
    nowMs: NOW,
  };
}

describe('pulseSummary', () => {
  it('reads calm when all-square, stocked, caught-up and nothing today', () => {
    const out = pulseSummary(base());
    expect(out.money).toBe('Money is clear.');
    expect(out.kitchen).toBe("Pantry's stocked 🌿");
    expect(out.chores).toBe('All caught up 🌿');
    expect(out.today).toBe('Home feels okay. 🌿');
  });

  it('shows the largest single debt when someone owes me', () => {
    const out = pulseSummary({
      ...base(),
      // I paid €10, split with Bea → Bea owes me €5.
      expenses: [{ amountCents: 1000, paidById: 'me', participantIds: ['me', 'b'] }],
    });
    expect(out.money).toBe('Bea owes you €5.00.');
  });

  it('shows who I owe when I owe', () => {
    const out = pulseSummary({
      ...base(),
      // Bea paid €10, split with me → I owe Bea €5.
      expenses: [{ amountCents: 1000, paidById: 'b', participantIds: ['me', 'b'] }],
    });
    expect(out.money).toBe('You owe Bea €5.00.');
  });

  it('names who is getting a claimed shopping item', () => {
    const out = pulseSummary({
      ...base(),
      pantry: [{ name: 'milk', status: 'out', claimedByName: 'Bea' }],
    });
    expect(out.kitchen).toBe('Bea is getting the milk.');
  });

  it('counts unclaimed shopping items', () => {
    const out = pulseSummary({
      ...base(),
      pantry: [
        { name: 'milk', status: 'out' },
        { name: 'eggs', status: 'out' },
        { name: 'rice', status: 'in' },
      ],
    });
    expect(out.kitchen).toBe('2 things to grab next run.');
  });

  it('counts my turn for chores', () => {
    const out = pulseSummary({
      ...base(),
      chores: [
        { turnHolderId: 'me' },
        { turnHolderId: 'b' },
        { turnHolderId: 'me' },
      ],
    });
    expect(out.chores).toBe("It's your turn for 2 things.");
  });

  it('counts what got handled today, ignoring older events', () => {
    const out = pulseSummary({
      ...base(),
      activityCreatedAt: [NOW - 1000, NOW - 2000, NOW - 3000, NOW - 3 * DAY],
    });
    expect(out.today).toBe('3 things got handled today.');
  });

  it('uses singular for a single thing handled today', () => {
    const out = pulseSummary({
      ...base(),
      activityCreatedAt: [NOW - 1000],
    });
    expect(out.today).toBe('1 thing got handled today.');
  });

  it('stays quiet without claiming calm when the home is not all-square', () => {
    const out = pulseSummary({
      ...base(),
      chores: [{ turnHolderId: 'me' }],
    });
    expect(out.today).toBe('Quiet so far today.');
  });
});
