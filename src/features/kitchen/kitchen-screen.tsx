// Kitchen — the shared pantry + shopping list, v1: manual entry.
//
// One item, two states: 'in' (in the pantry) and 'out' (on the shopping
// list). Typed names go through the vendored Ollie normalizer so "süt" and
// "milk" land on one row. "Ran out" moves an item to the shopping list; anyone
// can claim it ("I'll get it" — kills double-buying); the claimer taps
// "Got it ✓", which restocks the item, appends a purchase-log event (fuel
// for later cadence predictions) and offers an optional hop into Money.
//
// The body is a two-segment split — "To buy" (the shopping list + its verbs)
// and "In pantry" (what we have, grouped by category). Aging is a quiet,
// labelled pill — never a count, never shame. Remove hides behind a
// swipe-left so a mis-tap can't delete a row.

import { id } from '@instantdb/react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Card,
  ChunkyButton,
  Hero,
  HeroBar,
  HeroEyebrow,
  HeroTitle,
  StatStrip,
} from '@/components/ui/kit';
import { Radius, Roomie, RoomieFonts } from '@/constants/theme';
import { logActivity } from '@/features/activity/activity';
import { nowMs, parseAmountToCents } from '@/features/money/money-logic';
import { db } from '@/lib/db';

import { ageOf } from './aging';
import { CATEGORY_EMOJI, itemEmoji, type GroceryCategory } from './alias-data';
import { GroceryScan } from './grocery-scan';
import { resolveItem } from './normalize';
import { type DietTag } from './off-map';

// Fixed, sensible order for the pantry's category sections; empty groups skip.
const GROUP_ORDER: GroceryCategory[] = [
  'dairy',
  'produce',
  'drinks',
  'pantry',
  'snacks',
  'meat',
  'deli',
  'frozen',
  'cleaning',
  'supplements',
  'other',
];

const CATEGORY_LABEL: Record<GroceryCategory, string> = {
  dairy: 'Dairy',
  produce: 'Produce',
  drinks: 'Drinks',
  pantry: 'Pantry',
  snacks: 'Snacks',
  meat: 'Meat',
  deli: 'Deli',
  frozen: 'Frozen',
  cleaning: 'Cleaning',
  supplements: 'Supplements',
  other: 'Other',
};

// The four diet flags a shared kitchen surfaces, in a stable display order.
// Badges stay tiny and quiet: a leaf/carrot for the "is" flags, a short GF/LF
// for the "free-of" ones. Nothing here is a rule — just a heads-up.
const DIET_ORDER: DietTag[] = ['vegan', 'vegetarian', 'gluten-free', 'lactose-free'];
const DIET_BADGE: Record<DietTag, string> = {
  vegan: '🌱',
  vegetarian: '🥕',
  'gluten-free': 'GF',
  'lactose-free': 'LF',
};
const DIET_LABEL: Record<DietTag, string> = {
  vegan: 'Vegan',
  vegetarian: 'Vegetarian',
  'gluten-free': 'Gluten-free',
  'lactose-free': 'Lactose-free',
};

// Read the stored dietTags off a pantry item, tolerating undefined / bad shapes
// (the json field can be absent or, in theory, malformed). Filtering through
// DIET_ORDER drops anything unrecognised and fixes the display order.
function dietTagsOf(raw: unknown): DietTag[] {
  if (!Array.isArray(raw)) return [];
  return DIET_ORDER.filter((t) => raw.includes(t));
}

// Tiny, quiet badges shown after an item's name. Wraps gracefully; renders
// nothing when the item carries no diet flags.
function DietBadges({ tags }: { tags: DietTag[] }) {
  if (tags.length === 0) return null;
  return (
    <View style={styles.badges}>
      {tags.map((t) => (
        <View key={t} style={styles.badge}>
          <Text style={styles.badgeText}>{DIET_BADGE[t]}</Text>
        </View>
      ))}
    </View>
  );
}

// "vfya+clerk_test@example.com" → "vfya"
function emailName(email?: string): string | undefined {
  const local = email?.split('@')[0]?.replace(/\+.*$/, '');
  return local || undefined;
}

