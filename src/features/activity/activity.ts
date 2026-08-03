// Activity feed — the BODY layer (deterministic). Every meaningful action writes
// one raw event here, always. The BRAIN layer (grouping / AI summary / ranking)
// will sit on top later and decide what to actually surface.
//
// We denormalize the actor's name into metadata at write time so the feed can
// render "mert joined" without a separate profile lookup.

import { id } from '@instantdb/react-native';

import { db } from '@/lib/db';

export type ActivityType =
  | 'household_created'
  | 'member_joined'
  | 'member_left'
  | 'expense_added'
  | 'expense_deleted'
  | 'debt_settled'
  | 'pantry_added'
  | 'pantry_out'
  | 'pantry_claimed'
  | 'pantry_got'
  | 'pantry_removed'
  | 'bill_added'
  | 'bill_paid'
  | 'chore_added'
  | 'chore_done'
  | 'chore_passed'
  | 'chore_removed';

function eur(metadata: unknown): string {
  const cents =
    metadata && typeof metadata === 'object' && 'amountCents' in metadata
      ? Number((metadata as { amountCents?: unknown }).amountCents)
      : NaN;
  return Number.isFinite(cents) ? `€${(cents / 100).toFixed(2)}` : '';
}

function metaString(metadata: unknown, key: string): string | null {
  return metadata && typeof metadata === 'object' && key in metadata
    ? String((metadata as Record<string, unknown>)[key])
    : null;
}

export async function logActivity(params: {
  householdId: string;
  actorId: string;
  actorName: string;
  type: ActivityType;
  metadata?: Record<string, unknown>;
  // Optional photo proof + note — plain $files references (see photo.ts).
  photo?: { fileId: string; path: string } | null;
  note?: string;
}) {
  const eventId = id();
  await db.transact(
    db.tx.activityEvents[eventId]
      .update({
        type: params.type,
        metadata: {
          actorName: params.actorName,
          ...(params.note?.trim() ? { note: params.note.trim() } : {}),
          ...(params.metadata ?? {}),
        },
        householdId: params.householdId, // create rule reads this, not the link
        ...(params.photo ? { photoFileId: params.photo.fileId, photoPath: params.photo.path } : {}),
        createdAt: Date.now(),
      })
      .link({ household: params.householdId, actor: params.actorId }),
  );
}

// Raw event → a human line. (BRAIN will later group/summarize; this is the
// plain, one-event-one-line version.)
export function describeEvent(type: string, metadata: unknown): { icon: string; text: string } {
  const who =
    (metadata && typeof metadata === 'object' && 'actorName' in metadata
      ? String((metadata as { actorName?: unknown }).actorName)
      : null) ?? 'Someone';

  switch (type) {
    case 'household_created':
      return { icon: '🏠', text: `${who} created the home` };
    case 'member_joined':
      return { icon: '👋', text: `${who} joined` };
    case 'member_left':
      return { icon: '🕊️', text: `${who} moved out` };
    case 'bill_added':
      return { icon: '📄', text: `${who} set up ${metaString(metadata, 'title') ?? 'a bill'}` };
    case 'bill_paid':
      return {
        icon: '📄',
        text: `${who} paid ${metaString(metadata, 'title') ?? 'a bill'} ${eur(metadata)}`.trim(),
      };
    case 'expense_added': {
      const title = metaString(metadata, 'title');
      return {
        icon: '💸',
        text: `${who} added ${title ? `"${title}"` : 'an expense'} — ${eur(metadata)}`,
      };
    }
    case 'expense_deleted': {
      const title = metaString(metadata, 'title');
      return { icon: '🗑️', text: `${who} removed ${title ? `"${title}"` : 'an expense'}` };
    }
    case 'debt_settled': {
      const to = metaString(metadata, 'toName') ?? 'someone';
      return { icon: '✅', text: `${who} paid ${to} ${eur(metadata)}` };
    }
    case 'pantry_added': {
      const item = metaString(metadata, 'item');
      return { icon: '🧺', text: `${who} stocked ${item ?? 'something'}` };
    }
    case 'pantry_out': {
      const item = metaString(metadata, 'item');
      return { icon: '🫙', text: `${who} says ${item ?? 'something'} is out` };
    }
    case 'pantry_claimed': {
      const item = metaString(metadata, 'item');
      return { icon: '🛒', text: `${who} is getting ${item ?? 'something'}` };
    }
    case 'pantry_got': {
      const item = metaString(metadata, 'item');
      return { icon: '🛍️', text: `${who} got ${item ?? 'something'}` };
    }
    case 'pantry_removed': {
      const item = metaString(metadata, 'item');
      return { icon: '🗑️', text: `${who} removed ${item ?? 'something'}` };
    }
    case 'chore_added': {
      const chore = metaString(metadata, 'chore');
      return { icon: '🧹', text: `${who} added a chore: ${chore ?? 'something'}` };
    }
    case 'chore_done': {
      const chore = metaString(metadata, 'chore');
      return { icon: '✨', text: `${who} handled ${chore ?? 'a chore'}` };
    }
    case 'chore_passed': {
      const chore = metaString(metadata, 'chore');
      return { icon: '↪️', text: `${chore ?? 'a chore'} moved on from ${who}` };
    }
    case 'chore_removed': {
      const chore = metaString(metadata, 'chore');
      return { icon: '🗑️', text: `${who} removed ${chore ?? 'a chore'}` };
    }
    default:
      return { icon: '•', text: `${who} did something` };
  }
}

export function timeAgo(value: number | string): string {
  const ts = typeof value === 'number' ? value : new Date(value).getTime();
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (Number.isNaN(seconds) || seconds < 45) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
