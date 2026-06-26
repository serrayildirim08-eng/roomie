// Home tab. Signed in via Clerk + bridged to InstantDB; routes the user into the
// household flow (create one, join one, or the green Home of the home they're in).
// The Home view renders full-bleed so its forest hero reaches the top edge.

import { useAuth, useUser } from '@clerk/expo';
import { StyleSheet, Text, View } from 'react-native';

import { Roomie, RoomieFonts } from '@/constants/theme';
import { HouseholdGate } from '@/features/household/household';
import { db } from '@/lib/db';

export default function HomeScreen() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const { user: instantUser, isLoading: instantLoading } = db.useAuth();

  if (instantLoading || !instantUser) {
    return (
      <View style={styles.center}>
        <Text style={styles.note}>
          {instantLoading ? 'Connecting…' : 'InstantDB not connected yet.'}
        </Text>
      </View>
    );
  }

  return (
    <HouseholdGate
      userId={instantUser.id}
      userName={user?.username ?? 'Someone'}
      onSignOut={() => signOut()}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Roomie.canvas },
  note: { fontSize: 14, fontFamily: RoomieFonts.body, color: Roomie.sub },
});
