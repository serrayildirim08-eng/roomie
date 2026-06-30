// Tasks — two quiet lists, split by WHO ACTS, not by what kind of task:
//
// MINE — your action list: house chores whose turn is yours right now
// (forest "Your turn" pill, Done/Pass) + your personal to-dos. One glance
// answers "what's on my plate".
//
// HOUSE — the rest of the board: chores on someone else's turn (faded name
// pill; Done ✓ still available — anyone can close, credit to the doer, the
// turn advances). Pass is turn-holder-only and penalty-free. Tap a chore →
// quiet chronological history. No counts, no points, no streaks, ever.
//
// New homes come preloaded with five classic chores (seeded at creation,
// removable like any other). Whoever ADDS a chore takes its first turn.

import { id } from '@instantdb/react-native';
import { useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Hero,
  HeroBar,
  HeroEyebrow,
  HeroTitle,
  SectionHead,
  StatStrip,
} from '@/components/ui/kit';
import { Roomie, RoomieFonts } from '@/constants/theme';
import { logActivity, timeAgo } from '@/features/activity/activity';
import { nowMs } from '@/features/money/money-logic';
import { db } from '@/lib/db';

import { effectiveTurn, nextTurn } from './rotation';
import { CHORE_LIBRARY } from './starter';

// "vfya+clerk_test@example.com" → "vfya"
function emailName(email?: string): string | undefined {
  const local = email?.split('@')[0]?.replace(/\+.*$/, '');
  return local || undefined;
}

// A row whose secondary actions (Pass / Remove) stay hidden until you swipe
// left — keeps the resting row to one clear action (Done).
function SwipeRow({
  children,
  onPass,
  onRemove,
}: {
  children: ReactNode;
  onPass?: () => void;
  onRemove: () => void;
}) {
  const ref = useRef<SwipeableMethods>(null);
  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      rightThreshold={36}
      overshootRight={false}
      renderRightActions={() => (
        <View style={styles.actions}>
          {onPass ? (
            <Pressable
              style={[styles.action, styles.actPass]}
              onPress={() => {
                ref.current?.close();
                onPass();
              }}
            >
              <Text style={styles.actPassLabel}>Pass</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.action, styles.actRemove]}
            onPress={() => {
              ref.current?.close();
              onRemove();
            }}
          >
            <Text style={styles.actRemoveLabel}>Remove</Text>
          </Pressable>
        </View>
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

// "Done ✓" with a single quiet touch: a soft scale dip on press, then it
// settles. That's the whole reward — no confetti, no counter, no badge. Just a
// small, adult acknowledgement that the tap landed. The turn advances
// elsewhere; this stays purely transient.
function DoneButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.done, pressed && styles.donePressed]}
    >
      <Text style={styles.doneLabel}>Done ✓</Text>
    </Pressable>
  );
}

