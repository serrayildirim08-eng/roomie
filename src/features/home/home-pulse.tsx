// Home Pulse card — a calm "is our home okay?" glance on the Home screen.
// Does its OWN db.useQuery so the household screen barely changes. No scores,
// no colors-as-grades, no ranking of people: four quiet one-liners from the
// pure pulseSummary, always from YOUR point of view.

import { StyleSheet, Text, View } from 'react-native';

import { Card, SectionHead } from '@/components/ui/kit';
import { Roomie, RoomieFonts } from '@/constants/theme';
import { nowMs } from '@/features/money/money-logic';
import { effectiveTurn } from '@/features/tasks/rotation';
import { db } from '@/lib/db';

import { pulseSummary } from './pulse';

// "vfya+clerk_test@example.com" → "vfya"
function emailName(email?: string): string | undefined {
  const local = email?.split('@')[0]?.replace(/\+.*$/, '');
  return local || undefined;
}

export function HomePulse({ householdId, userId }: { householdId: string; userId: string }) {
  const { isLoading, error, data } = db.useQuery({
    memberships: {
      $: { where: { 'user.id': userId, status: 'active' } },
      household: {
        memberships: { $: { where: { status: 'active' } }, user: {} },
        expenses: { paidBy: {}, participants: {} },
        settlements: { fromUser: {}, toUser: {} },
        chores: { turn: {} },
        pantryItems: { claimedBy: {} },
        activity: { $: { order: { createdAt: 'desc' }, limit: 50 } },
      },
    },
  });

  // Never a spinner on Home — stay invisible until the data's there.
  if (isLoading || error) return null;
  const household =
    data.memberships.find((m) => m.household?.id === householdId)?.household ??
    data.memberships[0]?.household;
  if (!household) return null;

  const nameById = Object.fromEntries(
    household.memberships.map((m) => [
      m.user?.id ?? '',
      m.displayName ?? emailName(m.user?.email) ?? 'Someone',
    ]),
  );
  const members = household.memberships
    .map((m) => ({ userId: m.user?.id ?? '', name: nameById[m.user?.id ?? ''] ?? 'Someone' }))
    .filter((m) => m.userId);

  // Rotation order = join order, so the effective turn matches the Tasks screen.
  const orderedMemberIds = [...household.memberships]
    .sort((a, b) => Number(a.joinedAt) - Number(b.joinedAt))
    .map((m) => m.user?.id ?? '')
    .filter(Boolean);

  const summary = pulseSummary({
    myUserId: userId,
    members,
    expenses: household.expenses.map((e) => ({
      amountCents: e.amountCents,
      paidById: e.paidBy?.id ?? '',
      participantIds: e.participants.map((p) => p.id),
    })),
    settlements: household.settlements.map((s) => ({
      amountCents: s.amountCents,
      fromId: s.fromUser?.id ?? '',
      toId: s.toUser?.id ?? '',
    })),
    pantry: household.pantryItems.map((p) => ({
      name: p.name,
      status: p.status === 'out' ? 'out' : 'in',
      claimedByName: p.claimedBy?.id ? (nameById[p.claimedBy.id] ?? null) : null,
      addedAt: Number(p.addedAt),
      shelfLifeDays: p.shelfLifeDays ?? null,
    })),
    chores: household.chores.map((c) => ({
      turnHolderId: effectiveTurn(orderedMemberIds, c.turn?.id),
    })),
    activityCreatedAt: household.activity.map((a) => Number(a.createdAt)),
    nowMs: nowMs(),
  });

  const rows = [
    { icon: '💶', text: summary.money },
    { icon: '🧺', text: summary.kitchen },
    { icon: '🧹', text: summary.chores },
    { icon: '✨', text: summary.today },
  ];

  return (
    <View style={styles.section}>
      <SectionHead title="How home's doing" />
      <Card>
        {rows.map((r, idx) => (
          <View key={idx} style={[styles.row, idx > 0 && styles.rowDivided]}>
            <Text style={styles.icon}>{r.icon}</Text>
            <Text style={styles.text}>{r.text}</Text>
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 11 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowDivided: { borderTopWidth: 1, borderTopColor: Roomie.rule },
  icon: { fontSize: 18, width: 26, textAlign: 'center' },
  text: { flex: 1, fontSize: 15, fontFamily: RoomieFonts.bodySemi, color: Roomie.ink },
});
