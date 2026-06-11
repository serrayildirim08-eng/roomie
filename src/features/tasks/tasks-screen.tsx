// Tasks — fair chore rotation, v1: manual, event-driven.
//
// The home defines its own chores. Each chore shows whose turn it is.
// Done ✓ — anyone can tap it (credit goes to the doer), the turn advances.
// Pass — only the turn holder, penalty-free, turn moves on.
// Tapping a chore opens its quiet history: "X did it · 2d ago". A plain
// chronological list — no counts, no points, no streaks, ever.

import { id } from '@instantdb/react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Roomie, RoomieFonts } from '@/constants/theme';
import { logActivity, timeAgo } from '@/features/activity/activity';
import { nowMs } from '@/features/money/money-logic';
import { db } from '@/lib/db';

import { effectiveTurn, nextTurn } from './rotation';

// "vfya+clerk_test@example.com" → "vfya"
function emailName(email?: string): string | undefined {
  const local = email?.split('@')[0]?.replace(/\+.*$/, '');
  return local || undefined;
}

export function TasksScreen({ userId }: { userId: string }) {
  const { isLoading, error, data } = db.useQuery({
    memberships: {
      $: { where: { 'user.id': userId, status: 'active' } },
      household: {
        memberships: { $: { where: { status: 'active' } }, user: {} },
        chores: {
          turn: {},
          events: { $: { order: { at: 'desc' }, limit: 12 }, by: {} },
        },
      },
    },
  });

  const [draft, setDraft] = useState('');
  const [openChoreId, setOpenChoreId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Centered>
        <ActivityIndicator />
      </Centered>
    );
  }
  if (error) {
    return (
      <Centered>
        <Text style={styles.muted}>Couldn&apos;t load tasks.</Text>
      </Centered>
    );
  }

  const household = data.memberships[0]?.household;
  if (!household) {
    return (
      <Centered>
        <Text style={styles.muted}>Create or join a home first.</Text>
      </Centered>
    );
  }

  // Rotation order = join order (stable; no surprises).
  const orderedMembers = [...household.memberships]
    .sort((a, b) => Number(a.joinedAt) - Number(b.joinedAt))
    .map((m) => ({
      userId: m.user?.id ?? '',
      name: m.displayName ?? emailName(m.user?.email) ?? 'Someone',
    }))
    .filter((m) => m.userId);
  const memberIds = orderedMembers.map((m) => m.userId);
  const nameById = Object.fromEntries(orderedMembers.map((m) => [m.userId, m.name]));
  const myName = nameById[userId] ?? 'You';

  const chores = [...household.chores].sort((a, b) => Number(a.createdAt) - Number(b.createdAt));

  const onAdd = async () => {
    const name = draft.trim().replace(/\s+/g, ' ');
    if (!name) return;
    setDraft('');
    const ts = nowMs();
    const choreId = id();
    await db.transact(
      db.tx.chores[choreId]
        .update({ name, createdAt: ts, updatedAt: ts })
        .link({ household: household.id, turn: memberIds[0] ?? userId }),
    );
    await logActivity({
      householdId: household.id,
      actorId: userId,
      actorName: myName,
      type: 'chore_added',
      metadata: { chore: name },
    });
  };

  const advance = async (
    choreId: string,
    choreName: string,
    holderId: string | null,
    eventType: 'done' | 'pass',
  ) => {
    const ts = nowMs();
    const next = nextTurn(memberIds, holderId);
    const eventId = id();
    await db.transact([
      db.tx.chores[choreId]
        .update({ updatedAt: ts })
        .link({ turn: next ?? userId }),
      db.tx.choreEvents[eventId]
        .update({ type: eventType, at: ts })
        .link({ chore: choreId, by: userId }),
    ]);
    await logActivity({
      householdId: household.id,
      actorId: userId,
      actorName: myName,
      type: eventType === 'done' ? 'chore_done' : 'chore_passed',
      metadata: { chore: choreName },
    });
  };

  const onDelete = (choreId: string, choreName: string) => {
    Alert.alert('Remove this chore?', `"${choreName}" and its history will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await db.transact(db.tx.chores[choreId].delete());
            await logActivity({
              householdId: household.id,
              actorId: userId,
              actorName: myName,
              type: 'chore_removed',
              metadata: { chore: choreName },
            });
          })();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Tasks</Text>

        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            placeholder="Add a chore… (trash, bathroom)"
            placeholderTextColor={Roomie.sub}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={onAdd}
            returnKeyType="done"
          />
          <Pressable style={styles.addButton} onPress={onAdd}>
            <Text style={styles.addButtonLabel}>+</Text>
          </Pressable>
        </View>

        {chores.length === 0 ? (
          <Text style={styles.muted}>No chores yet. Add what this home shares. 🧹</Text>
        ) : (
          chores.map((chore) => {
            const holderId = effectiveTurn(memberIds, chore.turn?.id);
            const mine = holderId === userId;
            const open = openChoreId === chore.id;
            const events = chore.events ?? [];
            return (
              <View key={chore.id} style={styles.choreCard}>
                <Pressable
                  style={styles.choreRow}
                  onPress={() => setOpenChoreId(open ? null : chore.id)}
                >
                  <View style={styles.choreInfo}>
                    <Text style={styles.choreName}>{chore.name}</Text>
                    <Text style={[styles.turnNote, mine && styles.turnNoteMine]}>
                      {mine ? 'your turn' : `${nameById[holderId ?? ''] ?? 'someone'}'s turn`}
                    </Text>
                  </View>
                  {mine ? (
                    <Pressable
                      style={styles.pass}
                      onPress={() => advance(chore.id, chore.name, holderId, 'pass')}
                    >
                      <Text style={styles.passLabel}>Pass</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={styles.done}
                    onPress={() => advance(chore.id, chore.name, holderId, 'done')}
                  >
                    <Text style={styles.doneLabel}>Done ✓</Text>
                  </Pressable>
                  <Pressable
                    style={styles.delete}
                    onPress={() => onDelete(chore.id, chore.name)}
                    hitSlop={8}
                    accessibilityLabel={`Remove ${chore.name}`}
                  >
                    <Text style={styles.deleteLabel}>✕</Text>
                  </Pressable>
                </Pressable>

                {open ? (
                  <View style={styles.history}>
                    {events.length === 0 ? (
                      <Text style={styles.historyEmpty}>No history yet.</Text>
                    ) : (
                      events.map((ev) => (
                        <View key={ev.id} style={styles.historyRow}>
                          <Text style={styles.historyText}>
                            {ev.type === 'done'
                              ? `${ev.by?.id === userId ? 'You' : (nameById[ev.by?.id ?? ''] ?? 'Someone')} did it`
                              : `${ev.by?.id === userId ? 'You' : (nameById[ev.by?.id ?? ''] ?? 'Someone')} passed`}
                          </Text>
                          <Text style={styles.historyTime}>{timeAgo(Number(ev.at))}</Text>
                        </View>
                      ))
                    )}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Roomie.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 24, gap: 12 },
  heading: { fontSize: 34, fontFamily: RoomieFonts.displayBold, color: Roomie.ink },
  addRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: Roomie.hairline,
    backgroundColor: Roomie.input,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: RoomieFonts.body,
    color: Roomie.ink,
  },
  addButton: {
    backgroundColor: Roomie.accent,
    borderRadius: 16,
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Roomie.accent,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  addButtonLabel: { color: Roomie.onAccent, fontSize: 24, fontFamily: RoomieFonts.bodyBold },
  muted: { fontSize: 15, fontFamily: RoomieFonts.body, color: Roomie.sub },
  choreCard: {
    backgroundColor: Roomie.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Roomie.hairline,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  choreRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  choreInfo: { flex: 1, gap: 2 },
  choreName: { fontSize: 16, fontFamily: RoomieFonts.bodyBold, color: Roomie.ink },
  turnNote: { fontSize: 13, fontFamily: RoomieFonts.body, color: Roomie.sub },
  turnNoteMine: { color: Roomie.accent, fontFamily: RoomieFonts.bodySemi },
  pass: {
    borderWidth: 1,
    borderColor: Roomie.hairline,
    backgroundColor: Roomie.input,
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  passLabel: { fontSize: 13, fontFamily: RoomieFonts.bodySemi, color: Roomie.ink },
  done: {
    backgroundColor: Roomie.sage,
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  doneLabel: { color: Roomie.onAccent, fontSize: 13, fontFamily: RoomieFonts.bodyBold },
  delete: { padding: 4 },
  deleteLabel: { fontSize: 15, color: Roomie.danger },
  history: {
    borderTopWidth: 1,
    borderTopColor: Roomie.hairline,
    paddingVertical: 8,
    gap: 4,
  },
  historyEmpty: { fontSize: 13, fontFamily: RoomieFonts.body, color: Roomie.sub },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  historyText: { fontSize: 13, fontFamily: RoomieFonts.body, color: Roomie.ink },
  historyTime: { fontSize: 12, fontFamily: RoomieFonts.body, color: Roomie.sub },
});
