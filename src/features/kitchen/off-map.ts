// Pure mapping from Open Food Facts taxonomy tags to Roomie's own vocabulary.
// No React, no I/O — just string → enum, so it's trivially testable and shared
// between the scan flow and any future importer.
//
// OFF hands back two tag lists, both ordered general → specific:
//   categories_tags: ['en:beverages','en:sodas','en:colas']
//   labels_tags:     ['en:vegetarian','en:vegan','en:gluten-free']
// We collapse categories to ONE Roomie GroceryCategory (most specific wins),
// and filter labels down to the four diet flags a shared kitchen cares about.

import type { GroceryCategory } from './alias-data';

export type DietTag = 'vegan' | 'vegetarian' | 'gluten-free' | 'lactose-free';

// Ordered rules, checked per tag. Order only matters when a single tag string
// contains more than one signal (e.g. "ice-cream" carries both frozen + cream);
// the earlier rule wins, so the stronger/clearer signal is listed first.
const CATEGORY_RULES: { keywords: string[]; category: GroceryCategory }[] = [
  { keywords: ['frozen', 'ice-cream'], category: 'frozen' },
  {
    keywords: [
      'beverage',
      'soda',
      'water',
      'juice',
      'energy-drink',
      'tea',
      'coffee',
      'alcoholic',
      'cola',
      'lemonade',
    ],
    category: 'drinks',
  },
  {
    keywords: ['dair', 'milk', 'cheese', 'yogurt', 'yoghurt', 'butter', 'cream'],
    category: 'dairy',
  },
  { keywords: ['charcuterie', 'cold-cut', 'ham', 'deli', 'salami'], category: 'deli' },
  {
    keywords: ['meat', 'poultry', 'beef', 'pork', 'chicken', 'fish', 'seafood', 'lamb'],
    category: 'meat',
  },
  {
    keywords: [
      'snack',
      'chip',
      'crisp',
      'biscuit',
      'chocolate',
      'candy',
      'candies',
      'cookie',
      'cracker',
    ],
    category: 'snacks',
  },
  { keywords: ['fruit', 'vegetable', 'fresh-', 'produce'], category: 'produce' },
  { keywords: ['cleaning', 'detergent'], category: 'cleaning' },
  {
    keywords: [
      'grocer',
      'sauce',
      'condiment',
      'canned',
      'pasta',
      'rice',
      'cereal',
      'breakfast',
      'spread',
      'oil',
    ],
    category: 'pantry',
  },
];

// Strip the OFF language prefix ("en:", "fr:", …) and lowercase.
function normalizeTag(tag: string): string {
  const idx = tag.indexOf(':');
  return (idx === -1 ? tag : tag.slice(idx + 1)).toLowerCase();
}

// Match a keyword against a tag WORD-wise, not as a raw substring — otherwise
// "cola" would match "cho-cola-te" and "gorgon-zola" (chocolate/gorgonzola →
// drinks). Multi-word keywords (e.g. "energy-drink", "ice-cream") stay as a
// substring test since they're specific enough to be safe.
function keywordMatches(tag: string, keyword: string): boolean {
  if (keyword.includes('-')) return tag.includes(keyword);
  return tag.split('-').some((word) => word.startsWith(keyword));
}

/**
 * Map OFF category tags to one Roomie GroceryCategory. Tags arrive general →
 * specific, so we walk them from the most specific end and return the first
 * category that matches — a specific "cheeses" beats a generic "groceries".
 * Returns null when nothing matches (caller keeps its own default).
 */
export function mapOffCategory(
  categoriesTags: string[] | undefined,
): GroceryCategory | null {
  if (!categoriesTags?.length) return null;
  for (let i = categoriesTags.length - 1; i >= 0; i--) {
    const tag = normalizeTag(categoriesTags[i]);
    for (const rule of CATEGORY_RULES) {
      if (rule.keywords.some((k) => keywordMatches(tag, k))) return rule.category;
    }
  }
  return null;
}

const LABEL_TO_DIET: { keys: string[]; tag: DietTag }[] = [
  { keys: ['en:vegan'], tag: 'vegan' },
  { keys: ['en:vegetarian'], tag: 'vegetarian' },
  { keys: ['en:gluten-free', 'en:no-gluten'], tag: 'gluten-free' },
  { keys: ['en:lactose-free', 'en:no-lactose'], tag: 'lactose-free' },
];

/**
 * Filter OFF label tags down to the four diet flags Roomie surfaces. De-duped
 * and returned in a stable order (vegan, vegetarian, gluten-free, lactose-free)
 * regardless of the order OFF listed them. Empty/undefined → [].
 */
export function mapOffLabels(labelsTags: string[] | undefined): DietTag[] {
  if (!labelsTags?.length) return [];
  const present = new Set(labelsTags.map((t) => t.toLowerCase()));
  const out: DietTag[] = [];
  for (const { keys, tag } of LABEL_TO_DIET) {
    if (keys.some((k) => present.has(k))) out.push(tag);
  }
  return out;
}
