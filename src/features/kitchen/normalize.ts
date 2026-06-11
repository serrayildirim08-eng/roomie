// Vendored from Ollie (packages/logic/src/grocery/parse.ts + util levenshtein)
// on 2026-06-11, trimmed for manual entry: Roomie's Kitchen v1 has no brain
// dump, so the intent/quantity parsing stayed in Ollie — only the item-name
// normalizer travels. Pure functions, no I/O, no wall-clock reads.

import { ALIAS_TABLE, SORTED_ALIASES } from './alias-data';
import type { GroceryCategory } from './alias-data';

export interface NormalizeResult {
  canonical: string | null;
  confidence: 'high' | 'medium' | 'low';
  method: 'exact' | 'alias' | 'prefix' | 'edit' | 'fail';
}

// ─── String helpers ──────────────────────────────────────────────────────

const TR_FOLD: Record<string, string> = {
  ı: 'i',
  İ: 'i',
  ş: 's',
  Ş: 's',
  ç: 'c',
  Ç: 'c',
  ğ: 'g',
  Ğ: 'g',
  ö: 'o',
  Ö: 'o',
  ü: 'u',
  Ü: 'u',
};

export function foldDiacritics(s: string): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/[ıİşŞçÇğĞöÖüÜ]/g, (ch) => TR_FOLD[ch] ?? ch)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function stripPlural(s: string): string {
  if (!s) return s;
  if (/ies$/.test(s) && s.length > 4) return s.replace(/ies$/, 'y');
  if (/(?:[^aeiou]es|sses|shes|ches)$/.test(s)) return s.replace(/es$/, '');
  if (/s$/.test(s) && !/ss$/.test(s) && s.length > 3) return s.replace(/s$/, '');
  if (/(ler|lar)$/.test(s) && s.length > 4) return s.replace(/(ler|lar)$/, '');
  return s;
}

// Band-limited Levenshtein, capped: distances beyond `cap` return cap + 1.
export function levenshtein(a: string, b: string, cap = Infinity): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > cap) return cap + 1;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > cap) return cap + 1;
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n];
}

// ─── Item normaliser ─────────────────────────────────────────────────────
// "Sütt" → {canonical: 'milk'} via exact → singular → prefix → edit-distance.

export function normalizeItemName(rawText: string): NormalizeResult {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return { canonical: null, confidence: 'low', method: 'fail' };
  }
  const s = foldDiacritics(rawText.toLowerCase()).replace(/\s+/g, ' ').trim();
  if (!s) return { canonical: null, confidence: 'low', method: 'fail' };

  // Exact alias match
  for (let i = 0; i < SORTED_ALIASES.length; i++) {
    if (foldDiacritics(SORTED_ALIASES[i][0]) === s) {
      return { canonical: SORTED_ALIASES[i][1], confidence: 'high', method: 'exact' };
    }
  }

  // Singular form match
  const sSing = stripPlural(s);
  if (sSing !== s) {
    for (let i = 0; i < SORTED_ALIASES.length; i++) {
      if (foldDiacritics(SORTED_ALIASES[i][0]) === sSing) {
        return { canonical: SORTED_ALIASES[i][1], confidence: 'high', method: 'alias' };
      }
    }
  }

  // Multi-word prefix match
  for (let i = 0; i < SORTED_ALIASES.length; i++) {
    const row = SORTED_ALIASES[i];
    if (row[2] < 2) break;
    const alFolded = foldDiacritics(row[0]);
    if (s === alFolded || s.startsWith(alFolded + ' ')) {
      return { canonical: row[1], confidence: 'medium', method: 'prefix' };
    }
  }

  // Single-token prefix match
  const tokens = s.split(/\s+/);
  for (const tok of tokens) {
    const tokSing = stripPlural(tok);
    for (let i = 0; i < SORTED_ALIASES.length; i++) {
      const row = SORTED_ALIASES[i];
      if (row[2] !== 1) continue;
      const alFolded = foldDiacritics(row[0]);
      if (tokSing === alFolded || tok === alFolded) {
        return { canonical: row[1], confidence: 'medium', method: 'prefix' };
      }
    }
  }

  // Edit-distance fallback
  let best: { d: number; canon: string } | null = null;
  for (let i = 0; i < SORTED_ALIASES.length; i++) {
    const row = SORTED_ALIASES[i];
    const alFolded = foldDiacritics(row[0]);
    if (alFolded.length > 12 || alFolded.includes(' ')) continue;
    const d = levenshtein(s, alFolded, 2);
    if (d <= 2 && (!best || d < best.d)) best = { d, canon: row[1] };
  }
  if (best) return { canonical: best.canon, confidence: 'low', method: 'edit' };

  return { canonical: null, confidence: 'low', method: 'fail' };
}

// What Kitchen actually stores for a typed name: canonical when known,
// otherwise the cleaned-up raw text (unknown items are first-class too).
export function resolveItem(rawText: string): {
  name: string;
  normalizedName: string;
  category: GroceryCategory;
  shelfLifeDays: number | null;
} {
  const raw = rawText.trim().replace(/\s+/g, ' ');
  const norm = normalizeItemName(raw);
  if (norm.canonical) {
    const row = ALIAS_TABLE[norm.canonical];
    return {
      name: norm.canonical,
      normalizedName: norm.canonical,
      category: row?.category ?? 'other',
      shelfLifeDays: row?.shelfLifeDays ?? null,
    };
  }
  return {
    name: raw,
    normalizedName: foldDiacritics(raw.toLowerCase()),
    category: 'other',
    shelfLifeDays: null,
  };
}
