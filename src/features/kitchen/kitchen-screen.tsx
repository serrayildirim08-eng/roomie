// Kitchen — the shared pantry + shopping list, v1: manual entry.
//
// One item, two states: 'in' (in the pantry) and 'out' (on the shopping
// list). Typed names go through the vendored Ollie normalizer so "süt" and
// "milk" land on one row. "Out" moves an item to the shopping list; anyone
// can claim it ("I'll get it" — kills double-buying); the claimer taps
// "Got it ✓", which restocks the item, appends a purchase-log event (fuel
// for later cadence predictions) and offers an optional hop into Money.
// Aging is a quiet faded dot — never a count, never shame.

import { id } from '@instantdb/react-native';
import { useEffect, useRef, useState } from 'react';
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
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Card,
  ChunkyButton,
  Hero,
  HeroBar,
  HeroEyebrow,
  HeroTitle,
  SectionHead,
  StatStrip,
} from '@/components/ui/kit';
import { Roomie, RoomieFonts } from '@/constants/theme';
import { logActivity } from '@/features/activity/activity';
import { nowMs, parseAmountToCents } from '@/features/money/money-logic';
import { db } from '@/lib/db';

import { ageOf } from './aging';
import { itemEmoji } from './alias-data';
import { GroceryScan } from './grocery-scan';
import { resolveItem } from './normalize';

// "vfya+clerk_test@example.com" → "vfya"
function emailName(email?: string): string | undefined {
  const local = email?.split('@')[0]?.replace(/\+.*$/, '');
  return local || undefined;
}

