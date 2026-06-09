// The home diary. BODY-phase render: one line per raw event, newest first.
// (BRAIN-phase grouping/summary/ranking comes later — this just shows the truth.)

import { StyleSheet, Text, View } from 'react-native';

import { db } from '@/lib/db';

import { describeEvent, timeAgo } from './activity';

export function ActivityFeed({ householdId }: { householdId: string }) {
  const { isLoading, error, data } = db.useQuery({
    activityEvents: {
      $: {
        where: { 'household.id': householdId },
        order: { createdAt: 'desc' },
        limit: 50,
      },
    },
  });

  if (isLoading) return null;
  if (error) {
    return <Text style={styles.muted}>Couldn&apos;t load the home diary.</Text>;
  }

  const events = data.activityEvents;
  if (events.length === 0) {
    return <Text style={styles.muted}>Nothing has happened yet.</Text>;
  }

  return (
    <View style={styles.list}>
      <Text style={styles.heading}>Home diary</Text>
      {events.map((event) => {
        const { icon, text } = describeEvent(event.type, event.metadata);
        return (
          <View key={event.id} style={styles.row}>
            <Text style={styles.icon}>{icon}</Text>
            <Text style={styles.text}>{text}</Text>
            <Text style={styles.time}>{timeAgo(event.createdAt)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: 20, gap: 2 },
  heading: {
    fontSize: 13,
    color: '#9b9b9b',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  icon: { fontSize: 16, width: 22 },
  text: { flex: 1, fontSize: 15, color: '#111' },
  time: { fontSize: 12, color: '#9b9b9b' },
  muted: { fontSize: 14, color: '#9b9b9b', marginTop: 20 },
});
