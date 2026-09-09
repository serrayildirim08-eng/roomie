import { describe, expect, it } from 'vitest';
import {
  areaLabel,
  choreSoftState,
  effortLabel,
  inferAreaFromGroup,
  softStateLabel,
} from './chore-state';

const NOW = 1_700_000_000_000; // fixed clock for deterministic boundaries
const DAY = 86_400_000;

describe('choreSoftState', () => {
  it('returns snoozed when now is before snoozedUntil', () => {
    expect(
      choreSoftState({
        cadenceDays: 7,
        lastActivityAtMs: NOW - 30 * DAY, // would otherwise be needs_attention
        snoozedUntilMs: NOW + DAY,
        nowMs: NOW,
      }),
    ).toBe('snoozed');
  });

  it('ignores a snooze that has already elapsed', () => {
    expect(
      choreSoftState({
        cadenceDays: 7,
        lastActivityAtMs: NOW - DAY,
        snoozedUntilMs: NOW - DAY, // past
        nowMs: NOW,
      }),
    ).toBe('all_good');
  });

  it('returns all_good when there is no cadence (no signal)', () => {
    expect(choreSoftState({ lastActivityAtMs: NOW - 99 * DAY, nowMs: NOW })).toBe('all_good');
    expect(choreSoftState({ cadenceDays: null, nowMs: NOW })).toBe('all_good');
    expect(choreSoftState({ cadenceDays: 0, nowMs: NOW })).toBe('all_good');
    expect(choreSoftState({ cadenceDays: -3, nowMs: NOW })).toBe('all_good');
    expect(choreSoftState({ cadenceDays: Infinity, nowMs: NOW })).toBe('all_good');
  });

  it('treats missing lastActivity as "just now" → all_good', () => {
    expect(choreSoftState({ cadenceDays: 7, nowMs: NOW })).toBe('all_good');
  });

  it('returns all_good below 0.75x cadence', () => {
    expect(
      choreSoftState({ cadenceDays: 8, lastActivityAtMs: NOW - 5 * DAY, nowMs: NOW }),
    ).toBe('all_good'); // 5/8 = 0.625
  });

  it('returns coming_up in the [0.75x, 1.0x) band', () => {
    // exactly 0.75x boundary
    expect(
      choreSoftState({ cadenceDays: 8, lastActivityAtMs: NOW - 6 * DAY, nowMs: NOW }),
    ).toBe('coming_up'); // 6/8 = 0.75
    // mid band
    expect(
      choreSoftState({ cadenceDays: 8, lastActivityAtMs: NOW - 7 * DAY, nowMs: NOW }),
    ).toBe('coming_up'); // 7/8 = 0.875
  });

  it('returns needs_attention at exactly the cadence boundary', () => {
    expect(
      choreSoftState({ cadenceDays: 7, lastActivityAtMs: NOW - 7 * DAY, nowMs: NOW }),
    ).toBe('needs_attention'); // 7/7 = 1.0
  });

  it('returns needs_attention beyond the cadence', () => {
    expect(
      choreSoftState({ cadenceDays: 7, lastActivityAtMs: NOW - 20 * DAY, nowMs: NOW }),
    ).toBe('needs_attention');
  });
});

describe('softStateLabel', () => {
  it('shows no hint for all_good', () => {
    expect(softStateLabel('all_good')).toBeNull();
  });

  it('uses soft, no-shame wording', () => {
    expect(softStateLabel('coming_up')).toBe('Coming up');
    expect(softStateLabel('needs_attention')).toBe('Could use attention');
    expect(softStateLabel('snoozed')).toBe('Resting');
  });
});

describe('areaLabel', () => {
  it('labels known areas', () => {
    expect(areaLabel('kitchen')).toBe('Kitchen');
    expect(areaLabel('trash')).toBe('Trash & recycling');
  });

  it('returns null for unknown or null', () => {
    expect(areaLabel('nonsense')).toBeNull();
    expect(areaLabel(null)).toBeNull();
    expect(areaLabel(undefined)).toBeNull();
  });
});

describe('effortLabel', () => {
  it('labels known efforts', () => {
    expect(effortLabel('tiny')).toBe('Tiny');
    expect(effortLabel('normal')).toBe('Normal');
    expect(effortLabel('big')).toBe('Bigger reset');
  });

  it('returns null for unknown or null', () => {
    expect(effortLabel('huge')).toBeNull();
    expect(effortLabel(null)).toBeNull();
    expect(effortLabel(undefined)).toBeNull();
  });
});

describe('inferAreaFromGroup', () => {
  it('maps library group names to area keys', () => {
    expect(inferAreaFromGroup('Kitchen')).toBe('kitchen');
    expect(inferAreaFromGroup('Bathroom')).toBe('bathroom');
    expect(inferAreaFromGroup('Floors & living room')).toBe('living');
    expect(inferAreaFromGroup('Trash & recycling')).toBe('trash');
    expect(inferAreaFromGroup('Other')).toBe('other');
  });

  it('falls back to other for unknown groups', () => {
    expect(inferAreaFromGroup('Garage')).toBe('other');
    expect(inferAreaFromGroup('')).toBe('other');
  });
});
