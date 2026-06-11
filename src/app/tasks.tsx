import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Roomie } from '@/constants/theme';
import { TasksScreen } from '@/features/tasks/tasks-screen';
import { db } from '@/lib/db';

export default function TasksTab() {
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

  return <TasksScreen userId={user.id} />;
}
