import { describe, expect, it } from 'vitest';

import { billDateInMonth, buildMonthGrid, dayTitle, monthTitle, todayKey } from './calendar-logic';

describe('buildMonthGrid', () => {
  it('August 2026 starts on a Saturday → 5 leading neighbor days, 42 cells', () => {
    const grid = buildMonthGrid(2026, 7);
    expect(grid.length % 7).toBe(0);
    expect(grid.filter((c) => c.inMonth).length).toBe(31);
    expect(grid[5]).toEqual({ key: '2026-08-01', day: 1, inMonth: true });
    expect(grid[0].inMonth).toBe(false);
  });
  it('a Monday-first month has no leading filler', () => {
    // June 2026 starts on a Monday.
    const grid = buildMonthGrid(2026, 5);
    expect(grid[0]).toEqual({ key: '2026-06-01', day: 1, inMonth: true });
  });
  it('always whole weeks', () => {
    for (let m = 0; m < 12; m++) expect(buildMonthGrid(2026, m).length % 7).toBe(0);
  });
});

describe('billDateInMonth', () => {
  it('normal day passes through', () => {
    expect(billDateInMonth(15, 2026, 7)).toBe('2026-08-15');
  });
  it('clamps the 31st in February', () => {
    expect(billDateInMonth(31, 2026, 1)).toBe('2026-02-28');
  });
  it('clamps the 31st in a 30-day month', () => {
    expect(billDateInMonth(31, 2026, 8)).toBe('2026-09-30');
  });
});

describe('labels', () => {
  it('month title', () => {
    expect(monthTitle(2026, 7)).toBe('August 2026');
  });
  it('day title', () => {
    expect(dayTitle('2026-08-12')).toBe('Wednesday, Aug 12');
  });
  it('today key format', () => {
    expect(todayKey(new Date(2026, 7, 3, 12).getTime())).toBe('2026-08-03');
  });
});