// A row whose Remove stays hidden until you swipe left — keeps every resting
// row to one clear action and kills the mis-tap-deletes problem.
function SwipeRow({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  const ref = useRef<SwipeableMethods>(null);
  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      rightThreshold={36}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          style={styles.swipeRemove}
          onPress={() => {
            ref.current?.close();
            onRemove();
          }}
        >
          <Text style={styles.swipeRemoveX}>✕</Text>
          <Text style={styles.swipeRemoveLabel}>Remove</Text>
        </Pressable>
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}


// Tiny safe reader for nudge metadata.
function metaStr(metadata: unknown, key: string): string | null {
  return metadata && typeof metadata === 'object' && key in metadata
    ? String((metadata as Record<string, unknown>)[key])
    : null;
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
    // My quiet heads-ups ("she already got it") — newest first, unseen only.
    nudges: {
      $: { where: { toUserId: userId, seenAt: { $isNull: true } }, order: { createdAt: 'desc' } },
    },
  });

  const [draft, setDraft] = useState('');
  const [scanning, setScanning] = useState(false);
  // Which job is on screen — the buy list, or what we have. Default to the
  // pantry (the calm, browsable view); the segment carries live counts.
  const [tab, setTab] = useState<'toBuy' | 'inPantry'>('inPantry');
  // Optional, calm diet filter over the pantry list. Default: show everything.
  const [dietFilter, setDietFilter] = useState<DietTag | null>(null);
  // Long-press a pantry row → move it to the right shelf. The fix is durable:
  // items are deduped by normalizedName and revived (never re-created), so a
  // corrected category sticks for good.
  const [moveTarget, setMoveTarget] = useState<{ id: string; name: string; category: string } | null>(
    null,
  );
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
  const myNudges = data?.nudges ?? [];
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

  // Group the pantry by category, in a fixed order, skipping empty groups.
  // Unknown categories fold into "Other". Within a group, anything aging
  // (non-'fresh') floats to the top; the rest stays alphabetical.
  const catOf = (c: string): GroceryCategory =>
    (CATEGORY_LABEL as Record<string, string>)[c] ? (c as GroceryCategory) : 'other';
  // Which diet flags actually appear on something in the pantry — only these
  // get a filter chip (never offer a filter nobody can use). Empty ⇒ no filter
  // row at all.
  const pantryDiets = DIET_ORDER.filter((t) =>
    inPantry.some((it) => dietTagsOf(it.dietTags).includes(t)),
  );
  const activeDiet = dietFilter && pantryDiets.includes(dietFilter) ? dietFilter : null;
  const visiblePantry = activeDiet
    ? inPantry.filter((it) => dietTagsOf(it.dietTags).includes(activeDiet))
    : inPantry;

  const grouped = GROUP_ORDER.map((cat) => ({
    cat,
    rows: visiblePantry
      .filter((it) => catOf(it.category) === cat)
      .sort((a, b) => {
        const aAging = ageOf(Number(a.addedAt), a.shelfLifeDays ?? null, now) !== 'fresh' ? 1 : 0;
        const bAging = ageOf(Number(b.addedAt), b.shelfLifeDays ?? null, now) !== 'fresh' ? 1 : 0;
        return bAging - aAging || a.name.localeCompare(b.name);
      }),
  })).filter((g) => g.rows.length > 0);

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
              householdId: household.id,
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

  const onGotIt = async (
    itemId: string,
    itemName: string,
    normalizedName: string,
    claimerId?: string | null,
  ) => {
    const ts = nowMs();
    const purchaseId = id();
    await db.transact([
      db.tx.pantryItems[itemId]
        .update({ status: 'in', addedAt: ts, updatedAt: ts })
        .unlink({ claimedBy: claimerId ?? userId }),
      // Invisible foundation: every restock is a timestamped purchase event.
      db.tx.purchases[purchaseId]
        .update({ itemName: normalizedName, at: ts, householdId: household.id })
        .link({ household: household.id, by: userId }),
    ]);
    await logActivity({
      householdId: household.id,
      actorId: userId,
      actorName: myName,
      type: 'pantry_got',
      metadata: { item: itemName },
    });
    // Someone else had claimed it — leave THEM a quiet heads-up so they don't
    // buy it twice. Personal nudge, not diary noise.
    if (claimerId && claimerId !== userId) {
      void db.transact(
        db.tx.nudges[id()]
          .update({
            type: 'claim_covered',
            metadata: { item: itemName, gotByName: myName },
            householdId: household.id,
            toUserId: claimerId,
            createdAt: ts,
          })
          .link({ household: household.id }),
      );
    }
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
          householdId: household.id, // create-rule gate (AGENTS.md)
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
          <View style={styles.seg}>
            <Pressable
              style={[styles.segItem, tab === 'toBuy' && styles.segItemOn]}
              onPress={() => setTab('toBuy')}
            >
              <Text style={[styles.segLabel, tab === 'toBuy' && styles.segLabelOn]}>
                To buy ({shopping.length})
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segItem, tab === 'inPantry' && styles.segItemOn]}
              onPress={() => setTab('inPantry')}
            >
              <Text style={[styles.segLabel, tab === 'inPantry' && styles.segLabelOn]}>
                In pantry ({inPantry.length})
              </Text>
            </Pressable>
          </View>

          {tab === 'toBuy' ? (
            <>
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
                      <SwipeRow key={it.id} onRemove={() => onDelete(it.id, it.name)}>
                        <View style={[styles.rowWrap, idx > 0 && styles.rowDivided]}>
                          <View style={styles.row}>
                            <View style={styles.emojiChip}>
                              <Text style={styles.emojiChipText}>
                                {itemEmoji(it.name, it.category)}
                              </Text>
                            </View>
                            <View style={styles.meta}>
                              <Text style={styles.iname} numberOfLines={1}>
                                {it.name}
                              </Text>
                              <Text style={styles.icap}>on the list</Text>
                              <DietBadges tags={dietTagsOf(it.dietTags)} />
                            </View>
                            {claimerId && !mine ? (
                              <View style={styles.claimedCol}>
                                <Text style={styles.claimedNote}>
                                  {nameById[claimerId]} is getting it
                                </Text>
                                <Pressable
                                  style={styles.gotIt}
                                  onPress={() =>
                                    onGotIt(it.id, it.name, it.normalizedName, claimerId)
                                  }
                                >
                                  <Text style={styles.gotItLabel}>I got it ✓</Text>
                                </Pressable>
                              </View>
                            ) : mine ? (
                              <Pressable
                                style={styles.gotIt}
                                onPress={() => onGotIt(it.id, it.name, it.normalizedName)}
                              >
                                <Text style={styles.gotItLabel}>Got it ✓</Text>
                              </Pressable>
                            ) : (
                              <Pressable
                                style={styles.claim}
                                onPress={() => onClaim(it.id, it.name)}
                              >
                                <Text style={styles.claimLabel}>I&apos;ll get it</Text>
                              </Pressable>
                            )}
                          </View>
                        </View>
                      </SwipeRow>
                    );
                  })}
                </Card>
              )}
            </>
          ) : (
            <>
              {inPantry.length === 0 ? (
                <Card pad>
                  <Text style={styles.muted}>
                    Pantry&apos;s bare. Add what&apos;s in the kitchen. 🫙
                  </Text>
                </Card>
              ) : (
                <>
                  {pantryDiets.length > 0 ? (
                    <View style={styles.dietFilters}>
                      <Pressable
                        style={[styles.dietChip, !activeDiet && styles.dietChipOn]}
                        onPress={() => setDietFilter(null)}
                      >
                        <Text style={[styles.dietChipLabel, !activeDiet && styles.dietChipLabelOn]}>
                          All
                        </Text>
                      </Pressable>
                      {pantryDiets.map((t) => {
                        const on = activeDiet === t;
                        return (
                          <Pressable
                            key={t}
                            style={[styles.dietChip, on && styles.dietChipOn]}
                            onPress={() => setDietFilter(on ? null : t)}
                          >
                            <Text style={styles.dietChipBadge}>{DIET_BADGE[t]}</Text>
                            <Text style={[styles.dietChipLabel, on && styles.dietChipLabelOn]}>
                              {DIET_LABEL[t]}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}

                  {grouped.length === 0 ? (
                    <Card pad>
                      <Text style={styles.muted}>Nothing here with that flag. 🌿</Text>
                    </Card>
                  ) : null}

                  {grouped.map((g) => (
                    <View key={g.cat} style={styles.group}>
                      <Text style={styles.groupHead}>
                        {CATEGORY_EMOJI[g.cat]}  {CATEGORY_LABEL[g.cat]}
                      </Text>
                      <Card>
                        {g.rows.map((it, idx) => {
                          const age = ageOf(Number(it.addedAt), it.shelfLifeDays ?? null, now);
                          const aging = age !== 'fresh';
                          const askStillHere = age === 'still_here_prompt';
                          const pillText = age === 'faded' ? 'getting low' : 'use soon';
                          return (
                            <SwipeRow key={it.id} onRemove={() => onDelete(it.id, it.name)}>
                              <Pressable
                                onLongPress={() =>
                                  setMoveTarget({ id: it.id, name: it.name, category: it.category })
                                }
                                delayLongPress={350}
                                style={[styles.rowWrap, idx > 0 && styles.rowDivided]}
                              >
                                <View style={styles.row}>
                                  <View style={styles.emojiChip}>
                                    <Text style={styles.emojiChipText}>
                                      {itemEmoji(it.name, it.category)}
                                    </Text>
                                  </View>
                                  <View style={styles.meta}>
                                    <Text
                                      style={[styles.iname, aging && styles.inameDim]}
                                      numberOfLines={1}
                                    >
                                      {it.name}
                                    </Text>
                                    {!aging ? <Text style={styles.icap}>still fresh</Text> : null}
                                    <DietBadges tags={dietTagsOf(it.dietTags)} />
                                  </View>
                                  {aging ? (
                                    <Text
                                      style={[
                                        styles.agePill,
                                        age === 'faded' ? styles.agePillLow : styles.agePillSoon,
                                      ]}
                                    >
                                      {pillText}
                                    </Text>
                                  ) : null}
                                  <Pressable
                                    style={styles.outButton}
                                    onPress={() => onOut(it.id, it.name)}
                                  >
                                    <Text style={styles.outLabel}>Ran out</Text>
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
                                          db.tx.pantryItems[it.id].update({
                                            addedAt: ts,
                                            updatedAt: ts,
                                          }),
                                        );
                                      }}
                                    >
                                      <Text style={styles.stillYesLabel}>Yes</Text>
                                    </Pressable>
                                    <Pressable
                                      style={styles.stillOut}
                                      onPress={() => onOut(it.id, it.name)}
                                    >
                                      <Text style={styles.stillOutLabel}>Ran out</Text>
                                    </Pressable>
                                  </View>
                                ) : null}
                              </Pressable>
                            </SwipeRow>
                          );
                        })}
                      </Card>
                    </View>
                  ))}
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {myNudges.length > 0 ? (
        <View style={styles.nudgeWrap}>
          {myNudges.slice(0, 1).map((n) => {
            const item = metaStr(n.metadata, 'item');
            const who = metaStr(n.metadata, 'gotByName');
            return (
              <View key={n.id} style={styles.nudge}>
                <Text style={styles.nudgeText}>
                  {who ?? 'Someone'} already got {item ? `“${item}”` : 'it'} — no need. 🌿
                </Text>
                <Pressable
                  onPress={() =>
                    void db.transact(db.tx.nudges[n.id].update({ seenAt: nowMs() }))
                  }
                >
                  <Text style={styles.nudgeDismiss}>Okay</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}

      {moveTarget ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setMoveTarget(null)}
        >
          <Pressable style={styles.moveBackdrop} onPress={() => setMoveTarget(null)}>
            <Pressable style={styles.moveSheet} onPress={() => {}}>
              <Text style={styles.moveTitle}>Where does “{moveTarget.name}” live?</Text>
              <View style={styles.moveGrid}>
                {GROUP_ORDER.map((cat) => {
                  const current = catOf(moveTarget.category) === cat;
                  return (
                    <Pressable
                      key={cat}
                      style={[styles.moveChip, current && styles.moveChipOn]}
                      onPress={() => {
                        if (!current) {
                          void db.transact(
                            db.tx.pantryItems[moveTarget.id].update({
                              category: cat,
                              updatedAt: nowMs(),
                            }),
                          );
                        }
                        setMoveTarget(null);
                      }}
                    >
                      <Text style={styles.moveChipEmoji}>{CATEGORY_EMOJI[cat]}</Text>
                      <Text style={[styles.moveChipLabel, current && styles.moveChipLabelOn]}>
                        {CATEGORY_LABEL[cat]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

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

  // segmented control — one job on screen at a time
  seg: { flexDirection: 'row', backgroundColor: '#EAE5DA', borderRadius: 16, padding: 4, gap: 4 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12 },
  segItemOn: {
    backgroundColor: Roomie.card,
    shadowColor: Roomie.forestInk,
    shadowOpacity: 0.08,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  segLabel: { fontFamily: RoomieFonts.display, fontSize: 14, color: Roomie.sub },
  segLabelOn: { color: Roomie.forest },

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

  // a pantry category section: quiet head + a floating card of rows
  group: { gap: 8 },
  groupHead: {
    fontFamily: RoomieFonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1,
    color: Roomie.ink3,
    paddingHorizontal: 4,
  },

  muted: { fontSize: 15, fontFamily: RoomieFonts.body, color: Roomie.sub },

  // rows — an opaque wrapper (so the swiped Remove stays hidden at rest)
  rowWrap: { backgroundColor: Roomie.card },
  rowDivided: { borderTopWidth: 1, borderTopColor: Roomie.rule },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  emojiChip: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Roomie.sageSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiChipText: { fontSize: 22 },
  meta: { flex: 1, minWidth: 0 },
  iname: { fontSize: 16, fontFamily: RoomieFonts.display, color: Roomie.ink },
  inameDim: { color: Roomie.sub },
  icap: { fontSize: 12, fontFamily: RoomieFonts.body, color: Roomie.ink3, marginTop: 1 },

  // tiny, quiet diet badges after the name; wrap when there are a few
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  badge: {
    backgroundColor: Roomie.sageSoft,
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 10.5, fontFamily: RoomieFonts.bodyBold, color: Roomie.forest },

  // optional diet filter chips above the pantry list
  dietFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dietChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: Roomie.hairline,
    backgroundColor: Roomie.input,
    borderRadius: Radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  dietChipOn: { backgroundColor: Roomie.sageSoft, borderColor: Roomie.forest },
  dietChipBadge: { fontSize: 12 },
  dietChipLabel: { fontSize: 13, fontFamily: RoomieFonts.bodySemi, color: Roomie.sub },
  dietChipLabelOn: { color: Roomie.forest },

  // labelled freshness pill (replaces the old bare aging dot)
  agePill: {
    fontSize: 11,
    fontFamily: RoomieFonts.bodyBold,
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  agePillLow: { backgroundColor: '#FFF0E6', color: Roomie.coral },
  agePillSoon: { backgroundColor: '#FBEFD0', color: '#8A6A12' },

  // still-here inline strip (kept, calmer spacing, indented under the name)
  stillHere: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 70,
    paddingRight: 14,
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

  // one primary action per row
  outButton: {
    borderWidth: 1,
    borderColor: Roomie.hairline,
    backgroundColor: Roomie.input,
    borderRadius: 13,
    paddingVertical: 9,
    paddingHorizontal: 15,
  },
  outLabel: { fontSize: 14, fontFamily: RoomieFonts.bodyBold, color: Roomie.ink },
  claim: {
    backgroundColor: Roomie.accent,
    borderRadius: 13,
    paddingVertical: 9,
    paddingHorizontal: 15,
  },
  claimLabel: { color: Roomie.onAccent, fontSize: 14, fontFamily: RoomieFonts.bodyBold },
  gotIt: {
    backgroundColor: Roomie.forest2,
    borderRadius: 13,
    paddingVertical: 9,
    paddingHorizontal: 15,
  },
  gotItLabel: { color: Roomie.onAccent, fontSize: 14, fontFamily: RoomieFonts.bodyBold },
  claimedNote: { fontSize: 12.5, fontFamily: RoomieFonts.bodyBold, color: Roomie.forest2 },

  // swipe-left → Remove
  swipeRemove: {
    backgroundColor: Roomie.danger,
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  swipeRemoveX: { color: '#fff', fontSize: 16 },
  swipeRemoveLabel: { color: '#fff', fontSize: 12, fontFamily: RoomieFonts.bodyBold },

  claimedCol: { alignItems: 'flex-end', gap: 6 },
  nudgeWrap: { position: 'absolute', left: 16, right: 16, top: 8 },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: Roomie.sageSoft,
    borderRadius: Radius.chip,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  nudgeText: { flex: 1, fontSize: 13, fontFamily: RoomieFonts.bodySemi, color: Roomie.sage },
  nudgeDismiss: { fontSize: 13, fontFamily: RoomieFonts.bodySemi, color: Roomie.ink },
  moveBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 30, 24, 0.45)',
    justifyContent: 'flex-end',
  },
  moveSheet: {
    backgroundColor: Roomie.card,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    padding: 20,
    paddingBottom: 34,
  },
  moveTitle: {
    fontSize: 15,
    fontFamily: RoomieFonts.bodySemi,
    color: Roomie.ink,
    marginBottom: 14,
  },
  moveGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  moveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: Roomie.canvas,
  },
  moveChipOn: { backgroundColor: Roomie.sageSoft },
  moveChipEmoji: { fontSize: 14 },
  moveChipLabel: { fontSize: 13, fontFamily: RoomieFonts.bodySemi, color: Roomie.ink },
  moveChipLabelOn: { color: Roomie.sage },
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
