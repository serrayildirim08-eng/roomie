import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Roomie } from '@/constants/theme';
import { KitchenScreen } from '@/features/kitchen/kitchen-screen';
import { db } from '@/lib/db';

export default function KitchenTab() {
  const { user } = db.useAuth();

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Roomie.canvas }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: Roomie.sub }}>Sign in first.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return <KitchenScreen userId={user.id} />;
}
