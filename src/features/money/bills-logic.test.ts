import { describe, expect, it } from 'vitest';

import { daysUntilDue, dueDayLabel, monthlyTotalCents, periodOf } from './bills-logic';

const ms = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();

describe('periodOf', () => {
  it('formats YYYY-MM with zero padding', () => {
    expect(periodOf(ms(2026, 8, 3))).toBe('2026-08');
    expect(periodOf(ms(2026, 12, 31))).toBe('2026-12');
  });
});

describe('daysUntilDue', () => {
  it('is 0 on the due day itself', () => {
    expect(daysUntilDue(3, ms(2026, 8, 3))).toBe(0);
  });
  it('counts forward within the month', () => {
    expect(daysUntilDue(15, ms(2026, 8, 3))).toBe(12);
  });
  it('rolls to next month when the day has passed', () => {
    expect(daysUntilDue(1, ms(2026, 8, 3))).toBe(29); // Sep 1 from Aug 3
  });
  it('clamps the 31st in short months (the Feb-28 bank rule)', () => {
    expect(daysUntilDue(31, ms(2026, 2, 27))).toBe(1); // Feb 2026 has 28 days
  });
});

describe('dueDayLabel', () => {
  it('ordinals', () => {
    expect(dueDayLabel(1)).toBe('1st');
    expect(dueDayLabel(2)).toBe('2nd');
    expect(dueDayLabel(3)).toBe('3rd');
    expect(dueDayLabel(11)).toBe('11th');
    expect(dueDayLabel(12)).toBe('12th');
    expect(dueDayLabel(13)).toBe('13th');
    expect(dueDayLabel(21)).toBe('21st');
    expect(dueDayLabel(15)).toBe('15th');
  });
});

describe('monthlyTotalCents', () => {
  it('sums', () => {
    expect(monthlyTotalCents([{ amountCents: 120000 }, { amountCents: 4500 }])).toBe(124500);
  });
});