export function KitchenScreen({ userId }: { userId: string }) {
  const insets = useSafeAreaInsets();
  const { isLoading, error, data } = db.useQuery({
    memberships: {
      $: { where: { 'user.id': userId, status: 'active' } },
      household: {
        memberships: { $: { where: { status: 'active' } }, user: {} },
        pantryItems: { claimedBy: {} },
      },
    },
  });

  const [draft, setDraft] = useState('');
  const [scanning, setScanning] = useState(false);
  // Money bridge: when set, we just restocked this item and offer "Add to Money?"
  const [bridge, setBridge] = useState<{ itemName: string } | null>(null);
  const [bridgeAmount, setBridgeAmount] = useState('');
  // A quiet, transient "you got it" whisper — never a tally, just a soft ack.
  const [whisper, setWhisper] = useState<string | null>(null);
  const whisperTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // In-flight guard so a fast double-tap can't write the same item twice.
  const savingRef = useRef(false);

  const flashWhisper = (msg: string) => {
    if (whisperTimer.current) clearTimeout(whisperTimer.current);
    setWhisper(msg);
    whisperTimer.current = setTimeout(() => setWhisper(null), 1600);
  };

  useEffect(() => {
    return () => {
      if (whisperTimer.current) clearTimeout(whisperTimer.current);
    };
  }, []);

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
        <Text style={styles.muted}>Couldn&apos;t load the kitchen.</Text>
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

  const nameById = Object.fromEntries(
    household.memberships.map((m) => [
      m.user?.id ?? '',
      m.displayName ?? emailName(m.user?.email) ?? 'Someone',
    ]),
  );
  const myName = nameById[userId] ?? 'You';
  const members = household.memberships
    .map((m) => ({ id: m.user?.id ?? '', name: nameById[m.user?.id ?? ''] ?? 'Someone' }))
    .filter((m) => m.id);

  const items = [...household.pantryItems].sort((a, b) => a.name.localeCompare(b.name));
  const inPantry = items.filter((it) => it.status === 'in');
  const shopping = items.filter((it) => it.status === 'out');
  const now = nowMs();
  const runningLow = inPantry.filter(
    (it) => ageOf(Number(it.addedAt), it.shelfLifeDays ?? null, now) !== 'fresh',
  ).length;
  const kitchenStats = [
    { k: 'To buy', v: String(shopping.length) },
    { k: 'In pantry', v: String(inPantry.length) },
    { k: 'Running low', v: String(runningLow) },
  ];

  const onAdd = async () => {
    const typed = draft.trim();
    if (!typed) return;
    if (savingRef.current) return; // already writing — ignore the double-tap
    savingRef.current = true;
    const resolved = resolveItem(typed);
    setDraft('');

    try {
      // Same item already known? Revive it instead of duplicating.
      const existing = items.find((it) => it.normalizedName === resolved.normalizedName);
      if (existing) {
        if (existing.status === 'in') return; // already in the pantry — nothing to do
        await db.transact(
          db.tx.pantryItems[existing.id]
            .update({ status: 'in', addedAt: now, updatedAt: now })
            .unlink({ claimedBy: existing.claimedBy?.id ?? '' }),
        );
      } else {
        const itemId = id();
        await db.transact(
          db.tx.pantryItems[itemId]
            .update({
              name: resolved.name,
              normalizedName: resolved.normalizedName,
              category: resolved.category,
              status: 'in',
              shelfLifeDays: resolved.shelfLifeDays ?? undefined,
              addedAt: now,
              createdAt: now,
              updatedAt: now,
            })
            .link({ household: household.id }),
        );
      }
      await logActivity({
        householdId: household.id,
        actorId: userId,
        actorName: myName,
        type: 'pantry_added',
        metadata: { item: resolved.name },
      });
    } catch {
      // Write failed — tell the user softly and give their text back.
      setDraft(typed);
      flashWhisper('Could not save — try again.');
    } finally {
      savingRef.current = false;
    }
  };

  const onOut = async (itemId: string, itemName: string) => {
    await db.transact(db.tx.pantryItems[itemId].update({ status: 'out', updatedAt: nowMs() }));
    await logActivity({
      householdId: household.id,
      actorId: userId,
      actorName: myName,
      type: 'pantry_out',
      metadata: { item: itemName },
    });
  };

  const onClaim = async (itemId: string, itemName: string) => {
    await db.transact(
      db.tx.pantryItems[itemId].update({ updatedAt: nowMs() }).link({ claimedBy: userId }),
    );
    await logActivity({
      householdId: household.id,
      actorId: userId,
      actorName: myName,
      type: 'pantry_claimed',
      metadata: { item: itemName },
    });
  };

  const onGotIt = async (itemId: string, itemName: string, normalizedName: string) => {
    const ts = nowMs();
    const purchaseId = id();
    await db.transact([
      db.tx.pantryItems[itemId]
        .update({ status: 'in', addedAt: ts, updatedAt: ts })
        .unlink({ claimedBy: userId }),
      // Invisible foundation: every restock is a timestamped purchase event.
      db.tx.purchases[purchaseId]
        .update({ itemName: normalizedName, at: ts })
        .link({ household: household.id, by: userId }),
    ]);
    await logActivity({
      householdId: household.id,
      actorId: userId,
      actorName: myName,
      type: 'pantry_got',
      metadata: { item: itemName },
    });
    // Calm, transient ack — fades on its own; the Money hop still pops below.
    if (whisperTimer.current) clearTimeout(whisperTimer.current);
    setWhisper('Got it — house remembers.');
    whisperTimer.current = setTimeout(() => setWhisper(null), 1600);
    setBridgeAmount('');
    setBridge({ itemName }); // offer the Money hop
  };

  const onBridgeConfirm = async () => {
    if (!bridge) return;
    const cents = parseAmountToCents(bridgeAmount);
    if (!cents) {
      setBridge(null);
      return;
    }
    const expenseId = id();
    await db.transact(
      db.tx.expenses[expenseId]
        .update({
          title: bridge.itemName,
          amountCents: cents,
          currency: 'EUR',
          createdAt: nowMs(),
        })
        .link({
          household: household.id,
          paidBy: userId,
          participants: household.memberships.map((m) => m.user?.id ?? '').filter(Boolean),
        }),
    );
    await logActivity({
      householdId: household.id,
      actorId: userId,
      actorName: myName,
      type: 'expense_added',
      metadata: { title: bridge.itemName, amountCents: cents, paidByName: myName },
    });
    setBridge(null);
    setBridgeAmount('');
  };

  const onDelete = (itemId: string, itemName: string) => {
    Alert.alert('Remove from the kitchen?', `"${itemName}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await db.transact(db.tx.pantryItems[itemId].delete());
            await logActivity({
              householdId: household.id,
              actorId: userId,
              actorName: myName,
              type: 'pantry_removed',
              metadata: { item: itemName },
            });
          })();
        },
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Hero topInset={insets.top}>
          <HeroBar houseName={household.name} sub="Kitchen" you={myName} youSeed={userId} />
          <HeroEyebrow>Kitchen · shopping</HeroEyebrow>
          <HeroTitle>
            {shopping.length === 0 ? 'Pantry’s stocked 🌿' : `${shopping.length} to grab next run`}
          </HeroTitle>
          <StatStrip stats={kitchenStats} />
        </Hero>

        <View style={styles.body}>
          <View style={styles.addRow}>
            <TextInput
              style={styles.input}
              placeholder="Add something… (süt, coffee)"
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

          <ChunkyButton label="🛒  Start shopping" onPress={() => setScanning(true)} />

          {bridge ? (
            <Card pad style={styles.bridgeCard}>
              <Text style={styles.bridgeTitle}>Add {bridge.itemName} to Money?</Text>
              <View style={styles.bridgeRow}>
                <TextInput
                  style={[styles.input, styles.bridgeInput]}
                  placeholder="€ (optional)"
                  placeholderTextColor={Roomie.sub}
                  keyboardType="decimal-pad"
                  value={bridgeAmount}
                  onChangeText={setBridgeAmount}
                  maxLength={9}
                  autoFocus
                />
                <Pressable style={styles.bridgeAdd} onPress={onBridgeConfirm}>
                  <Text style={styles.bridgeAddLabel}>Add</Text>
                </Pressable>
                <Pressable style={styles.bridgeSkip} onPress={() => setBridge(null)}>
                  <Text style={styles.bridgeSkipLabel}>Skip</Text>
                </Pressable>
              </View>
              <Text style={styles.hint}>Split equally among {household.memberships.length}</Text>
            </Card>
          ) : null}

          <View style={styles.section}>
            <SectionHead title="Shopping list" />
            {shopping.length === 0 ? (
              <Card pad>
                <Text style={styles.muted}>Nothing needed. 🌿</Text>
              </Card>
            ) : (
              <Card>
                {shopping.map((it, idx) => {
                  const claimerId = it.claimedBy?.id;
                  const mine = claimerId === userId;
                  return (
                    <View key={it.id} style={[styles.row, idx > 0 && styles.rowDivided]}>
                      <Text style={styles.rowEmoji}>{itemEmoji(it.name, it.category)}</Text>
                      <Text style={styles.rowName}>{it.name}</Text>
                      {claimerId && !mine ? (
                        <Text style={styles.claimedNote}>{nameById[claimerId]} is getting it</Text>
                      ) : mine ? (
                        <Pressable
                          style={styles.gotIt}
                          onPress={() => onGotIt(it.id, it.name, it.normalizedName)}
                        >
                          <Text style={styles.gotItLabel}>Got it ✓</Text>
                        </Pressable>
                      ) : (
                        <Pressable style={styles.claim} onPress={() => onClaim(it.id, it.name)}>
                          <Text style={styles.claimLabel}>I&apos;ll get it</Text>
                        </Pressable>
                      )}
                      <Pressable
                        style={styles.delete}
                        onPress={() => onDelete(it.id, it.name)}
                        hitSlop={8}
                        accessibilityLabel={`Remove ${it.name}`}
                      >
                        <Text style={styles.deleteLabel}>✕</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </Card>
            )}
          </View>

          <View style={styles.section}>
            <SectionHead title="In the pantry" />
            {inPantry.length === 0 ? (
              <Card pad>
                <Text style={styles.muted}>Pantry&apos;s bare. Add what&apos;s in the kitchen. 🫙</Text>
              </Card>
            ) : (
              <Card>
                {inPantry.map((it, idx) => {
                  const age = ageOf(Number(it.addedAt), it.shelfLifeDays ?? null, now);
                  const aging = age !== 'fresh';
                  const askStillHere = age === 'still_here_prompt';
                  return (
                    <View key={it.id} style={idx > 0 && styles.rowDivided}>
                      <View style={styles.row}>
                        <Text style={styles.rowEmoji}>{itemEmoji(it.name, it.category)}</Text>
                        <Text style={[styles.rowName, aging && styles.rowNameAging]}>{it.name}</Text>
                        {aging && !askStillHere ? <View style={styles.agingDot} /> : null}
                        <Pressable style={styles.outButton} onPress={() => onOut(it.id, it.name)}>
                          <Text style={styles.outLabel}>Out</Text>
                        </Pressable>
                        <Pressable
                          style={styles.delete}
                          onPress={() => onDelete(it.id, it.name)}
                          hitSlop={8}
                          accessibilityLabel={`Remove ${it.name}`}
                        >
                          <Text style={styles.deleteLabel}>✕</Text>
                        </Pressable>
                      </View>
                      {askStillHere ? (
                        <View style={styles.stillHere}>
                          <Text style={styles.stillHereText}>Still need this?</Text>
                          <Pressable
                            style={styles.stillYes}
                            onPress={() => {
                              const ts = nowMs();
                              void db.transact(
                                db.tx.pantryItems[it.id].update({ addedAt: ts, updatedAt: ts }),
                              );
                            }}
                          >
                            <Text style={styles.stillYesLabel}>Yes</Text>
                          </Pressable>
                          <Pressable style={styles.stillOut} onPress={() => onOut(it.id, it.name)}>
                            <Text style={styles.stillOutLabel}>Out</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </Card>
            )}
          </View>
        </View>
      </ScrollView>

      {whisper ? (
        <Animated.View
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(460)}
          style={styles.whisper}
          pointerEvents="none"
        >
          <Text style={styles.whisperText}>{whisper}</Text>
        </Animated.View>
      ) : null}

      <GroceryScan
        visible={scanning}
        onClose={() => setScanning(false)}
        householdId={household.id}
        userId={userId}
        myName={myName}
        members={members}
        existingItems={items}
        nameById={nameById}
      />
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
  bridgeCard: { gap: 8, backgroundColor: Roomie.sageSoft },
  bridgeTitle: { fontSize: 15, fontFamily: RoomieFonts.display, color: Roomie.ink },
  bridgeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  bridgeInput: { flex: 1 },
  bridgeAdd: {
    backgroundColor: Roomie.sage,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  bridgeAddLabel: { color: Roomie.onAccent, fontSize: 14, fontFamily: RoomieFonts.bodyBold },
  bridgeSkip: { paddingVertical: 12, paddingHorizontal: 6 },
  bridgeSkipLabel: { color: Roomie.sub, fontSize: 14, fontFamily: RoomieFonts.bodySemi },
  hint: { fontSize: 12, fontFamily: RoomieFonts.body, color: Roomie.sub },
  section: { gap: 11 },
  muted: { fontSize: 15, fontFamily: RoomieFonts.body, color: Roomie.sub },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  rowDivided: { borderTopWidth: 1, borderTopColor: Roomie.rule },
  rowEmoji: { fontSize: 20, width: 28, textAlign: 'center' },
  rowName: { flex: 1, fontSize: 15, fontFamily: RoomieFonts.display, color: Roomie.ink },
  rowNameAging: { color: Roomie.sub },
  agingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Roomie.gold },
  stillHere: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 13,
    marginTop: -4,
  },
  stillHereText: { flex: 1, fontSize: 13, fontFamily: RoomieFonts.body, color: Roomie.sub },
  stillYes: {
    borderWidth: 1,
    borderColor: Roomie.hairline,
    backgroundColor: Roomie.input,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 13,
  },
  stillYesLabel: { fontSize: 13, fontFamily: RoomieFonts.bodySemi, color: Roomie.ink },
  stillOut: { borderRadius: 12, paddingVertical: 6, paddingHorizontal: 13 },
  stillOutLabel: { fontSize: 13, fontFamily: RoomieFonts.bodySemi, color: Roomie.sub },
  outButton: {
    borderWidth: 1,
    borderColor: Roomie.hairline,
    backgroundColor: Roomie.input,
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  outLabel: { fontSize: 13, fontFamily: RoomieFonts.bodySemi, color: Roomie.ink },
  claim: {
    backgroundColor: Roomie.accent,
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  claimLabel: { color: Roomie.onAccent, fontSize: 13, fontFamily: RoomieFonts.bodyBold },
  gotIt: {
    backgroundColor: Roomie.sage,
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  gotItLabel: { color: Roomie.onAccent, fontSize: 13, fontFamily: RoomieFonts.bodyBold },
  claimedNote: { fontSize: 13, fontFamily: RoomieFonts.bodySemi, color: Roomie.sage },
  delete: { padding: 6 },
  deleteLabel: { fontSize: 15, color: Roomie.danger },
  whisper: { position: 'absolute', left: 0, right: 0, bottom: 100, alignItems: 'center' },
  whisperText: {
    backgroundColor: Roomie.sageSoft,
    color: Roomie.sage,
    fontSize: 13,
    fontFamily: RoomieFonts.bodySemi,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
