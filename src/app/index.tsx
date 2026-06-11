// Home tab. Signed in via Clerk + bridged to InstantDB; this routes the user
// into the household flow (create one, or see the one they're in).

import { useAuth, useUser } from '@clerk/expo';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Roomie, RoomieFonts } from '@/constants/theme';
import { HouseholdGate } from '@/features/household/household';
import { db } from '@/lib/db';

export default function HomeScreen() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const { user: instantUser, isLoading: instantLoading } = db.useAuth();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.hello}>Hi {user?.username ?? 'there'} 👋</Text>

        {instantLoading ? (
          <Text style={styles.note}>Connecting…</Text>
        ) : instantUser ? (
          <HouseholdGate userId={instantUser.id} userName={user?.username ?? 'Someone'} />
        ) : (
          <Text style={styles.note}>InstantDB not connected yet.</Text>
        )}

        <Pressable style={styles.signout} onPress={() => signOut()}>
          <Text style={styles.signoutLabel}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Roomie.canvas },
  container: { paddingHorizontal: 28, paddingTop: 24, paddingBottom: 48, gap: 10 },
  hello: { fontSize: 30, fontFamily: RoomieFonts.display, color: Roomie.ink },
  note: { fontSize: 14, fontFamily: RoomieFonts.body, color: Roomie.sub, marginTop: 4 },
  signout: { marginTop: 28, alignSelf: 'flex-start' },
  signoutLabel: { fontSize: 15, color: Roomie.danger, fontFamily: RoomieFonts.bodySemi },
});
