// Activity feed — the BODY layer (deterministic). Every meaningful action writes
// one raw event here, always. The BRAIN layer (grouping / AI summary / ranking)
// will sit on top later and decide what to actually surface.
//
// We denormalize the actor's name into metadata at write time so the feed can
// render "mert joined" without a separate profile lookup.

import { id } from '@instantdb/react-native';

import { db } from '@/lib/db';

export type ActivityType = 'household_created' | 'member_joined';

export async function logActivity(params: {
  householdId: string;
  actorId: string;
  actorName: string;
  type: ActivityType;
  metadata?: Record<string, unknown>;
}) {
  const eventId = id();
  await db.transact(
    db.tx.activityEvents[eventId]
      .update({
        type: params.type,
        metadata: { actorName: params.actorName, ...(params.metadata ?? {}) },
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