export function TasksScreen({ userId }: { userId: string }) {
  const insets = useSafeAreaInsets();
  const { isLoading, error, data } = db.useQuery({
    memberships: {
      $: { where: { 'user.id': userId, status: 'active' } },
      household: {
        memberships: { $: { where: { status: 'active' } }, user: {} },
        chores: {
          turn: {},
          events: { $: { order: { at: 'desc' }, limit: 12 }, by: {} },
        },
        personalTasks: { $: { where: { status: 'open' } }, owner: {} },
      },
    },
  });

  const [houseDraft, setHouseDraft] = useState('');
  const [mineDraft, setMineDraft] = useState('');
  const [openChoreId, setOpenChoreId] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);

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
  const myChores = chores.filter((c) => effectiveTurn(memberIds, c.turn?.id) === userId);
  const otherChores = chores.filter((c) => effectiveTurn(memberIds, c.turn?.id) !== userId);
  const myTasks = household.personalTasks
    .filter((t) => t.owner?.id === userId)
    .sort((a, b) => Number(a.createdAt) - Number(b.createdAt));

  const taskStats = [
    { k: 'Your turn', v: String(myChores.length) },
    { k: 'Personal', v: String(myTasks.length) },
    { k: 'House', v: String(otherChores.length) },
  ];

  // Suggestion library ("pizza menu"): rows the home doesn't have yet,
  // grouped, one tap to add. Already-added chores drop out automatically.
  const choreNamesLower = new Set(chores.map((c) => c.name.toLowerCase()));
  const librarySections = CHORE_LIBRARY.map((g) => ({
    group: g.group,
    chores: g.chores.filter((s) => !choreNamesLower.has(s.name.toLowerCase())),
  })).filter((g) => g.chores.length > 0);

  const onAddSuggestion = async (name: string) => {
    const ts = nowMs();
    await db.transact(
      db.tx.chores[id()]
        .update({ name, createdAt: ts, updatedAt: ts })
        .link({ household: household.id, turn: userId }),
    );
    await logActivity({
      householdId: household.id,
      actorId: userId,
      actorName: myName,
      type: 'chore_added',
      metadata: { chore: name },
    });
  };

  const onAddHouse = async () => {
    const name = houseDraft.trim().replace(/\s+/g, ' ');
    if (!name) return;
    setHouseDraft('');
    const ts = nowMs();
    const choreId = id();
    await db.transact(
      db.tx.chores[choreId]
        .update({ name, createdAt: ts, updatedAt: ts })
        // The adder takes the first turn — you brought it up, you start.
        .link({ household: household.id, turn: userId }),
    );
    await logActivity({
      householdId: household.id,
      actorId: userId,
      actorName: myName,
      type: 'chore_added',
      metadata: { chore: name },
    });
  };

  const onAddMine = async () => {
    const title = mineDraft.trim().replace(/\s+/g, ' ');
    if (!title) return;
    setMineDraft('');
    const taskId = id();
    await db.transact(
      db.tx.personalTasks[taskId]
        .update({ title, status: 'open', createdAt: nowMs() })
        .link({ household: household.id, owner: userId }),
    );
    // Personal tasks stay out of the home diary — they're yours.
  };

  const onMineDone = async (taskId: string) => {
    await db.transact(db.tx.personalTasks[taskId].update({ status: 'done' }));
  };

  // Swipe → Remove is already a two-step, deliberate gesture, so it deletes
  // directly (no extra confirm dialog).
  const onMineDelete = (taskId: string) => {
    void db.transact(db.tx.personalTasks[taskId].delete());
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
      db.tx.chores[choreId].update({ updatedAt: ts }).link({ turn: next ?? userId }),
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

  const onDeleteChore = (choreId: string, choreName: string) => {
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
  };

  const renderChore = (chore: (typeof chores)[number]) => {
    const holderId = effectiveTurn(memberIds, chore.turn?.id);
    const mine = holderId === userId;
    const open = openChoreId === chore.id;
    const events = chore.events ?? [];
    return (
      <SwipeRow
        key={chore.id}
        onPass={mine ? () => advance(chore.id, chore.name, holderId, 'pass') : undefined}
        onRemove={() => onDeleteChore(chore.id, chore.name)}
      >
        <View style={styles.choreCard}>
          <Pressable style={styles.choreRow} onPress={() => setOpenChoreId(open ? null : chore.id)}>
            <View style={[styles.turnBar, mine ? styles.turnBarMine : styles.turnBarOther]} />
            <View style={styles.choreNameWrap}>
              <Text style={styles.choreName}>{chore.name}</Text>
              {!mine ? (
                <Text style={styles.choreSub}>
                  {nameById[holderId ?? ''] ?? 'someone'}’s turn
                </Text>
              ) : null}
            </View>
            <DoneButton onPress={() => advance(chore.id, chore.name, holderId, 'done')} />
          </Pressable>

          {open ? (
            <View style={styles.history}>
              {events.length === 0 ? (
                <Text style={styles.historyEmpty}>No history yet.</Text>
              ) : (
                events.map((ev) => (
                  <View key={ev.id} style={styles.historyRow}>
                    <Text style={styles.historyText}>
                      {ev.by?.id === userId ? 'You' : (nameById[ev.by?.id ?? ''] ?? 'Someone')}{' '}
                      {ev.type === 'done' ? 'did it' : 'passed'}
                    </Text>
                    <Text style={styles.historyTime}>{timeAgo(Number(ev.at))}</Text>
                  </View>
                ))
              )}
            </View>
          ) : null}
        </View>
      </SwipeRow>
    );
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Hero topInset={insets.top}>
          <HeroBar houseName={household.name} sub="Tasks · whose turn" you={myName} youSeed={userId} />
          <HeroEyebrow>Tasks · shared fairly</HeroEyebrow>
          <HeroTitle>{myChores.length > 0 ? 'It’s your turn' : 'All caught up 🌿'}</HeroTitle>
          <StatStrip stats={taskStats} />
        </Hero>

        <View style={styles.body}>
          <View style={styles.section}>
            <SectionHead title="Mine" />
            {myChores.map(renderChore)}
            {myTasks.map((t) => (
              <SwipeRow key={t.id} onRemove={() => onMineDelete(t.id)}>
                <View style={[styles.choreCard, styles.mineCard]}>
                  <View style={styles.choreRow}>
                    <View style={[styles.turnBar, styles.turnBarMine]} />
                    <Text style={[styles.choreName, styles.choreNameWrap]}>{t.title}</Text>
                    <DoneButton onPress={() => onMineDone(t.id)} />
                  </View>
                </View>
              </SwipeRow>
            ))}
            {myTasks.length === 0 && myChores.length === 0 ? (
              <Text style={styles.muted}>Nothing on your plate. 🤍</Text>
            ) : null}
            <View style={styles.addRow}>
              <TextInput
                style={styles.input}
                placeholder="Add a task for yourself…"
                placeholderTextColor={Roomie.sub}
                value={mineDraft}
                onChangeText={setMineDraft}
                onSubmitEditing={onAddMine}
                returnKeyType="done"
              />
              <Pressable style={styles.addButton} onPress={onAddMine}>
                <Text style={styles.addButtonLabel}>+</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <SectionHead title="House" />
            <View style={styles.addRow}>
              <TextInput
                style={styles.input}
                placeholder="Add a house chore… (trash)"
                placeholderTextColor={Roomie.sub}
                value={houseDraft}
                onChangeText={setHouseDraft}
                onSubmitEditing={onAddHouse}
                returnKeyType="done"
              />
              <Pressable style={styles.addButton} onPress={onAddHouse}>
                <Text style={styles.addButtonLabel}>+</Text>
              </Pressable>
            </View>
            {otherChores.length === 0 ? (
              <Text style={styles.muted}>All quiet. 🌿</Text>
            ) : (
              otherChores.map(renderChore)
            )}

            {librarySections.length > 0 ? (
              <Pressable style={styles.seedLink} onPress={() => setShowLibrary(!showLibrary)}>
                <Text style={styles.seedLinkLabel}>
                  {showLibrary ? '− Hide suggestions' : '+ Add from suggestions'}
                </Text>
              </Pressable>
            ) : null}
            {showLibrary
              ? librarySections.map((g) => (
                  <View key={g.group} style={styles.libGroup}>
                    <Text style={styles.libGroupTitle}>{g.group}</Text>
                    {g.chores.map((s) => (
                      <Pressable
                        key={s.name}
                        style={styles.libRow}
                        onPress={() => onAddSuggestion(s.name)}
                      >
                        <Text style={styles.libName}>+ {s.name}</Text>
                        <Text style={styles.libHint}>{s.hint}</Text>
                      </Pressable>
                    ))}
                  </View>
                ))
              : null}
          </View>
        </View>
      </ScrollView>
    </View>
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
  screen: { flex: 1, backgroundColor: Roomie.canvas },
  scroll: { paddingBottom: 120 },
  body: { padding: 18, gap: 16 },
  section: { gap: 11 },
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
  },
  addButtonLabel: { color: Roomie.onAccent, fontSize: 24, fontFamily: RoomieFonts.bodyBold },
  muted: { fontSize: 15, fontFamily: RoomieFonts.body, color: Roomie.sub },
  choreCard: {
    backgroundColor: Roomie.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EFEBE1',
    paddingHorizontal: 14,
    paddingVertical: 2,
    shadowColor: Roomie.forestInk,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  choreRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  turnBar: { width: 4, alignSelf: 'stretch', borderRadius: 9, minHeight: 22 },
  turnBarMine: { backgroundColor: Roomie.coral },
  turnBarOther: { backgroundColor: Roomie.hairline },
  choreNameWrap: { flex: 1 },
  choreName: { fontSize: 16, fontFamily: RoomieFonts.display, color: Roomie.ink },
  choreSub: { fontSize: 11.5, fontFamily: RoomieFonts.bodySemi, color: Roomie.ink3, marginTop: 1 },
  done: {
    backgroundColor: Roomie.sage,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
    shadowColor: Roomie.dropGreen ?? Roomie.forestInk,
    shadowOpacity: 0.18,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 },
  },
  donePressed: { transform: [{ scale: 0.94 }], opacity: 0.92 },
  doneLabel: { color: Roomie.onAccent, fontSize: 14, fontFamily: RoomieFonts.bodyBold },
  mineCard: {},
  // swipe-revealed actions
  actions: { flexDirection: 'row', alignItems: 'stretch', marginLeft: 8 },
  action: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18, borderRadius: 18 },
  actPass: { backgroundColor: Roomie.gold, marginRight: 8 },
  actPassLabel: { fontFamily: RoomieFonts.bodyBold, fontSize: 14, color: Roomie.forestInk },
  actRemove: { backgroundColor: Roomie.danger },
  actRemoveLabel: { fontFamily: RoomieFonts.bodyBold, fontSize: 14, color: '#fff' },
  history: {
    borderTopWidth: 1,
    borderTopColor: Roomie.hairline,
    paddingVertical: 8,
    gap: 4,
  },
  historyEmpty: { fontSize: 13, fontFamily: RoomieFonts.body, color: Roomie.sub },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  historyText: { fontSize: 13, fontFamily: RoomieFonts.bodySemi, color: Roomie.ink },
  historyTime: { fontSize: 12, fontFamily: RoomieFonts.body, color: Roomie.ink3 },
  seedLink: { paddingVertical: 8 },
  seedLinkLabel: { fontSize: 13, fontFamily: RoomieFonts.bodySemi, color: Roomie.forest },
  libGroup: { gap: 2, marginBottom: 6 },
  libGroupTitle: {
    fontSize: 11,
    fontFamily: RoomieFonts.bodyBold,
    color: Roomie.sub,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  libRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 4,
  },
  libName: { fontSize: 14, fontFamily: RoomieFonts.bodySemi, color: Roomie.ink },
  libHint: { fontSize: 12, fontFamily: RoomieFonts.body, color: Roomie.sub },
});
