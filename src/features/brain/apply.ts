// Confirm-time writer: turns APPROVED draft fragments into real records.
// This is the only place brain output touches the database — and it runs
// strictly AFTER the user taps Confirm (draft-first, always).
//
// Each fragment reuses the same write patterns as the manual screens
// (money-screen / kitchen-screen / tasks-screen) so a brain write and a
// hand write are indistinguishable downstream.

import { id } from '@instantdb/react-native';

import { logActivity } from '@/features/activity/activity';
import { itemEmoji } from '@/features/kitchen/alias-data';
import { resolveItem } from '@/features/kitchen/normalize';
import { nowMs } from '@/features/money/money-logic';
import { effectiveTurn, nextTurn } from '@/features/tasks/rotation';
import { db } from '@/lib/db';

import type { DraftFragment } from './types';

export interface ApplyResult {
  applied: string[]; // human lines for the quiet ack
  skipped: string[]; // things we could not place (e.g. unknown chore)
}

export async function applyFragments(
  fragments: DraftFragment[],
  ctx: { householdId: string; userId: string; userName: string },
): Promise<ApplyResult> {
  const { householdId, userId, userName } = ctx;
  const applied: string[] = [];
  const skipped: string[] = [];

  // One snapshot of the household graph for matching + membership lists.
  const { data } = await db.queryOnce({
    households: {
      $: { where: { id: householdId } },
      memberships: { $: { where: { status: 'active' } }, user: {} },
      pantryItems: { claimedBy: {} },
      chores: { turn: {} },
    },
  });
  const household = data.households[0];
  if (!household) return { applied, skipped: ['no household'] };

  const orderedMembers = [...household.memberships]
    .sort((a, b) => Number(a.joinedAt) - Number(b.joinedAt))
    .map((m) => m.user?.id ?? '')
    .filter(Boolean);

  const log = (type: Parameters<typeof logActivity>[0]['type'], metadata: Record<string, unknown>) =>
    logActivity({ householdId, actorId: userId, actorName: userName, type, metadata });

  for (const f of fragments) {
    const ts = nowMs();

    if (f.target === 'expense' && f.title && f.amountCents) {
      await db.transact(
        db.tx.expenses[id()]
          .update({ title: f.title, amountCents: f.amountCents, currency: 'EUR', householdId, createdAt: ts })
          .link({ household: householdId, paidBy: userId, participants: orderedMembers }),
      );
      await log('expense_added', { title: f.title, amountCents: f.amountCents, paidByName: userName });
      applied.push(`💸 ${f.title} — €${(f.amountCents / 100).toFixed(2)}`);
      continue;
    }

    if ((f.target === 'pantry_add' || f.target === 'pantry_out' || f.target === 'shopping_add') && f.item) {
      const resolved = resolveItem(f.item);
      const existing = household.pantryItems.find(
        (it) => it.normalizedName === resolved.normalizedName,
      );
      const toStatus = f.target === 'pantry_add' ? 'in' : 'out';

      if (existing) {
        await db.transact(
          db.tx.pantryItems[existing.id].update({
            status: toStatus,
            updatedAt: ts,
            ...(toStatus === 'in' ? { addedAt: ts } : {}),
          }),
        );
      } else {
        await db.transact(
          db.tx.pantryItems[id()]
            .update({
              name: resolved.name,
              normalizedName: resolved.normalizedName,
              category: resolved.category,
              status: toStatus,
              shelfLifeDays: resolved.shelfLifeDays ?? undefined,
              addedAt: ts,
              householdId,
              createdAt: ts,
              updatedAt: ts,
            })
            .link({ household: householdId }),
        );
      }

      if (f.target === 'pantry_add') {
        // A purchase: feed the cadence log, same as Kitchen's "Got it ✓".
        await db.transact(
          db.tx.purchases[id()]
            .update({ itemName: resolved.normalizedName, at: ts, householdId })
            .link({ household: householdId, by: userId }),
        );
        await log('pantry_got', { item: resolved.name });
      } else {
        await log('pantry_out', { item: resolved.name });
      }
      applied.push(
        `${itemEmoji(resolved.name, resolved.category)} ${resolved.name} → ${
          f.target === 'pantry_add' ? 'pantry' : 'shopping list'
        }`,
      );
      continue;
    }

    if (f.target === 'chore_done' && f.chore) {
      const needle = f.chore.toLowerCase();
      const chore = household.chores.find((c) => {
        const name = c.name.toLowerCase();
        return name.includes(needle) || needle.includes(name);
      });
      if (!chore) {
        skipped.push(`🧹 no chore called “${f.chore}”`);
        continue;
      }
      const holderId = effectiveTurn(orderedMembers, chore.turn?.id);
      const next = nextTurn(orderedMembers, holderId);
      await db.transact([
        db.tx.chores[chore.id].update({ updatedAt: ts }).link({ turn: next ?? userId }),
        db.tx.choreEvents[id()]
          .update({ type: 'done', at: ts, householdId })
          .link({ chore: chore.id, by: userId }),
      ]);
      await log('chore_done', { chore: chore.name });
      applied.push(`✨ ${chore.name} done`);
      continue;
    }

    if (f.target === 'personal_task' && f.title) {
      await db.transact(
        db.tx.personalTasks[id()]
          .update({ title: f.title, status: 'open', createdAt: ts, ownerId: userId })
          .link({ household: householdId, owner: userId }),
      );
      applied.push(`🤍 ${f.title}`);
      continue;
    }

    skipped.push(`couldn't place: ${f.target}`);
  }

  return { applied, skipped };
}
