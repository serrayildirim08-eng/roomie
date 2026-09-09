import { describe, expect, it } from 'vitest';

import { mapOffCategory, mapOffLabels } from './off-map';

describe('mapOffCategory', () => {
  it('maps sodas to drinks', () => {
    expect(mapOffCategory(['en:beverages', 'en:sodas', 'en:colas'])).toBe('drinks');
  });

  it('maps cheeses to dairy', () => {
    expect(mapOffCategory(['en:dairies', 'en:cheeses'])).toBe('dairy');
  });

  it('maps snacks to snacks', () => {
    expect(mapOffCategory(['en:snacks', 'en:sweet-snacks', 'en:chocolates'])).toBe(
      'snacks',
    );
  });

  it('prefers the most specific matching tag', () => {
    // Generic "groceries" would be pantry, but the specific "dairies" wins.
    expect(mapOffCategory(['en:groceries', 'en:dairies'])).toBe('dairy');
    // Frozen is the specific signal over a generic meat tag.
    expect(mapOffCategory(['en:meats', 'en:frozen-foods'])).toBe('frozen');
  });

  it('maps produce and meat and cleaning', () => {
    expect(mapOffCategory(['en:plant-based-foods', 'en:fresh-vegetables'])).toBe(
      'produce',
    );
    expect(mapOffCategory(['en:meats', 'en:poultry'])).toBe('meat');
    expect(mapOffCategory(['en:cleaning', 'en:detergents'])).toBe('cleaning');
  });

  it('returns null when nothing matches', () => {
    expect(mapOffCategory(['en:mysteries', 'en:unknowable'])).toBeNull();
  });

  it('returns null for empty or missing input', () => {
    expect(mapOffCategory([])).toBeNull();
    expect(mapOffCategory(undefined)).toBeNull();
  });
});

describe('mapOffLabels', () => {
  it('returns vegan + gluten-free in stable order', () => {
    expect(mapOffLabels(['en:gluten-free', 'en:vegan'])).toEqual([
      'vegan',
      'gluten-free',
    ]);
  });

  it('maps no-lactose alias to lactose-free', () => {
    expect(mapOffLabels(['en:no-lactose'])).toEqual(['lactose-free']);
  });

  it('maps no-gluten alias to gluten-free', () => {
    expect(mapOffLabels(['en:no-gluten'])).toEqual(['gluten-free']);
  });

  it('de-dupes overlapping aliases', () => {
    expect(mapOffLabels(['en:gluten-free', 'en:no-gluten'])).toEqual(['gluten-free']);
  });

  it('ignores labels outside the diet set', () => {
    expect(mapOffLabels(['en:organic', 'en:fair-trade', 'en:vegetarian'])).toEqual([
      'vegetarian',
    ]);
  });

  it('returns [] for empty or missing input', () => {
    expect(mapOffLabels([])).toEqual([]);
    expect(mapOffLabels(undefined)).toEqual([]);
  });
});
