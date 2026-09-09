import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalendarScreen } from '@/features/calendar/calendar-screen';
import { db } from '@/lib/db';

export default function CalendarTab() {
  const { user } = db.useAuth();

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#9b9b9b' }}>Sign in first.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return <CalendarScreen userId={user.id} />;
}
