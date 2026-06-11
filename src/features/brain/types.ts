// Client-side mirror of the worker's draft contract (workers/brain/src/schema.ts).
// Kept tiny and hand-synced — the worker validates with zod; the client only
// needs the shape.

export type Target =
  | 'expense'
  | 'pantry_add'
  | 'pantry_out'
  | 'shopping_add'
  | 'chore_done'
  | 'personal_task';

export interface DraftFragment {
  target: Target;
  confidence: number;
  title?: string;
  amountCents?: number;
  item?: string;
  chore?: string;
}

export interface DraftResponse {
  fragments: DraftFragment[];
  question: string | null;
  source?: string;
  error?: string;
}

export const BRAIN_URL =
  process.env.EXPO_PUBLIC_BRAIN_URL ?? 'https://roomie-brain.ollieapp.workers.dev';

export function fragmentLine(f: DraftFragment): string {
  switch (f.target) {
    case 'expense':
      return `💸 ${f.title} — €${((f.amountCents ?? 0) / 100).toFixed(2)} · you paid · split with everyone`;
    case 'pantry_add':
      return `🧺 ${f.item} → pantry`;
    case 'pantry_out':
      return `🫙 ${f.item} is out → shopping list`;
    case 'shopping_add':
      return `🛒 ${f.item} → shopping list`;
    case 'chore_done':
      return `✨ ${f.chore} — done by you`;
    case 'personal_task':
      return `🤍 ${f.title} → your tasks`;
  }
}
