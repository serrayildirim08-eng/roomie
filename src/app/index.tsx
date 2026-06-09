// Home tab. Signed in via Clerk + bridged to InstantDB; this routes the user
// into the household flow (create one, or see the one they're in).

import { useAuth, useUser } from '@clerk/expo';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HouseholdGate } from '@/features/household/household';
import { db } from '@/lib/db';

export default function HomeScreen() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const { user: instantUser, isLoading: instantLoading } = db.useAuth();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 10 },
  hello: { fontSize: 30, fontWeight: '700', color: '#111' },
  note: { fontSize: 14, color: '#9b9b9b', marginTop: 4 },
  signout: { marginTop: 28, alignSelf: 'flex-start' },
  signoutLabel: { fontSize: 15, color: '#c0392b', fontWeight: '600' },
});
