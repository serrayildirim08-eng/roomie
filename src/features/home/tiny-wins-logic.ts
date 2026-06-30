// Tiny wins — the pure picker behind the calm "quick things that help" card.
// Up to 3 two-minute actions, pulled from data the home already has: a chore on
// MY turn, an unclaimed shopping item, the smallest balance I owe, an aging
// pantry item. NOT a challenge — no points, no ranking, no scoreboard. Just a
// few quiet suggestions, and NOTHING when there's nothing tiny to do.
//
// Pure module — no React, no IO, no clock. The caller resolves names, turns and
// aging first, so this stays trivially testable (relative imports only).

import { formatEur } from '../money/money-logic';

export type TinyWin = { icon: string; text: string };

export type TinyWinsInput = {
  myUserId: string;
  // Chores with their effective turn holder already resolved (effectiveTurn).
  chores: { name: string; turnHolderId: string | null }[];
  // Shopping list (status 'out'); claimer resolved to a name, null = unclaimed.
  shopping: { name: string; claimedByName: string | null }[];
  // Debts I owe, each with the payee's name + cents (from simplifyDebts).
  myDebts: { toName: string; amountCents: number }[];
  // In-pantry items the caller has judged past-fresh (ageOf !== 'fresh').
  agingPantry: { name: string }[];
};

// One candidate per category keeps the card varied; we collect in a calm
// priority order and never show more than three.
export function pickTinyWins(input: TinyWinsInput): TinyWin[] {
  const wins: TinyWin[] = [];

  // A chore on my turn — one quick "done".
  const myChore = input.chores.find((c) => c.turnHolderId === input.myUserId);
  if (myChore) wins.push({ icon: '🧹', text: `Mark ${myChore.name} done` });

  // An unclaimed shopping item — grab it so nobody double-buys.
  const unclaimed = input.shopping.find((s) => !s.claimedByName);
  if (unclaimed) wins.push({ icon: '🧺', text: `Claim the ${unclaimed.name}` });

  // The smallest balance I owe — the easiest one to clear.
  const smallestDebt = [...input.myDebts].sort((a, b) => a.amountCents - b.amountCents)[0];
  if (smallestDebt) {
    wins.push({
      icon: '💶',
      text: `Settle ${formatEur(smallestDebt.amountCents)} with ${smallestDebt.toName}`,
    });
  }

  // An aging pantry item — a quiet nudge to move it to the shopping list.
  const aging = input.agingPantry[0];
  if (aging) wins.push({ icon: '🫙', text: `Mark ${aging.name} out` });

  return wins.slice(0, 3);
}
