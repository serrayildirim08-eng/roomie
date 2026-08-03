// Barcode → product name via Open Food Facts: a free, keyless, global product
// database (strong on EU packaged goods). We only need a human name; category
// and shelf-life are derived locally by `resolveItem`. A barcode carries the
// product's identity, NOT its price or expiry — those stay manual/estimated.
//
// Network failure, unknown barcode, or a nameless entry all collapse to null,
// which the scan flow turns into the "type the name" fallback — never a dead end.

import type { GroceryCategory } from './alias-data';
import { type DietTag, mapOffCategory, mapOffLabels } from './off-map';

const OFF_ENDPOINT = 'https://world.openfoodfacts.org/api/v2/product';

export interface BarcodeProduct {
  name: string;
  brand?: string;
  // Derived from OFF's category taxonomy when available; the scan flow may
  // prefer the name-based alias category, so this is a hint, not a mandate.
  category?: GroceryCategory;
  // Diet flags the label declares (vegan / gluten-free / …). Empty when none.
  dietTags?: DietTag[];
}

// Last-resort local map for a handful of ultra-common EU barcodes that Open
// Food Facts sometimes returns without a usable name. This is NOT a product
// database — just the everyday misses a shared home hits most. resolveItem
// still derives the category, emoji, and shelf-life from the name, so the
// alias table stays the single source of truth. Keep this tiny.
const LOCAL_BARCODES: Record<string, string> = {
  '5449000000996': 'Coca-Cola', // classic 330ml, the barcode people scan most
};

async function lookupOpenFoodFacts(
  code: string,
  signal?: AbortSignal,
): Promise<BarcodeProduct | null> {
  try {
    const res = await fetch(
      `${OFF_ENDPOINT}/${encodeURIComponent(code)}.json?fields=product_name,product_name_en,brands,categories_tags,labels_tags`,
      { signal, headers: { 'User-Agent': 'Roomie/0.1 (roommate grocery app)' } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status?: number;
      product?: {
        product_name?: string;
        product_name_en?: string;
        brands?: string;
        categories_tags?: string[];
        labels_tags?: string[];
      };
    };
    if (json.status !== 1 || !json.product) return null;
    const p = json.product;
    const name = (p.product_name_en || p.product_name || '').trim();
    if (!name) return null;
    const category = mapOffCategory(p.categories_tags) ?? undefined;
    const dietTags = mapOffLabels(p.labels_tags);
    return {
      name,
      brand: p.brands?.split(',')[0]?.trim() || undefined,
      category,
      dietTags: dietTags.length ? dietTags : undefined,
    };
  } catch {
    // Network/timeout/abort → fall through to the local map, then manual entry.
    return null;
  }
}

export async function lookupBarcode(
  barcode: string,
  signal?: AbortSignal,
): Promise<BarcodeProduct | null> {
  const code = barcode.trim();
  if (!code) return null;
  const off = await lookupOpenFoodFacts(code, signal);
  if (off) return off;
  // Open Food Facts had a gap → try the tiny local fallback before giving up.
  const local = LOCAL_BARCODES[code];
  if (local) return { name: local };
  return null;
}
