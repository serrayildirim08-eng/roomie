// Money — the Splitwise core, v1: equal split, manual entry. You add an expense
// (pick who paid, pick who shares — defaults: you paid, everyone shares), the app
// shows who owes whom, and you can settle a debt. Past expenses are listed and a
// wrong one can be deleted. OCR / unequal splits come later.

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
import { db } from '@/lib/db';

import {
  computeNetCents,
  formatEur,
  nowMs,
  parseAmountToCents,
  simplifyDebts,
} from './money-logic';

// "vfya+clerk_test@example.com" → "vfya"
function emailName(email?: string): string | undefined {
  const local = email?.split('@')[0]?.replace(/\+.*$/, '');
  return local || undefined;
}

export function MoneyScreen({ userId }: { userId: string }) {
  const { isLoading, error, data } = db.useQuery({
    memberships: {
      $: { where: { 'user.id': userId, status: 'active' } },
      household: {
        memberships: { $: { where: { status: 'active' } }, user: {} },
        expenses: { paidBy: {}, participants: {} },
        settlements: { fromUser: {}, toUser: {} },
      },
    },
  });

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  // null = defaults (payer: me, participants: everyone) until the user picks.
  const [paidById, setPaidById] = useState<string | null>(null);
  const [pickedIds, setPickedIds] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
        <Text style={styles.muted}>Couldn&apos;t load money.</Text>
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

  const members = household.memberships
    .map((m) => ({
      userId: m.user?.id ?? '',
      // displayName is stamped at join (and self-healed on app open); fall back
      // to the email's local part for old rows so nobody renders as "Someone".
      name: m.displayName ?? emailName(m.user?.email) ?? 'Someone',
    }))
    .filter((m) => m.userId);
  const nameById = Object.fromEntries(members.map((m) => [m.userId, m.name]));
  const myName = nameById[userId] ?? 'You';

  const expenses = household.expenses.map((e) => ({
    amountCents: e.amountCents,
    paidById: e.paidBy?.id ?? '',
    participantIds: e.participants.map((p) => p.id),
  }));
  const settlements = household.settlements.map((s) => ({
    amountCents: s.amountCents,
    fromId: s.fromUser?.id ?? '',
    toId: s.toUser?.id ?? '',
  }));

  const net = computeNetCents(members, expenses, settlements);
  // Privacy: you only see debts you're part of — never what two housemates
  // owe each other.
  const debts = simplifyDebts(net).filter((d) => d.fromId === userId || d.toId === userId);

  // Effective form choices (fall back to defaults until the user picks).
  const payerId = paidById ?? userId;
  const participantIds = pickedIds ?? members.map((m) => m.userId);

  const toggleParticipant = (memberId: string) => {
    const next = participantIds.includes(memberId)
      ? participantIds.filter((p) => p !== memberId)
      : [...participantIds, memberId];
    if (next.length === 0) return; // at least one person shares the expense
    setPickedIds(next);
  };

  const recentExpenses = [...household.expenses].sort(
    (a, b) => Number(b.createdAt) - Number(a.createdAt),
  );

  const onAdd = async () => {
    const trimmed = title.trim();
    const cents = parseAmountToCents(amount);
    if (!trimmed) return setFormError('What was it for?');
    if (!cents) return setFormError('Enter a valid amount.');
    setBusy(true);
    setFormError(null);
    try {
      const expenseId = id();
      await db.transact(
        db.tx.expenses[expenseId]
          .update({ title: trimmed, amountCents: cents, currency: 'EUR', createdAt: nowMs() })
          .link({
            household: household.id,
            paidBy: payerId,
            participants: participantIds,
          }),
      );
      await logActivity({
        householdId: household.id,
        actorId: userId,
        actorName: myName,
        type: 'expense_added',
        metadata: { title: trimmed, amountCents: cents, paidByName: nameById[payerId] },
      });
      setTitle('');
      setAmount('');
      setPaidById(null);
      setPickedIds(null);
    } catch {
      setFormError('Could not add. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = (expenseId: string, expenseTitle: string) => {
    Alert.alert('Delete expense?', `"${expenseTitle}" will be removed and debts recalculated.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await db.transact(db.tx.expenses[expenseId].delete());
            await logActivity({
              householdId: household.id,
              actorId: userId,
              actorName: myName,
              type: 'expense_deleted',
              metadata: { title: expenseTitle },
            });
          })();
        },
      },
    ]);
  };

  const onSettle = async (fromId: string, toId: string, amountCents: number) => {
    const settlementId = id();
    await db.transact(
      db.tx.settlements[settlementId]
        .update({ amountCents, currency: 'EUR', createdAt: nowMs() })
        .link({ household: household.id, fromUser: fromId, toUser: toId }),
    );
    await logActivity({
      householdId: household.id,
      actorId: fromId,
      actorName: nameById[fromId] ?? 'Someone',
      type: 'debt_settled',
      metadata: { amountCents, toName: nameById[toId] ?? 'someone' },
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Money</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Add an expense</Text>
          <TextInput
            style={styles.input}
            placeholder="What for? (e.g. groceries)"
            placeholderTextColor="#9b9b9b"
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={styles.input}
            placeholder="Amount (€)"
            placeholderTextColor="#9b9b9b"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
          <Text style={styles.pickerLabel}>Paid by</Text>
          <View style={styles.chipRow}>
            {members.map((m) => {
              const selected = m.userId === payerId;
              return (
                <Pressable
                  key={m.userId}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setPaidById(m.userId)}
                >
                  <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                    {m.userId === userId ? 'You' : m.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.pickerLabel}>Split between</Text>
          <View style={styles.chipRow}>
            {members.map((m) => {
              const selected = participantIds.includes(m.userId);
              return (
                <Pressable
                  key={m.userId}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => toggleParticipant(m.userId)}
                >
                  <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                    {m.userId === userId ? 'You' : m.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.hint}>Split equally among {participantIds.length}</Text>
          {formError ? <Text style={styles.error}>{formError}</Text> : null}
          <Pressable
            style={[styles.button, busy && styles.disabled]}
            onPress={onAdd}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonLabel}>Add expense</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.section}>Your balance</Text>
        {debts.length === 0 ? (
          <Text style={styles.muted}>You&apos;re all square. 🤍</Text>
        ) : (
          debts.map((d, idx) => {
            const youPay = d.fromId === userId;
            const label = youPay
              ? `You owe ${nameById[d.toId]}`
              : `${nameById[d.fromId]} owes you`;
            return (
              <View key={idx} style={styles.debtRow}>
                <Text style={styles.debtText}>{label}</Text>
                <Text style={styles.debtAmount}>{formatEur(d.amountCents)}</Text>
                <Pressable
                  style={styles.settle}
                  onPress={() => onSettle(d.fromId, d.toId, d.amountCents)}
                >
                  <Text style={styles.settleLabel}>Settle</Text>
                </Pressable>
              </View>
            );
          })
        )}

        <Text style={styles.section}>Recent expenses</Text>
        {recentExpenses.length === 0 ? (
          <Text style={styles.muted}>Nothing yet.</Text>
        ) : (
          recentExpenses.map((e) => (
            <View key={e.id} style={styles.expenseRow}>
              <View style={styles.expenseInfo}>
                <Text style={styles.debtText}>{e.title}</Text>
                <Text style={styles.expenseMeta}>
                  {e.paidBy?.id === userId ? 'You' : (nameById[e.paidBy?.id ?? ''] ?? 'Someone')}{' '}
                  paid · {e.participants.length} sharing
                </Text>
              </View>
              <Text style={styles.debtAmount}>{formatEur(e.amountCents)}</Text>
              <Pressable
                style={styles.delete}
                onPress={() => onDelete(e.id, e.title)}
                hitSlop={8}
                accessibilityLabel={`Delete ${e.title}`}
              >
                <Text style={styles.deleteLabel}>✕</Text>
              </Pressable>
            </View>
          ))
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
  container: { padding: 24, gap: 16 },
  heading: { fontSize: 34, fontFamily: RoomieFonts.displayBold, color: Roomie.ink },
  card: {
    backgroundColor: Roomie.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Roomie.hairline,
    padding: 16,
    gap: 10,
  },
  cardTitle: { fontSize: 17, fontFamily: RoomieFonts.display, color: Roomie.ink },
  input: {
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
  hint: { fontSize: 13, fontFamily: RoomieFonts.body, color: Roomie.sub },
  pickerLabel: { fontSize: 13, fontFamily: RoomieFonts.bodyBold, color: Roomie.sub },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: Roomie.hairline,
    backgroundColor: Roomie.input,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipSelected: { backgroundColor: Roomie.accent, borderColor: Roomie.accent },
  chipLabel: { fontSize: 14, fontFamily: RoomieFonts.bodySemi, color: Roomie.ink },
  chipLabelSelected: { color: Roomie.onAccent, fontFamily: RoomieFonts.bodyBold },
  button: {
    backgroundColor: Roomie.accent,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: Roomie.accent,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  disabled: { opacity: 0.6 },
  buttonLabel: { color: Roomie.onAccent, fontSize: 16, fontFamily: RoomieFonts.bodyBold },
  section: {
    fontSize: 12,
    fontFamily: RoomieFonts.bodyBold,
    color: Roomie.sub,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 8,
  },
  muted: { fontSize: 15, fontFamily: RoomieFonts.body, color: Roomie.sub },
  debtRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  debtText: { flex: 1, fontSize: 15, fontFamily: RoomieFonts.bodySemi, color: Roomie.ink },
  debtAmount: { fontSize: 15, fontFamily: RoomieFonts.bodyBold, color: Roomie.ink },
  settle: {
    backgroundColor: Roomie.sage,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  settleLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
  expenseRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  expenseInfo: { flex: 1, gap: 2 },
  expenseMeta: { fontSize: 12, color: '#9b9b9b' },
  delete: { padding: 6 },
  deleteLabel: { fontSize: 15, color: '#c0392b' },
  error: { color: '#c0392b', fontSize: 14 },
});
