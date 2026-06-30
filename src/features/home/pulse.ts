// Home Pulse — the pure "is our home okay?" summary. Four calm one-liners
// (money / kitchen / chores / today), always from MY point of view: like the
// Money screen, you only ever see what touches you. No scores, no ranking of
// people, no colors-as-grades — just a quiet glance.
//
// Pure module — no React, no IO, no clock. The caller passes `nowMs` so the
// "today" boundary is deterministic in tests (same contract as aging.ts and
// money-logic.ts).

import {
  computeNetCents,
  formatEur,
  simplifyDebts,
  type Expense,
  type Member,
  type Settlement,
} from '../money/money-logic';

export type PulsePantryItem = {
  name: string;
  status: 'in' | 'out';
  // Denormalized claimer name — null/undefined means nobody's grabbing it yet.
  claimedByName?: string | null;
  // Carried for fidelity with the real pantry row; the pulse copy only counts
  // the shopping list, it doesn't age items.
  addedAt?: number;
  shelfLifeDays?: number | null;
};

export type PulseChore = {
  // The effective turn holder, already resolved by the caller (effectiveTurn).
  turnHolderId: string | null;
};

export type PulseInput = {
  myUserId: string;
  members: Member[];
  expenses: Expense[];
  settlements: Settlement[];
  pantry: PulsePantryItem[];
  chores: PulseChore[];
  // createdAt of recent activity events; "today" is counted against nowMs.
  activityCreatedAt: number[];
  nowMs: number;
};

export type PulseSummary = {
  money: string;
  kitchen: string;
  chores: string;
  today: string;
};

// "1 thing" / "3 things" — a gentle count, never a score.
function things(n: number): string {
  return n === 1 ? '1 thing' : `${n} things`;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function pulseSummary(input: PulseInput): PulseSummary {
  const { myUserId, members, expenses, settlements, pantry, chores, activityCreatedAt, nowMs } =
    input;

  const nameById: Record<string, string> = Object.fromEntries(
    members.map((m) => [m.userId, m.name]),
  );

  // --- money: only the debts that touch me ---
  const net = computeNetCents(members, expenses, settlements);
  const myNet = net[myUserId] ?? 0;
  let money: string;
  if (myNet === 0) {
    money = 'Money is clear.';
  } else if (myNet > 0) {
    // Someone owes me — surface the single largest.
    const owed = simplifyDebts(net)
      .filter((d) => d.toId === myUserId)
      .sort((a, b) => b.amountCents - a.amountCents)[0];
    money = owed
      ? `${nameById[owed.fromId] ?? 'Someone'} owes you ${formatEur(owed.amountCents)}.`
      : 'Money is clear.';
  } else {
    // I owe — surface the single largest.
    const owe = simplifyDebts(net)
      .filter((d) => d.fromId === myUserId)
      .sort((a, b) => b.amountCents - a.amountCents)[0];
    money = owe
      ? `You owe ${nameById[owe.toId] ?? 'someone'} ${formatEur(owe.amountCents)}.`
      : 'Money is clear.';
  }

  // --- kitchen: the shopping list ---
  const shopping = pantry.filter((p) => p.status === 'out');
  let kitchen: string;
  if (shopping.length === 0) {
    kitchen = "Pantry's stocked 🌿";
  } else {
    const claimed = shopping.find((p) => p.claimedByName);
    kitchen = claimed
      ? `${claimed.claimedByName} is getting the ${claimed.name}.`
      : `${things(shopping.length)} to grab next run.`;
  }

  // --- chores: only my turn ---
  const myTurn = chores.filter((c) => c.turnHolderId === myUserId).length;
  const choresLine = myTurn === 0 ? 'All caught up 🌿' : `It's your turn for ${things(myTurn)}.`;

  // --- today: what got handled, against the start of today ---
  const since = startOfDay(nowMs);
  const todayCount = activityCreatedAt.filter((t) => t >= since).length;
  const calm = myNet === 0 && shopping.length === 0 && myTurn === 0;
  let today: string;
  if (todayCount > 0) {
    today = `${things(todayCount)} got handled today.`;
  } else if (calm) {
    today = 'Home feels okay. 🌿';
  } else {
    today = 'Quiet so far today.';
  }

  return { money, kitchen, chores: choresLine, today };
}
