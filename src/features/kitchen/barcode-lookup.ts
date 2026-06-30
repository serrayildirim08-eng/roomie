// Barcode → product name via Open Food Facts: a free, keyless, global product
// database (strong on EU packaged goods). We only need a human name; category
// and shelf-life are derived locally by `resolveItem`. A barcode carries the
// product's identity, NOT its price or expiry — those stay manual/estimated.
//
// Network failure, unknown barcode, or a nameless entry all collapse to null,
// which the scan flow turns into the "type the name" fallback — never a dead end.

const OFF_ENDPOINT = 'https://world.openfoodfacts.org/api/v2/product';

export interface BarcodeProduct {
  name: string;
  brand?: string;
}

export async function lookupBarcode(
  barcode: string,
  signal?: AbortSignal,
): Promise<BarcodeProduct | null> {
  const code = barcode.trim();
  if (!code) return null;
  try {
    const res = await fetch(
      `${OFF_ENDPOINT}/${encodeURIComponent(code)}.json?fields=product_name,product_name_en,brands`,
      { signal, headers: { 'User-Agent': 'Roomie/0.1 (roommate grocery app)' } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status?: number;
      product?: { product_name?: string; product_name_en?: string; brands?: string };
    };
    if (json.status !== 1 || !json.product) return null;
    const p = json.product;
    const name = (p.product_name_en || p.product_name || '').trim();
    if (!name) return null;
    return { name, brand: p.brands?.split(',')[0]?.trim() || undefined };
  } catch {
    // Network/timeout/abort → caller falls back to manual entry.
    return null;
  }
}
