// Weekly Home Recap — the pure aggregator behind the calm "This week at home"
// card. Looks back over the last 7 days of activity the home already logged and
// settlements already made, and condenses them into a few house-focused, factual
// lines. NOT a scoreboard — never names a person, never "did less", no winners,
// no points. Just a quiet glance at what the home took care of together, and
// NOTHING when the week was empty.
//
// Pure module — no React, no IO, no clock (nowMs is passed in). Relative imports
// only so vitest can resolve it.

import { formatEur } from '../money/money-logic';

const WINDOW_MS = 7 * 86_400_000; // last 7 days

export type WeeklyRecapInput = {
  nowMs: number;
  // Raw activity events; only type + createdAtMs are needed for the recap.
  activity: { type: string; createdAtMs: number; metadata?: unknown }[];
  // Settlements with the amount (cents) and when they happened (ms).
  settlements: { amountCents: number; atMs: number }[];
};

export function weeklyRecap(input: WeeklyRecapInput): { lines: string[] } {
  const since = input.nowMs - WINDOW_MS;
  const inWindowEvents = input.activity.filter((a) => a.createdAtMs >= since);
  const inWindowSettlements = input.settlements.filter((s) => s.atMs >= since);

  const count = (type: string) => inWindowEvents.filter((a) => a.type === type).length;

  const choresHandled = count('chore_done');
  const restocks = count('pantry_got');
  const expensesAdded = count('expense_added');
  const settledCents = inWindowSettlements.reduce((sum, s) => sum + s.amountCents, 0);

  const lines: string[] = [];

  if (choresHandled > 0) {
    lines.push(`${choresHandled} ${choresHandled === 1 ? 'thing' : 'things'} got handled`);
  }
  if (restocks > 0) {
    lines.push(`${restocks} kitchen ${restocks === 1 ? 'restock' : 'restocks'}`);
  }
  if (settledCents > 0) {
    lines.push(`${formatEur(settledCents)} was settled`);
  }
  // Gentle factual extra — neutral, no judgment.
  if (expensesAdded > 0) {
    lines.push(`${expensesAdded} shared ${expensesAdded === 1 ? 'expense' : 'expenses'} logged`);
  }

  return { lines };
}
