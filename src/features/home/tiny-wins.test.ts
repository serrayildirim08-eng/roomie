// Tiny wins picker tests — the pure copy logic. No clock, no IO: every input is
// already resolved (names, turns, aging), so each case is deterministic.

import { describe, expect, it } from 'vitest';

import { pickTinyWins, type TinyWinsInput } from './tiny-wins-logic';

function base(): TinyWinsInput {
  return {
    myUserId: 'me',
    chores: [],
    shopping: [],
    myDebts: [],
    agingPantry: [],
  };
}

describe('pickTinyWins', () => {
  it('returns nothing when there are no tiny wins', () => {
    expect(pickTinyWins(base())).toEqual([]);
  });

  it('surfaces a chore on my turn', () => {
    const wins = pickTinyWins({
      ...base(),
      chores: [
        { name: 'Dishes', turnHolderId: 'me' },
        { name: 'Trash', turnHolderId: 'b' },
      ],
    });
    expect(wins).toContainEqual({ icon: '🧹', text: 'Mark Dishes done' });
  });

  it('ignores chores that are not my turn', () => {
    const wins = pickTinyWins({ ...base(), chores: [{ name: 'Trash', turnHolderId: 'b' }] });
    expect(wins).toEqual([]);
  });

  it('surfaces an unclaimed shopping item, skipping claimed ones', () => {
    const wins = pickTinyWins({
      ...base(),
      shopping: [
        { name: 'milk', claimedByName: 'Bea' },
        { name: 'eggs', claimedByName: null },
      ],
    });
    expect(wins).toContainEqual({ icon: '🧺', text: 'Claim the eggs' });
  });

  it('surfaces the smallest balance I owe', () => {
    const wins = pickTinyWins({
      ...base(),
      myDebts: [
        { toName: 'Bea', amountCents: 800 },
        { toName: 'Sam', amountCents: 250 },
      ],
    });
    expect(wins).toContainEqual({ icon: '💶', text: 'Settle €2.50 with Sam' });
  });

  it('caps at three tiny wins even when every category applies', () => {
    const wins = pickTinyWins({
      myUserId: 'me',
      chores: [{ name: 'Dishes', turnHolderId: 'me' }],
      shopping: [{ name: 'eggs', claimedByName: null }],
      myDebts: [{ toName: 'Sam', amountCents: 250 }],
      agingPantry: [{ name: 'yogurt' }],
    });
    expect(wins).toHaveLength(3);
  });
});
