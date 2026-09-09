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
      const { data } = await db.queryOnce({
        memberships: {
          $: { where: { 'user.id': userId } },
          household: {},
        },
        personalTasks: { $: { where: { 'owner.id': userId } } },
      });
      const payload = {
        exportedFor: userName,
        exportedAt: new Date().toISOString(),
        note: 'Shared expenses/settlements live on each household ledger and are not personal data.',
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
