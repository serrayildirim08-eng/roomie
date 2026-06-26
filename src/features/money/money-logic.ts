// Money math — pure functions, no I/O. The Splitwise core: from expenses +
// settlements, work out each person's net balance, then the minimal set of
// "who pays whom". Money is stored in integer cents to avoid float errors.

export type Member = { userId: string; name: string };
export type Expense = { amountCents: number; paidById: string; participantIds: string[] };
export type Settlement = { amountCents: number; fromId: string; toId: string };
export type Debt = { fromId: string; toId: string; amountCents: number };

// net[userId]: positive = the group owes them; negative = they owe the group.
//
// Anyone who appears in an expense or settlement is tracked — NOT just the
// active members passed in. A roommate who has left the home still fronted (or
// owes) real money, so dropping them would make euros silently vanish and the
// books stop summing to zero. `members` only seeds active people who have no
// activity yet so they render as "all square".
export function computeNetCents(
  members: Member[],
  expenses: Expense[],
  settlements: Settlement[],
): Record<string, number> {
  const net: Record<string, number> = {};
  const track = (userId: string) => {
    if (userId && !(userId in net)) net[userId] = 0;
  };
  for (const m of members) track(m.userId);

  for (const e of expenses) {
    const n = e.participantIds.length;
    if (n === 0) continue;
    track(e.paidById);
    e.participantIds.forEach(track);

    const baseShare = Math.floor(e.amountCents / n);
    const remainder = e.amountCents - baseShare * n; // pennies to spread deterministically

    net[e.paidById] += e.amountCents; // payer fronted the whole amount
    e.participantIds.forEach((pid, idx) => {
      net[pid] -= baseShare + (idx < remainder ? 1 : 0);
    });
  }

  for (const s of settlements) {
    track(s.fromId);
    track(s.toId);
    net[s.fromId] += s.amountCents; // paying someone back clears your debt
    net[s.toId] -= s.amountCents;
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

// Module-level so the React Compiler purity lint doesn't flag Date.now() inside
// component-scope handlers.
export const nowMs = (): number => Date.now();

// Sanity ceiling on a single expense: €10,000. Stops a fat-finger like
// "999999" (~€1M) from corrupting the shared ledger, while still allowing a
// real big-ticket cost (rent, a deposit). The worker enforces its own AI cap;
// this guards the manual + inline-edit paths.
export const MAX_EXPENSE_CENTS = 1_000_000;

// "12,50" / "12.50" / "12" → cents. Returns null if not a positive amount
// within the sanity ceiling.
export function parseAmountToCents(input: string): number | null {
  const normalized = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(parseFloat(normalized) * 100);
  if (cents <= 0 || cents > MAX_EXPENSE_CENTS) return null;
  return cents;
}
