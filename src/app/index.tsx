// Home tab — placeholder for the signed-in state. Proves the auth gate works
// and gives a sign-out for testing. The real home (household + activity feed)
// arrives in T3–T6.

import { useAuth, useUser } from '@clerk/expo';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const { user } = useUser();
  const { signOut } = useAuth();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.hello}>Hi {user?.username ?? 'there'} 👋</Text>
        <Text style={styles.sub}>You&apos;re signed in. The foundation works.</Text>
        <Text style={styles.note}>Next: create or join a household.</Text>

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
  sub: { fontSize: 16, color: '#666' },
  note: { fontSize: 14, color: '#9b9b9b', marginTop: 4 },
  signout: { marginTop: 28, alignSelf: 'flex-start' },
  signoutLabel: { fontSize: 15, color: '#c0392b', fontWeight: '600' },
});
