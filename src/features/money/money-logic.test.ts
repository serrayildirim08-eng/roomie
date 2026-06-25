// Money math tests — the one place in the app where a wrong number costs real
// euros, so the pure core gets pinned down hard.

import { describe, expect, it } from 'vitest';

import { computeNetCents, parseAmountToCents, simplifyDebts } from './money-logic';

const members = [
  { userId: 'a', name: 'A' },
  { userId: 'b', name: 'B' },
  { userId: 'c', name: 'C' },
];

describe('computeNetCents', () => {
  it('splits an even amount equally', () => {
    const net = computeNetCents(
      members,
      [{ amountCents: 3000, paidById: 'a', participantIds: ['a', 'b', 'c'] }],
      [],
    );
    expect(net).toEqual({ a: 2000, b: -1000, c: -1000 });
  });

  it('spreads remainder pennies without losing a cent', () => {
    const net = computeNetCents(
      members,
      [{ amountCents: 1001, paidById: 'a', participantIds: ['a', 'b'] }],
      [],
    );
    // 1001/2 → shares 501 + 500; the extra cent lands on the FIRST participant
    expect(net.a + net.b + net.c).toBe(0);
    expect(net.a).toBe(1001 - 501); // fronted 1001, own share 501
    expect(net.b).toBe(-500);
  });

  it('€700 / 3 keeps the books balanced (the dogfood case)', () => {
    const net = computeNetCents(
      members,
      [{ amountCents: 70000, paidById: 'c', participantIds: ['a', 'b', 'c'] }],
      [],
    );
    expect(net.a + net.b + net.c).toBe(0);
    expect(net.a).toBe(-23334); // first participant carries the extra cent
    expect(net.b).toBe(-23333);
    expect(net.c).toBe(70000 - 23333);
  });

  it('payer not sharing the expense still gets credited fully', () => {
    const net = computeNetCents(
      members,
      [{ amountCents: 1000, paidById: 'a', participantIds: ['b', 'c'] }],
      [],
    );
    expect(net).toEqual({ a: 1000, b: -500, c: -500 });
  });

  it('settlements clear debt', () => {
    const net = computeNetCents(
      members,
      [{ amountCents: 3000, paidById: 'a', participantIds: ['a', 'b', 'c'] }],
      [{ amountCents: 1000, fromId: 'b', toId: 'a' }],
    );
    expect(net).toEqual({ a: 1000, b: 0, c: -1000 });
  });

  it('keeps a left roommate on the books so no money vanishes', () => {
    // 'ghost' left the home (no membership row) but fronted €9 split three ways.
    // Their €6 credit must survive, or the books stop summing to zero.
    const net = computeNetCents(
      members.slice(0, 2), // only a, b are still active
      [{ amountCents: 900, paidById: 'ghost', participantIds: ['a', 'b', 'ghost'] }],
      [],
    );
    expect(net.a).toBe(-300);
    expect(net.b).toBe(-300);
    expect(net.ghost).toBe(600); // fronted 900, own share 300
    expect(net.a + net.b + net.ghost).toBe(0); // not a single cent lost
  });
});

describe('simplifyDebts', () => {
  it('returns nothing when settled', () => {
    expect(simplifyDebts({ a: 0, b: 0 })).toEqual([]);
  });

  it('produces a minimal payment set that zeroes every balance', () => {
    const net = { a: 2000, b: -1000, c: -1000 };
    const debts = simplifyDebts(net);
    expect(debts).toHaveLength(2);
    const tally: Record<string, number> = { ...net };
    for (const d of debts) {
      tally[d.fromId] += d.amountCents;
      tally[d.toId] -= d.amountCents;
    }
    expect(Object.values(tally).every((v) => v === 0)).toBe(true);
  });

  it('chains one debtor to several creditors', () => {
    const debts = simplifyDebts({ a: 500, b: 700, c: -1200 });
    expect(debts.every((d) => d.fromId === 'c')).toBe(true);
    expect(debts.reduce((s, d) => s + d.amountCents, 0)).toBe(1200);
  });
});

describe('parseAmountToCents', () => {
  it.each([
    ['12,50', 1250],
    ['12.50', 1250],
    ['12', 1200],
    ['0.01', 1],
  ])('parses %s → %d', (input, cents) => {
    expect(parseAmountToCents(input)).toBe(cents);
  });

  it.each(['abc', '', '0', '-5', '12.345', '12,5,0'])('rejects %s', (input) => {
    expect(parseAmountToCents(input)).toBeNull();
  });

  it('rejects an absurd fat-finger amount over the ceiling', () => {
    expect(parseAmountToCents('999999')).toBeNull(); // ~€1M
    expect(parseAmountToCents('10000.01')).toBeNull(); // just over €10k
  });

  it('still accepts a large but real expense', () => {
    expect(parseAmountToCents('2000')).toBe(200000); // €2000 rent share
    expect(parseAmountToCents('10000')).toBe(1000000); // exactly the €10k ceiling
  });
});
