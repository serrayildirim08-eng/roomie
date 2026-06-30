// Tiny wins card — a small calm strip on Home, under <HomePulse/>, surfacing up
// to 3 two-minute actions from data we already have. Does its OWN db.useQuery so
// the household screen barely changes. No points, no ranking, no scoreboard —
// quiet read-only suggestions, and NOTHING (null) when there's nothing tiny to
// do or while the data's still loading.

import { StyleSheet, Text, View } from 'react-native';

import { Card, SectionHead } from '@/components/ui/kit';
import { Roomie, RoomieFonts } from '@/constants/theme';
import { ageOf } from '@/features/kitchen/aging';
import { computeNetCents, nowMs, simplifyDebts } from '@/features/money/money-logic';
import { effectiveTurn } from '@/features/tasks/rotation';
import { db } from '@/lib/db';

import { pickTinyWins } from './tiny-wins-logic';

// "vfya+clerk_test@example.com" → "vfya"
function emailName(email?: string): string | undefined {
  const local = email?.split('@')[0]?.replace(/\+.*$/, '');
  return local || undefined;
}

export function TinyWins({ householdId, userId }: { householdId: string; userId: string }) {
  const { isLoading, error, data } = db.useQuery({
    memberships: {
      $: { where: { 'user.id': userId, status: 'active' } },
      household: {
        memberships: { $: { where: { status: 'active' } }, user: {} },
        expenses: { paidBy: {}, participants: {} },
        settlements: { fromUser: {}, toUser: {} },
        chores: { turn: {} },
        pantryItems: { claimedBy: {} },
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

  // Money I owe — same net + greedy simplify as the Money screen.
  const net = computeNetCents(
    members,
    household.expenses.map((e) => ({
      amountCents: e.amountCents,
      paidById: e.paidBy?.id ?? '',
      participantIds: e.participants.map((p) => p.id),
    })),
    household.settlements.map((s) => ({
      amountCents: s.amountCents,
      fromId: s.fromUser?.id ?? '',
      toId: s.toUser?.id ?? '',
    })),
  );
  const myDebts = simplifyDebts(net)
    .filter((d) => d.fromId === userId)
    .map((d) => ({ toName: nameById[d.toId] ?? 'someone', amountCents: d.amountCents }));

  const now = nowMs();
  const agingPantry = household.pantryItems
    .filter((p) => p.status === 'in')
    .filter((p) => ageOf(Number(p.addedAt), p.shelfLifeDays ?? null, now) !== 'fresh')
    .map((p) => ({ name: p.name }));

  const wins = pickTinyWins({
    myUserId: userId,
    chores: household.chores.map((c) => ({
      name: c.name,
      turnHolderId: effectiveTurn(orderedMemberIds, c.turn?.id),
    })),
    shopping: household.pantryItems
      .filter((p) => p.status === 'out')
      .map((p) => ({
        name: p.name,
        claimedByName: p.claimedBy?.id ? (nameById[p.claimedBy.id] ?? null) : null,
      })),
    myDebts,
    agingPantry,
  });

  // Zero tiny wins → render nothing, never an empty box.
  if (wins.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHead title="Tiny wins" />
      <Text style={styles.sub}>quick things that help</Text>
      <Card>
        {wins.map((w, idx) => (
          <View key={idx} style={[styles.row, idx > 0 && styles.rowDivided]}>
            <Text style={styles.icon}>{w.icon}</Text>
            <Text style={styles.text}>{w.text}</Text>
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 11 },
  sub: { fontSize: 13, fontFamily: RoomieFonts.body, color: Roomie.sub, paddingHorizontal: 3, marginTop: -6 },
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
