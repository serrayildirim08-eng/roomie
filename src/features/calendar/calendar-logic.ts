// Calendar math — pure functions, no I/O. Monday-first month grid, plus the
// bill-due derivation (dueDay clamped to short months, the Feb-28 bank rule —
// same convention as bills-logic.daysUntilDue).

export type DayCell = {
  key: string; // 'YYYY-MM-DD'
  day: number; // 1–31 (of ITS month, which may be the neighbor month)
  inMonth: boolean;
};

export function dateKey(y: number, m0: number, d: number): string {
  return `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function todayKey(nowMsVal: number): string {
  const d = new Date(nowMsVal);
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

// Full weeks covering the month, Monday-first. Always a multiple of 7 cells;
// leading/trailing neighbor days carry inMonth: false.
export function buildMonthGrid(year: number, month0: number): DayCell[] {
  const first = new Date(year, month0, 1);
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // JS Sunday=0 → Monday-first offset
  const cells: DayCell[] = [];
  for (let i = lead; i > 0; i--) {
    const d = new Date(year, month0, 1 - i);
    cells.push({ key: dateKey(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ key: dateKey(year, month0, d), day: d, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    const dt = new Date(last.key);
    dt.setDate(dt.getDate() + 1);
    cells.push({ key: dateKey(dt.getFullYear(), dt.getMonth(), dt.getDate()), day: dt.getDate(), inMonth: false });
  }
  return cells;
}

// The 'YYYY-MM-DD' a bill lands on in a given month — dueDay clamped to the
// month's last day (the 31st in February is the 28th).
export function billDateInMonth(dueDay: number, year: number, month0: number): string {
  const lastDay = new Date(year, month0 + 1, 0).getDate();
  return dateKey(year, month0, Math.min(dueDay, lastDay));
}

export function monthTitle(year: number, month0: number): string {
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${MONTHS[month0]} ${year}`;
}

// "Wednesday, Aug 12" — the day card heading.
export function dayTitle(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${DOW[dt.getDay()]}, ${MON[dt.getMonth()]} ${dt.getDate()}`;
}
