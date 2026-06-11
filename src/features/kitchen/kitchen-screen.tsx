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
import { logActivity } from '@/features/activity/activity';
import { nowMs, parseAmountToCents } from '@/features/money/money-logic';
import { db } from '@/lib/db';

import { ageOf } from './aging';
import { CATEGORY_EMOJI } from './alias-data';
import type { GroceryCategory } from './alias-data';
import { resolveItem } from './normalize';

// "vfya+clerk_test@example.com" → "vfya"
function emailName(email?: string): string | undefined {
  const local = email?.split('@')[0]?.replace(/\+.*$/, '');
  return local || undefined;
}

export function KitchenScreen({ userId }: { userId: string }) {
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
  // Money bridge: when set, we just restocked this item and offer "Add to Money?"
  const [bridge, setBridge] = useState<{ itemName: string } | null>(null);
  const [bridgeAmount, setBridgeAmount] = useState('');

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

  const items = [...household.pantryItems].sort((a, b) => a.name.localeCompare(b.name));
  const inPantry = items.filter((it) => it.status === 'in');
  const shopping = items.filter((it) => it.status === 'out');
  const now = nowMs();

  const onAdd = async () => {
    const typed = draft.trim();
    if (!typed) return;
    const resolved = resolveItem(typed);
    setDraft('');

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
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Kitchen</Text>

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

        {bridge ? (
          <View style={styles.bridgeCard}>
            <Text style={styles.bridgeTitle}>Add {bridge.itemName} to Money?</Text>
            <View style={styles.bridgeRow}>
              <TextInput
                style={[styles.input, styles.bridgeInput]}
                placeholder="€ (optional)"
                placeholderTextColor={Roomie.sub}
                keyboardType="decimal-pad"
                value={bridgeAmount}
                onChangeText={setBridgeAmount}
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
          </View>
        ) : null}

        <Text style={styles.section}>Shopping list</Text>
        {shopping.length === 0 ? (
          <Text style={styles.muted}>Nothing needed. 🌿</Text>
        ) : (
          shopping.map((it) => {
            const claimerId = it.claimedBy?.id;
            const mine = claimerId === userId;
            return (
              <View key={it.id} style={styles.row}>
                <Text style={styles.rowEmoji}>
                  {CATEGORY_EMOJI[(it.category as GroceryCategory) ?? 'other'] ?? '🧺'}
                </Text>
                <Text style={styles.rowName}>{it.name}</Text>
                {claimerId && !mine ? (
                  <Text style={styles.claimedNote}>{nameById[claimerId]} is getting it</Text>
                ) : mine ? (
                  <Pressable style={styles.gotIt} onPress={() => onGotIt(it.id, it.name, it.normalizedName)}>
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
          })
        )}

        <Text style={styles.section}>In the pantry</Text>
        {inPantry.length === 0 ? (
          <Text style={styles.muted}>Pantry&apos;s bare. Add what&apos;s in the kitchen. 🫙</Text>
        ) : (
          inPantry.map((it) => {
            const age = ageOf(Number(it.addedAt), it.shelfLifeDays ?? null, now);
            const aging = age !== 'fresh';
            return (
              <View key={it.id} style={styles.row}>
                <Text style={styles.rowEmoji}>
                  {CATEGORY_EMOJI[(it.category as GroceryCategory) ?? 'other'] ?? '🧺'}
                </Text>
                <Text style={[styles.rowName, aging && styles.rowNameAging]}>{it.name}</Text>
                {aging ? <View style={styles.agingDot} /> : null}
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
  container: { padding: 24, gap: 14 },
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
  bridgeCard: {
    backgroundColor: Roomie.sageSoft,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Roomie.hairline,
    padding: 14,
    gap: 8,
  },
  bridgeTitle: { fontSize: 15, fontFamily: RoomieFonts.bodyBold, color: Roomie.ink },
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
  section: {
    fontSize: 12,
    fontFamily: RoomieFonts.bodyBold,
    color: Roomie.sub,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 8,
  },
  muted: { fontSize: 15, fontFamily: RoomieFonts.body, color: Roomie.sub },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  rowEmoji: { fontSize: 16, width: 24 },
  rowName: { flex: 1, fontSize: 15, fontFamily: RoomieFonts.bodySemi, color: Roomie.ink },
  rowNameAging: { color: Roomie.sub },
  agingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Roomie.hairline },
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
  claimedNote: { fontSize: 13, fontFamily: RoomieFonts.body, color: Roomie.sage },
  delete: { padding: 6 },
  deleteLabel: { fontSize: 15, color: Roomie.danger },
});
