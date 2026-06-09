// Money math — pure functions, no I/O. The Splitwise core: from expenses +
// settlements, work out each person's net balance, then the minimal set of
// "who pays whom". Money is stored in integer cents to avoid float errors.

export type Member = { userId: string; name: string };
export type Expense = { amountCents: number; paidById: string; participantIds: string[] };
export type Settlement = { amountCents: number; fromId: string; toId: string };
export type Debt = { fromId: string; toId: string; amountCents: number };

// net[userId]: positive = the group owes them; negative = they owe the group.
export function computeNetCents(
  members: Member[],
  expenses: Expense[],
  settlements: Settlement[],
): Record<string, number> {
  const net: Record<string, number> = {};
  for (const m of members) net[m.userId] = 0;

  for (const e of expenses) {
    const n = e.participantIds.length;
    if (n === 0) continue;
    const baseShare = Math.floor(e.amountCents / n);
    const remainder = e.amountCents - baseShare * n; // pennies to spread deterministically

    if (e.paidById in net) net[e.paidById] += e.amountCents; // payer fronted the whole amount
    e.participantIds.forEach((pid, idx) => {
      if (pid in net) net[pid] -= baseShare + (idx < remainder ? 1 : 0);
    });
  }

  for (const s of settlements) {
    if (s.fromId in net) net[s.fromId] += s.amountCents; // paying someone back clears your debt
    if (s.toId in net) net[s.toId] -= s.amountCents;
  }

  return net;
}

// Greedy debt minimization → smallest clear set of payments.
export function simplifyDebts(net: Record<string, number>): Debt[] {
  const debtors = Object.entries(net)
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, amt: -v }))
    .sort((a, b) => b.amt - a.amt);
  const creditors = Object.entries(net)
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, amt: v }))
    .sort((a, b) => b.amt - a.amt);

  const debts: Debt[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    if (pay > 0) {
      debts.push({ fromId: debtors[i].id, toId: creditors[j].id, amountCents: pay });
    }
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt === 0) i++;
    if (creditors[j].amt === 0) j++;
  }
  return debts;
}

export function formatEur(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

// "12,50" / "12.50" / "12" → cents. Returns null if not a positive amount.
export function parseAmountToCents(input: string): number | null {
  const normalized = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(parseFloat(normalized) * 100);
  return cents > 0 ? cents : null;
}
