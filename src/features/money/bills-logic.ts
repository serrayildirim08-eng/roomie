// Bills math — pure functions, no I/O. A bill is a monthly TEMPLATE; "Paid"
// stamps an ordinary expense, so nothing here touches balances.

// 'YYYY-MM' for the month containing `nowMsVal` (local time — a bill is a
// household concept, and the household lives in one timezone).
export function periodOf(nowMsVal: number): string {
  const d = new Date(nowMsVal);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Whole days until the bill's next due date (0 = today). dueDay past the end
// of a short month clamps to that month's last day (the 31st of February is
// February 28th — banks do the same).
export function daysUntilDue(dueDay: number, nowMsVal: number): number {
  const now = new Date(nowMsVal);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const clamp = (y: number, m: number) => {
    const lastDay = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(dueDay, lastDay));
  };
  let due = clamp(today.getFullYear(), today.getMonth());
  if (due < today) due = clamp(today.getFullYear(), today.getMonth() + 1);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

// "1st" / "2nd" / "3rd" / "15th"
export function dueDayLabel(dueDay: number): string {
  const suffix =
    dueDay % 10 === 1 && dueDay !== 11
      ? 'st'
      : dueDay % 10 === 2 && dueDay !== 12
        ? 'nd'
        : dueDay % 10 === 3 && dueDay !== 13
          ? 'rd'
          : 'th';
  return `${dueDay}${suffix}`;
}

export function monthlyTotalCents(bills: { amountCents: number }[]): number {
  return bills.reduce((sum, b) => sum + b.amountCents, 0);
}
