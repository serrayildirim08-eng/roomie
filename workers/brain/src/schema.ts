// Draft output contract — the one thing Ollie's router lacked (weak
// validation) and the reuse audit told us to fix: zod at the draft boundary.
// The model's JSON is parsed, validated, clamped; anything malformed dies
// HERE, never in the app.

import { z } from 'zod';

export const TARGETS = [
  'expense', // Money: title + amountCents (EUR)
  'pantry_add', // Kitchen: item arrived/was bought → pantry
  'pantry_out', // Kitchen: item ran out → shopping list
  'shopping_add', // Kitchen: "we need X" → shopping list
  'chore_done', // Tasks: a house chore was done
  'personal_task', // Tasks · Mine: a note-to-self
] as const;

export type Target = (typeof TARGETS)[number];

const fragmentSchema = z
  .object({
    target: z.enum(TARGETS),
    confidence: z.number().min(0).max(1).catch(0.5),
    // Per-target fields — all optional at parse time; refined below.
    title: z.string().trim().min(1).max(120).optional(),
    amountCents: z.number().int().positive().max(5_000_00).optional(),
    item: z.string().trim().min(1).max(80).optional(),
    chore: z.string().trim().min(1).max(80).optional(),
  })
  .refine((f) => (f.target === 'expense' ? !!f.title && !!f.amountCents : true), {
    message: 'expense needs title + amountCents',
  })
  .refine(
    (f) =>
      ['pantry_add', 'pantry_out', 'shopping_add'].includes(f.target) ? !!f.item : true,
    { message: 'pantry fragments need item' },
  )
  .refine((f) => (f.target === 'chore_done' ? !!f.chore : true), {
    message: 'chore_done needs chore',
  })
  .refine((f) => (f.target === 'personal_task' ? !!f.title : true), {
    message: 'personal_task needs title',
  });

export const draftSchema = z.object({
  fragments: z.array(fragmentSchema).max(8),
  // When the note is routable but missing something (usually an amount),
  // the model asks ONE short question instead of guessing. Never both
  // a low-confidence guess and silence — the uydurma yasağı, as a schema.
  question: z.string().trim().max(160).nullable().catch(null),
});

export type Draft = z.infer<typeof draftSchema>;
export type DraftFragment = Draft['fragments'][number];

// Lenient outer shape: fragments as unknown[], validated one by one below.
const looseSchema = z.object({
  fragments: z.array(z.unknown()).max(12).catch([]),
  question: z.string().trim().min(1).max(160).nullable().catch(null),
});

/**
 * Salvaging parse: one malformed fragment must not kill the whole draft
 * (models love emitting an amount-less expense AND the clarifying question
 * together — keep the question, drop the broken fragment). Throws only when
 * the raw string isn't JSON at all.
 */
export function parseDraft(raw: string): { draft: Draft; dropped: number } {
  const loose = looseSchema.parse(JSON.parse(raw));
  const fragments: DraftFragment[] = [];
  let dropped = 0;
  let droppedAmountlessExpense = false;

  for (const f of loose.fragments.slice(0, 8)) {
    const parsed = fragmentSchema.safeParse(f);
    if (parsed.success) {
      fragments.push(parsed.data);
    } else {
      dropped += 1;
      const t = (f as { target?: unknown })?.target;
      if (t === 'expense') droppedAmountlessExpense = true;
    }
  }

  // An expense died for lack of an amount and the model forgot to ask →
  // ask for it ourselves rather than silently losing the money intent.
  let question = loose.question;
  if (droppedAmountlessExpense && !question) question = 'How much was it? / Kaç € tuttu?';

  return { draft: { fragments, question }, dropped };
}
