// Money — the Splitwise core, v1: equal split, manual entry. You add an expense
// (you paid, split equally among everyone), the app shows who owes whom, and you
// can settle a debt. OCR / pick-payer / unequal splits come later.

import { id } from '@instantdb/react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { logActivity } from '@/features/activity/activity';
import { db } from '@/lib/db';

import { computeNetCents, formatEur, parseAmountToCents, simplifyDebts } from './money-logic';

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
    .map((m) => ({ userId: m.user?.id ?? '', name: m.displayName ?? 'Someone' }))
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
  const debts = simplifyDebts(net);

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
          .update({ title: trimmed, amountCents: cents, currency: 'EUR', createdAt: Date.now() })
          .link({
            household: household.id,
            paidBy: userId,
            participants: members.map((m) => m.userId),
          }),
      );
      await logActivity({
        householdId: household.id,
        actorId: userId,
        actorName: myName,
        type: 'expense_added',
        metadata: { title: trimmed, amountCents: cents },
      });
      setTitle('');
      setAmount('');
    } catch {
      setFormError('Could not add. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const onSettle = async (fromId: string, toId: string, amountCents: number) => {
    const settlementId = id();
    await db.transact(
      db.tx.settlements[settlementId]
        .update({ amountCents, currency: 'EUR', createdAt: Date.now() })
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
          <Text style={styles.hint}>You paid · split equally among {members.length}</Text>
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

        <Text style={styles.section}>Who owes whom</Text>
        {debts.length === 0 ? (
          <Text style={styles.muted}>All settled up. 🎉</Text>
        ) : (
          debts.map((d, idx) => {
            const youPay = d.fromId === userId;
            const youGet = d.toId === userId;
            const label = youPay
              ? `You owe ${nameById[d.toId]}`
              : youGet
                ? `${nameById[d.fromId]} owes you`
                : `${nameById[d.fromId]} owes ${nameById[d.toId]}`;
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
  safe: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 24, gap: 16 },
  heading: { fontSize: 30, fontWeight: '700', color: '#111' },
  card: { backgroundColor: '#f5f5f5', borderRadius: 16, padding: 16, gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111' },
  input: {
    borderWidth: 1,
    borderColor: '#e2e2e2',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111',
  },
  hint: { fontSize: 13, color: '#9b9b9b' },
  button: { backgroundColor: '#111', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  buttonLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  section: {
    fontSize: 13,
    color: '#9b9b9b',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 8,
  },
  muted: { fontSize: 15, color: '#9b9b9b' },
  debtRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  debtText: { flex: 1, fontSize: 15, color: '#111' },
  debtAmount: { fontSize: 15, fontWeight: '700', color: '#111' },
  settle: { backgroundColor: '#111', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  settleLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
  error: { color: '#c0392b', fontSize: 14 },
});
