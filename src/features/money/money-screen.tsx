// Money — the Splitwise core, v1: equal split, manual entry. You add an expense
// (pick who paid, pick who shares — defaults: you paid, everyone shares), the app
// shows who owes whom, and you can settle a debt. Past expenses are listed and a
// wrong one can be deleted. OCR / unequal splits come later.

import { id } from '@instantdb/react-native';
import { useState } from 'react';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Card,
  Hero,
  HeroBar,
  HeroEyebrow,
  SectionHead,
  StatStrip,
} from '@/components/ui/kit';
import { Radius, Roomie, RoomieFonts } from '@/constants/theme';
import { logActivity } from '@/features/activity/activity';
import { db } from '@/lib/db';

import {
  computeNetCents,
  formatEur,
  nowMs,
  parseAmountToCents,
  simplifyDebts,
} from './money-logic';
import { daysUntilDue, dueDayLabel, monthlyTotalCents, periodOf } from './bills-logic';
import { ReceiptsGallery } from './receipts';

// "vfya+clerk_test@example.com" → "vfya"
function emailName(email?: string): string | undefined {
  const local = email?.split('@')[0]?.replace(/\+.*$/, '');
  return local || undefined;
}

export function MoneyScreen({ userId }: { userId: string }) {
  const insets = useSafeAreaInsets();
  const { isLoading, error, data } = db.useQuery({
    memberships: {
      $: { where: { 'user.id': userId, status: 'active' } },
      household: {
        memberships: { $: { where: { status: 'active' } }, user: {} },
        expenses: { paidBy: {}, participants: {} },
        settlements: { fromUser: {}, toUser: {} },
        bills: { paidBy: {}, participants: {} },
      },
    },
  });

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  // null = defaults (payer: me, participants: everyone) until the user picks.
  const [paidById, setPaidById] = useState<string | null>(null);
  const [pickedIds, setPickedIds] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [settling, setSettling] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Add-bill sheet state. Sheet closed until the + is tapped.
  const [billSheet, setBillSheet] = useState(false);
  const [billName, setBillName] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billDueDay, setBillDueDay] = useState('1');
  const [billPayerId, setBillPayerId] = useState<string | null>(null);
  const [billPickedIds, setBillPickedIds] = useState<string[] | null>(null);
  const [billBusy, setBillBusy] = useState(false);
  const [billError, setBillError] = useState<string | null>(null);
  const [receiptsOpen, setReceiptsOpen] = useState(false);

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
  const nameById: Record<string, string> = Object.fromEntries(members.map((m) => [m.userId, m.name]));
  // A roommate who has LEFT no longer has a membership row, but their money is
  // still on the books. Learn a readable name for them from the user links on
  // the expenses/settlements so their open balance isn't labelled "Someone".
  const learnName = (u?: { id?: string; email?: string }) => {
    if (u?.id && !nameById[u.id]) nameById[u.id] = emailName(u.email) ?? 'Past roommate';
  };
  household.expenses.forEach((e) => {
    learnName(e.paidBy ?? undefined);
    e.participants.forEach((p) => learnName(p));
  });
  household.settlements.forEach((s) => {
    learnName(s.fromUser ?? undefined);
    learnName(s.toUser ?? undefined);
  });
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

  // Hero balance — your single net number, plus a 3-up strip.
  const myNet = net[userId] ?? 0;
  const balanceText = myNet === 0 ? '€0.00' : `${myNet > 0 ? '+' : '−'}${formatEur(Math.abs(myNet))}`;
  const balanceCap =
    myNet > 0 ? "you're owed overall" : myNet < 0 ? 'you owe overall' : 'all settled up 🤍';
  // One calm clarity line for the top of the body: my single biggest position,
  // drawn from the same me-only debts the list below uses (no everyone-totals).
  const biggest = debts.reduce<(typeof debts)[number] | null>(
    (max, d) => (max === null || d.amountCents > max.amountCents ? d : max),
    null,
  );
  const clarityLine = !biggest
    ? "You're all square. 🤍"
    : biggest.fromId === userId
      ? `You owe ${nameById[biggest.toId]} ${formatEur(biggest.amountCents)}.`
      : `${nameById[biggest.fromId]} owes you ${formatEur(biggest.amountCents)}.`;

  const owedToYou = debts.filter((d) => d.toId === userId).reduce((s, d) => s + d.amountCents, 0);
  const youOweTotal = debts.filter((d) => d.fromId === userId).reduce((s, d) => s + d.amountCents, 0);
  const loggedTotal = expenses.reduce((s, e) => s + e.amountCents, 0);
  const balanceStats = [
    { k: 'Owed to you', v: formatEur(owedToYou) },
    { k: 'You owe', v: formatEur(youOweTotal) },
    { k: 'Logged', v: formatEur(loggedTotal) },
  ];

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

  const period = periodOf(nowMs());
  const bills = [...(household.bills ?? [])].sort(
    (a, b) => daysUntilDue(a.dueDay, nowMs()) - daysUntilDue(b.dueDay, nowMs()),
  );
  const billsTotal = monthlyTotalCents(bills);

  const onAddBill = async () => {
    const name = billName.trim();
    const cents = parseAmountToCents(billAmount);
    const dueDay = Math.round(Number(billDueDay));
    if (!name) return setBillError('What repeats every month?');
    if (!cents) return setBillError('Enter a valid amount.');
    if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 31)
      return setBillError('Due day is 1–31.');
    const payer = billPayerId ?? userId;
    const shareIds = billPickedIds ?? members.map((m) => m.userId);
    if (shareIds.length === 0) return setBillError('Someone has to share it.');
    setBillBusy(true);
    setBillError(null);
    const ts = nowMs();
    try {
      await db.transact(
        db.tx.bills[id()]
          .update({
            name,
            amountCents: cents,
            currency: 'EUR',
            dueDay,
            householdId: household.id, // create-rule gate (AGENTS.md)
            createdAt: ts,
            updatedAt: ts,
          })
          .link({ household: household.id, paidBy: payer, participants: shareIds }),
      );
      await logActivity({
        householdId: household.id,
        actorId: userId,
        actorName: myName,
        type: 'bill_added',
        metadata: { title: name, amountCents: cents },
      });
      setBillSheet(false);
      setBillName('');
      setBillAmount('');
      setBillDueDay('1');
      setBillPayerId(null);
      setBillPickedIds(null);
    } catch {
      setBillError('Could not add. Try again.');
    } finally {
      setBillBusy(false);
    }
  };

  // "Paid ✓" — stamp an ORDINARY expense from the template. Split and balances
  // ride the existing fairness math; the bill only remembers the period so the
  // same month can't be stamped twice.
  const onStampBill = (bill: (typeof bills)[number], amountCents: number) => {
    void (async () => {
      const shareIds = bill.participants.map((u) => u.id);
      const payer = bill.paidBy?.id ?? userId;
      if (shareIds.length === 0) return;
      const ts = nowMs();
      try {
        await db.transact([
          db.tx.expenses[id()]
            .update({
              title: bill.name,
              amountCents,
              currency: 'EUR',
              householdId: household.id, // create-rule gate (AGENTS.md)
              createdAt: ts,
            })
            .link({ household: household.id, paidBy: payer, participants: shareIds }),
          db.tx.bills[bill.id].update({ lastPaidPeriod: period, updatedAt: ts }),
        ]);
      } catch {
        Alert.alert('Could not save', 'That tap didn’t stick — try again in a moment.');
        return;
      }
      await logActivity({
        householdId: household.id,
        actorId: userId,
        actorName: myName,
        type: 'bill_paid',
        metadata: { title: bill.name, amountCents, paidByName: nameById[payer] },
      });
    })();
  };

  // Long-press = this month's amount was different (electricity months).
  // iOS-only prompt is fine — Roomie ships Apple-only.
  const onStampBillAdjusted = (bill: (typeof bills)[number]) => {
    Alert.prompt(
      `Paid ${bill.name}`,
      'Amount this month?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stamp',
          onPress: (v?: string) => {
            const cents = parseAmountToCents(v ?? '');
            if (cents) onStampBill(bill, cents);
          },
        },
      ],
      'plain-text',
      (bill.amountCents / 100).toFixed(2).replace('.', ','),
    );
  };

  const onDeleteBill = (billId: string, name: string) => {
    Alert.alert('Remove bill?', `"${name}" stops repeating. Past months stay in the ledger.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void db.transact(db.tx.bills[billId].delete()),
      },
    ]);
  };

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
          .update({
            title: trimmed,
            amountCents: cents,
            currency: 'EUR',
            householdId: household.id, // create-rule gate (AGENTS.md)
            createdAt: nowMs(),
          })
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

  // Only YOU can record that you paid someone back. The button is rendered just
  // for your own debts, and the perm `settlements.create = isFromUser` enforces
  // it server-side — a creditor can no longer forge a debtor's payment.
  const onSettle = (toId: string, amountCents: number) => {
    Alert.alert('Mark as paid?', `Record that you paid ${nameById[toId] ?? 'them'} ${formatEur(amountCents)}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes, paid',
        onPress: () => {
          void (async () => {
            if (settling) return;
            setSettling(true);
            try {
              const settlementId = id();
              await db.transact(
                db.tx.settlements[settlementId]
                  .update({
                    amountCents,
                    currency: 'EUR',
                    householdId: household.id,
                    fromUserId: userId, // create rule: only the payer may record
                    createdAt: nowMs(),
                  })
                  .link({ household: household.id, fromUser: userId, toUser: toId }),
              );
              await logActivity({
                householdId: household.id,
                actorId: userId,
                actorName: myName,
                type: 'debt_settled',
                metadata: { amountCents, toName: nameById[toId] ?? 'someone' },
              });
            } catch {
              Alert.alert('Could not settle', 'Try again.');
            } finally {
              setSettling(false);
            }
          })();
        },
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Hero topInset={insets.top}>
          <HeroBar houseName={household.name} sub="Money" you={myName} youSeed={userId} />
          <HeroEyebrow>Your balance overall</HeroEyebrow>
          <Text style={styles.heroBalance}>{balanceText}</Text>
          <Text style={styles.heroCap}>{balanceCap}</Text>
          <StatStrip stats={balanceStats} />
        </Hero>

        <View style={styles.body}>
          <Text style={styles.clarity}>{clarityLine}</Text>

          <View style={styles.section}>
            <View style={styles.billsHead}>
              <SectionHead title="Bills" />
              {bills.length > 0 ? (
                <Text style={styles.billsTotal}>monthly {formatEur(billsTotal)}</Text>
              ) : null}
            </View>
            {bills.length === 0 ? (
              <Card pad>
                <Text style={styles.muted}>
                  Rent, internet, subscriptions — set them up once, stamp them monthly. 📄
                </Text>
              </Card>
            ) : (
              <Card>
                {bills.map((b, idx) => {
                  const paidThisMonth = b.lastPaidPeriod === period;
                  const days = daysUntilDue(b.dueDay, nowMs());
                  const dueSoon = !paidThisMonth && days <= 7;
                  const payerName =
                    b.paidBy?.id === userId ? 'You' : (nameById[b.paidBy?.id ?? ''] ?? 'Someone');
                  const shareCount = b.participants.length;
                  return (
                    <View key={b.id} style={[styles.expenseRow, idx > 0 && styles.rowDivided]}>
                      <View style={styles.expenseInfo}>
                        <View style={styles.billNameRow}>
                          <Text style={styles.debtText}>{b.name}</Text>
                          {dueSoon ? (
                            <Text style={styles.duePill}>
                              {days === 0 ? 'due today' : `due in ${days}d`}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={styles.expenseMeta}>
                          {dueDayLabel(b.dueDay)} · {payerName} pay{payerName === 'You' ? '' : 's'} ·
                          split {shareCount} way{shareCount > 1 ? 's' : ''}
                        </Text>
                      </View>
                      <View style={styles.billRight}>
                        <Text style={styles.debtAmount}>{formatEur(b.amountCents)}</Text>
                        {paidThisMonth ? (
                          <Text style={styles.billPaidDone}>Paid ✓</Text>
                        ) : (
                          <Pressable
                            style={styles.billPaid}
                            onPress={() => onStampBill(b, b.amountCents)}
                            onLongPress={() => onStampBillAdjusted(b)}
                            delayLongPress={350}
                          >
                            <Text style={styles.billPaidLabel}>Paid ✓</Text>
                          </Pressable>
                        )}
                      </View>
                      <Pressable
                        style={styles.delete}
                        onPress={() => onDeleteBill(b.id, b.name)}
                        hitSlop={8}
                        accessibilityLabel={`Remove ${b.name}`}
                      >
                        <Text style={styles.deleteLabel}>✕</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </Card>
            )}
            <Pressable style={styles.billAdd} onPress={() => setBillSheet(true)}>
              <Text style={styles.billAddLabel}>+ Add a bill</Text>
            </Pressable>
          </View>

          <Card pad style={styles.formCard}>
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
            maxLength={9}
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
          </Card>

          <View style={styles.section}>
            <SectionHead title="Your balance" />
            {debts.length === 0 ? (
              <Card pad>
                <Text style={styles.muted}>You&apos;re all square. 🤍</Text>
              </Card>
            ) : (
              <Card>
                {debts.map((d, idx) => {
                  const youPay = d.fromId === userId;
                  const label = youPay
                    ? `You owe ${nameById[d.toId]}`
                    : `${nameById[d.fromId]} owes you`;
                  return (
                    <View key={idx} style={[styles.debtRow, idx > 0 && styles.rowDivided]}>
                      <Text style={styles.debtText}>{label}</Text>
                      <Text
                        style={[
                          styles.debtAmount,
                          youPay ? styles.amountOwe : styles.amountPositive,
                        ]}
                      >
                        {formatEur(d.amountCents)}
                      </Text>
                      {youPay ? (
                        <Pressable
                          style={[styles.settlePink, settling && styles.disabled]}
                          onPress={() => onSettle(d.toId, d.amountCents)}
                          disabled={settling}
                        >
                          <Text style={styles.settlePinkLabel}>Settle up</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </Card>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.billsHead}>
              <SectionHead title="Recent expenses" />
              <Pressable onPress={() => setReceiptsOpen(true)} hitSlop={6}>
                <Text style={styles.receiptsLink}>🧾 Receipts</Text>
              </Pressable>
            </View>
            {recentExpenses.length === 0 ? (
              <Card pad>
                <Text style={styles.muted}>Nothing logged yet.</Text>
              </Card>
            ) : (
              <Card>
                {recentExpenses.map((e, idx) => (
                  <View key={e.id} style={[styles.expenseRow, idx > 0 && styles.rowDivided]}>
                    <View style={styles.expenseInfo}>
                      <Text style={styles.debtText}>{e.title}</Text>
                      <Text style={styles.expenseMeta}>
                        {e.paidBy?.id === userId
                          ? 'You'
                          : (nameById[e.paidBy?.id ?? ''] ?? 'Someone')}{' '}
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
                ))}
              </Card>
            )}
          </View>
        </View>
      </ScrollView>

      <ReceiptsGallery
        householdId={household.id}
        visible={receiptsOpen}
        onClose={() => setReceiptsOpen(false)}
        recentExpenses={recentExpenses.slice(0, 3).map((e) => ({ id: e.id, title: e.title }))}
        userId={userId}
        myName={myName}
        memberIds={members.map((m) => m.userId)}
      />

      {billSheet ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setBillSheet(false)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setBillSheet(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.cardTitle}>What repeats every month?</Text>
              <TextInput
                style={styles.input}
                placeholder="Name (e.g. rent)"
                placeholderTextColor="#9b9b9b"
                value={billName}
                onChangeText={setBillName}
              />
              <TextInput
                style={styles.input}
                placeholder="Amount (€)"
                placeholderTextColor="#9b9b9b"
                keyboardType="decimal-pad"
                value={billAmount}
                onChangeText={setBillAmount}
                maxLength={9}
              />
              <Text style={styles.pickerLabel}>Due day of month</Text>
              <View style={styles.chipRow}>
                {['1', '15', '21'].map((d) => (
                  <Pressable
                    key={d}
                    style={[styles.chip, billDueDay === d && styles.chipSelected]}
                    onPress={() => setBillDueDay(d)}
                  >
                    <Text style={[styles.chipLabel, billDueDay === d && styles.chipLabelSelected]}>
                      {dueDayLabel(Number(d))}
                    </Text>
                  </Pressable>
                ))}
                <TextInput
                  style={styles.dueDayInput}
                  placeholder="Other…"
                  placeholderTextColor="#9b9b9b"
                  keyboardType="number-pad"
                  maxLength={2}
                  value={['1', '15', '21'].includes(billDueDay) ? '' : billDueDay}
                  onChangeText={setBillDueDay}
                />
              </View>
              <Text style={styles.pickerLabel}>Who pays the bank?</Text>
              <View style={styles.chipRow}>
                {members.map((m) => {
                  const selected = m.userId === (billPayerId ?? userId);
                  return (
                    <Pressable
                      key={m.userId}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => setBillPayerId(m.userId)}
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
                  const ids = billPickedIds ?? members.map((x) => x.userId);
                  const selected = ids.includes(m.userId);
                  return (
                    <Pressable
                      key={m.userId}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() =>
                        setBillPickedIds(
                          selected ? ids.filter((p) => p !== m.userId) : [...ids, m.userId],
                        )
                      }
                    >
                      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                        {m.userId === userId ? 'You' : m.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.hint}>
                Equal split, like every expense. Paying the bank ≠ paying alone — the ledger evens
                it out.
              </Text>
              {billError ? <Text style={styles.error}>{billError}</Text> : null}
              <Pressable
                style={[styles.button, billBusy && styles.disabled]}
                onPress={onAddBill}
                disabled={billBusy}
              >
                {billBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonLabel}>Add bill</Text>
                )}
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
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
  heroBalance: {
    fontFamily: RoomieFonts.displayBold,
    fontSize: 54,
    lineHeight: 68, // Baloo's rounded glyphs clip at a tight line height
    color: '#fff',
    marginTop: 12,
  },
  heroCap: { fontFamily: RoomieFonts.bodyBold, fontSize: 13.5, color: 'rgba(255,255,255,0.9)', marginTop: 4 },
  clarity: { fontSize: 15, fontFamily: RoomieFonts.bodySemi, color: Roomie.sub, paddingHorizontal: 2 },
  formCard: { gap: 10 },
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
  section: { gap: 11 },
  muted: { fontSize: 15, fontFamily: RoomieFonts.body, color: Roomie.sub },
  rowDivided: { borderTopWidth: 1, borderTopColor: Roomie.rule },
  debtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  debtText: { flex: 1, fontSize: 15, fontFamily: RoomieFonts.bodySemi, color: Roomie.ink },
  debtAmount: { fontSize: 17, fontFamily: RoomieFonts.displayBold, color: Roomie.ink },
  amountPositive: { color: Roomie.forest }, // owed to you → calm green
  amountOwe: { color: Roomie.coral }, // you owe → coral: "this is on you"
  settlePink: {
    backgroundColor: Roomie.pink,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  settlePinkLabel: { color: '#fff', fontSize: 13.5, fontFamily: RoomieFonts.display },
  receiptsLink: { fontSize: 13, fontFamily: RoomieFonts.bodySemi, color: Roomie.forest },
  billsHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  billsTotal: { fontSize: 12, fontFamily: RoomieFonts.bodySemi, color: Roomie.ink3 },
  billNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  duePill: {
    fontSize: 11,
    fontFamily: RoomieFonts.bodySemi,
    color: '#8A6B00',
    backgroundColor: '#FFF6DC',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  billRight: { alignItems: 'flex-end', gap: 6 },
  billPaid: {
    backgroundColor: Roomie.forest,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  billPaidLabel: { color: '#fff', fontSize: 12, fontFamily: RoomieFonts.bodySemi },
  billPaidDone: {
    backgroundColor: Roomie.sageSoft,
    color: Roomie.sage,
    fontSize: 12,
    fontFamily: RoomieFonts.bodySemi,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  billAdd: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 4 },
  billAddLabel: { fontSize: 13, fontFamily: RoomieFonts.bodySemi, color: Roomie.forest },
  dueDayInput: {
    backgroundColor: Roomie.canvas,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: RoomieFonts.bodySemi,
    color: Roomie.ink,
    minWidth: 74,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 30, 24, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Roomie.card,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    padding: 20,
    paddingBottom: 34,
    gap: 10,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  expenseInfo: { flex: 1, gap: 2 },
  expenseMeta: { fontSize: 12, fontFamily: RoomieFonts.bodySemi, color: Roomie.ink3 },
  delete: { padding: 6 },
  deleteLabel: { fontSize: 15, color: Roomie.danger },
  error: { color: Roomie.danger, fontSize: 14, fontFamily: RoomieFonts.bodySemi },
});
