// Account actions — the legal "leave for good" surface: export your data and
// delete your account. Deletion removes YOU (every membership, your personal
// to-dos, your profile) and closes your Clerk account. Shared expenses stay on
// each household's ledger so the books stay balanced — the same principle as
// "leave home" (money you fronted or owe is a shared record, not personal).

import { useUser } from '@clerk/expo';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { Roomie, RoomieFonts } from '@/constants/theme';
import { db } from '@/lib/db';

export function AccountActions({ userId, userName }: { userId: string; userName: string }) {
  const { user } = useUser();
  const [busy, setBusy] = useState(false);

  const onExport = async () => {
    try {
      // Money rows that mention YOU — fronted, split into, paid or received.
      // They stay on each household ledger after deletion; the export is how
      // you take a copy with you. Two queries per entity because the typed
      // where-clause can't express `or` across different link paths.
      const [{ data }, { data: moneyIn }] = await Promise.all([
        db.queryOnce({
          memberships: {
            $: { where: { 'user.id': userId } },
            household: {},
          },
          personalTasks: { $: { where: { 'owner.id': userId } } },
          expenses: {
            $: { where: { 'paidBy.id': userId } },
            household: {},
            paidBy: {},
          },
          settlements: {
            $: { where: { 'fromUser.id': userId } },
            household: {},
            fromUser: {},
          },
        }),
        db.queryOnce({
          expenses: {
            $: { where: { 'participants.id': userId } },
            household: {},
            paidBy: {},
          },
          settlements: {
            $: { where: { 'toUser.id': userId } },
            household: {},
            fromUser: {},
          },
        }),
      ]);
      const byId = <T extends { id: string }>(a: T[], b: T[]) => {
        const seen = new Map<string, T>();
        for (const row of [...a, ...b]) seen.set(row.id, row);
        return [...seen.values()];
      };
      const expenses = byId(data.expenses ?? [], moneyIn.expenses ?? []);
      const settlements = byId(data.settlements ?? [], moneyIn.settlements ?? []);
      const payload = {
        exportedFor: userName,
        exportedAt: new Date().toISOString(),
        note: 'Shared expenses/settlements also stay on each household ledger so the books stay balanced after account deletion — this export is your personal copy.',
        homes: (data.memberships ?? []).map((m) => ({
          home: m.household?.name ?? null,
          role: m.role,
          status: m.status,
          joinedAt: m.joinedAt,
        })),
        personalTasks: (data.personalTasks ?? []).map((t) => ({
          title: t.title,
          status: t.status,
          createdAt: t.createdAt,
        })),
        expenses: expenses.map((e) => ({
          home: e.household?.name ?? null,
          title: e.title,
          amountCents: e.amountCents,
          currency: e.currency,
          youPaid: e.paidBy?.id === userId,
          createdAt: e.createdAt,
        })),
        settlements: settlements.map((s) => ({
          home: s.household?.name ?? null,
          amountCents: s.amountCents,
          currency: s.currency,
          direction: s.fromUser?.id === userId ? 'you_paid' : 'you_received',
          createdAt: s.createdAt,
        })),
      };
      await Share.share({ message: JSON.stringify(payload, null, 2) });
    } catch {
      Alert.alert('Could not export', 'Something went wrong. Try again.');
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      // Delete Roomie rows FIRST, while still authenticated — once the Clerk
      // user is gone, InstantDB auth is gone and these writes would be denied.
      const { data } = await db.queryOnce({
        memberships: { $: { where: { 'user.id': userId } } },
        personalTasks: { $: { where: { 'owner.id': userId } } },
        profiles: { $: { where: { '$user.id': userId } } },
      });
      const txns = [
        ...(data.memberships ?? []).map((m) => db.tx.memberships[m.id].delete()),
        ...(data.personalTasks ?? []).map((t) => db.tx.personalTasks[t.id].delete()),
        ...(data.profiles ?? []).map((p) => db.tx.profiles[p.id].delete()),
      ];
      if (txns.length) await db.transact(txns);
      // Closing the Clerk account ends the session; the app falls back to the
      // sign-in screen on its own (see _layout's signed-out branch).
      await user?.delete();
    } catch {
      setBusy(false);
      Alert.alert('Could not delete', 'Something went wrong. Nothing was changed — try again.');
    }
  };

  const onDeletePress = () => {
    Alert.alert(
      'Delete your account?',
      "This removes you from every home, deletes your personal to-dos and profile, and closes your account. Shared expenses stay on each household's ledger so the books stay balanced. This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Really delete?', 'Last check — this permanently closes your account.', [
              { text: 'Keep my account', style: 'cancel' },
              { text: 'Delete forever', style: 'destructive', onPress: () => void doDelete() },
            ]),
        },
      ],
    );
  };

  if (busy) {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Pressable onPress={onExport} style={styles.action} hitSlop={6}>
        <Text style={styles.exportLabel}>Export my data</Text>
      </Pressable>
      <Pressable onPress={onDeletePress} style={styles.action} hitSlop={6}>
        <Text style={styles.deleteLabel}>Delete account</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 18, marginTop: 4, alignItems: 'center' },
  action: { paddingVertical: 8 },
  exportLabel: { fontSize: 13, fontFamily: RoomieFonts.bodySemi, color: Roomie.sub },
  deleteLabel: { fontSize: 13, fontFamily: RoomieFonts.bodySemi, color: Roomie.danger },
});
