// The home diary. BODY-phase render: one line per raw event, newest first.
// Renders rows only (no heading) so the caller can wrap it in a Card under its
// own section header. (BRAIN-phase grouping/summary comes later.)

import { StyleSheet, Text, View } from 'react-native';

import { Roomie, RoomieFonts } from '@/constants/theme';
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
    return <Text style={styles.muted}>Quiet so far. 🌿</Text>;
  }

  // Calm, house-focused grouping: anything since the start of the local day sits
  // under "Today at home", the rest under "Earlier". No ranking, no per-person
  // tallies — just a gentle sense of when.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayStart = startOfToday.getTime();

  const today: typeof events = [];
  const earlier: typeof events = [];
  for (const event of events) {
    (Number(event.createdAt) >= todayStart ? today : earlier).push(event);
  }

  const renderRow = (event: (typeof events)[number], idx: number) => {
    const { icon, text } = describeEvent(event.type, event.metadata);
    return (
      <View key={event.id} style={[styles.row, idx > 0 && styles.rowDivided]}>
        <View style={styles.iconChip}>
          <Text style={styles.icon}>{icon}</Text>
        </View>
        <Text style={styles.text}>{text}</Text>
        <Text style={styles.time}>{timeAgo(event.createdAt)}</Text>
      </View>
    );
  };

  return (
    <View>
      {today.length > 0 && (
        <View>
          <Text style={styles.groupHead}>Today at home</Text>
          {today.map(renderRow)}
        </View>
      )}
      {earlier.length > 0 && (
        <View style={today.length > 0 && styles.groupSpacer}>
          <Text style={styles.groupHead}>Earlier</Text>
          {earlier.map(renderRow)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  groupHead: {
    fontFamily: RoomieFonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Roomie.ink3,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  groupSpacer: { marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, gap: 12 },
  rowDivided: { borderTopWidth: 1, borderTopColor: Roomie.rule },
  iconChip: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Roomie.sageSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 17 },
  text: { flex: 1, fontSize: 14.5, fontFamily: RoomieFonts.bodySemi, color: Roomie.ink, lineHeight: 19 },
  time: { fontSize: 11, fontFamily: RoomieFonts.bodyBold, color: Roomie.ink3 },
  muted: { fontSize: 14, fontFamily: RoomieFonts.body, color: Roomie.sub, padding: 16 },
});
