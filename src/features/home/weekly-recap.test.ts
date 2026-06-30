// Weekly recap aggregator tests — pure copy logic, fixed clock. Every event
// carries an explicit createdAtMs relative to a fixed nowMs, so the 7-day window
// is deterministic with no real Date.now().

import { describe, expect, it } from 'vitest';

import { weeklyRecap, type WeeklyRecapInput } from './weekly-recap-logic';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

function base(): WeeklyRecapInput {
  return { nowMs: NOW, activity: [], settlements: [] };
}

describe('weeklyRecap', () => {
  it('returns no lines when the week is empty', () => {
    expect(weeklyRecap(base()).lines).toEqual([]);
  });

  it('counts chores handled and kitchen restocks in the window', () => {
    const { lines } = weeklyRecap({
      ...base(),
      activity: [
        { type: 'chore_done', createdAtMs: NOW - DAY },
        { type: 'chore_done', createdAtMs: NOW - 2 * DAY },
        { type: 'pantry_got', createdAtMs: NOW - 3 * DAY },
      ],
    });
    expect(lines).toContain('2 things got handled');
    expect(lines).toContain('1 kitchen restock');
  });

  it('sums settlement amounts in the window', () => {
    const { lines } = weeklyRecap({
      ...base(),
      settlements: [
        { amountCents: 800, atMs: NOW - DAY },
        { amountCents: 250, atMs: NOW - 4 * DAY },
      ],
    });
    expect(lines).toContain('€10.50 was settled');
  });

  it('ignores events and settlements older than 7 days', () => {
    const { lines } = weeklyRecap({
      ...base(),
      activity: [
        { type: 'chore_done', createdAtMs: NOW - 8 * DAY },
        { type: 'pantry_got', createdAtMs: NOW - 10 * DAY },
      ],
      settlements: [{ amountCents: 500, atMs: NOW - 9 * DAY }],
    });
    expect(lines).toEqual([]);
  });
});
