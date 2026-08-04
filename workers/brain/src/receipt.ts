// Receipt itemize — a signed $files image URL in, a confirm-ready item list
// out. Vision runs on Groq (llama-4-scout, multimodal); the model is told to
// IGNORE personal data (names, card digits) so none of it lands in the reply.
// NEVER persists — the app writes only what the user ticks and confirms.

export type ReceiptItem = { name: string; priceCents: number };
export type ReceiptRead = { merchant?: string; items: ReceiptItem[]; totalCents?: number };

// VERIFY against current Groq docs if this 404s: vision-capable model id.
const GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

const PROMPT = `You read grocery/store receipts. Return ONLY a JSON object:
{"merchant": string?, "items": [{"name": string, "priceCents": int}], "totalCents": int?}
Rules:
- items = purchasable products only. SKIP deposits (statiegeld/pfand), discounts,
  loyalty lines, subtotals, tax lines.
- name: short product name in English when obvious ("halfvolle melk" -> "Milk"),
  else keep the printed name. priceCents: integer cents.
- totalCents: the receipt's grand total when readable.
- IGNORE and NEVER output personal data: cardholder names, card digits,
  loyalty ids, addresses.
- Unreadable receipt -> {"items": []}.`;

export async function itemizeReceipt(
  apiKey: string,
  imageUrl: string,
): Promise<ReceiptRead | null> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GROQ_VISION_MODEL,
      response_format: { type: 'json_object' },
      max_tokens: 900,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    console.log(JSON.stringify({ metric: 'receipt_vision_http', status: res.status }));
    return null;
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return parseReceiptRead(body.choices?.[0]?.message?.content ?? '');
}

// Hand-rolled narrowing (house style — no zod): bad rows drop, never throw.
export function parseReceiptRead(raw: string): ReceiptRead | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const items: ReceiptItem[] = [];
    if (Array.isArray(parsed.items)) {
      for (const it of parsed.items) {
        if (!it || typeof it !== 'object') continue;
        const name = (it as Record<string, unknown>).name;
        const priceCents = (it as Record<string, unknown>).priceCents;
        if (typeof name !== 'string' || !name.trim()) continue;
        if (typeof priceCents !== 'number' || !Number.isFinite(priceCents) || priceCents < 0)
          continue;
        items.push({ name: name.trim().slice(0, 60), priceCents: Math.round(priceCents) });
        if (items.length >= 40) break; // a receipt, not a warehouse manifest
      }
    }
    const totalCents =
      typeof parsed.totalCents === 'number' && Number.isFinite(parsed.totalCents)
        ? Math.round(parsed.totalCents)
        : undefined;
    const merchant =
      typeof parsed.merchant === 'string' && parsed.merchant.trim()
        ? parsed.merchant.trim().slice(0, 40)
        : undefined;
    return { merchant, items, totalCents };
  } catch {
    return null;
  }
}
