// Weekly Home Recap card — a calm "This week at home" glance on the Home screen,
// summarizing the last 7 days from data the home already has. Does its OWN
// db.useQuery so the household screen barely changes. No ranking of people, no
// winners, no points: a few quiet, house-focused lines from the pure weeklyRecap,
// and NOTHING (null) while loading or when the week was empty.

import { StyleSheet, Text, View } from 'react-native';

import { Card, SectionHead } from '@/components/ui/kit';
import { Roomie, RoomieFonts } from '@/constants/theme';
import { nowMs } from '@/features/money/money-logic';
import { db } from '@/lib/db';

import { weeklyRecap } from './weekly-recap-logic';

export function WeeklyRecap({ householdId }: { householdId: string }) {
  const { isLoading, error, data } = db.useQuery({
    households: {
      $: { where: { id: householdId } },
      settlements: {},
      activity: { $: { order: { createdAt: 'desc' }, limit: 200 } },
    },
  });

  // Never a spinner on Home — stay invisible until the data's there.
  if (isLoading || error) return null;
  const household = data.households[0];
  if (!household) return null;

  const { lines } = weeklyRecap({
    nowMs: nowMs(),
    activity: household.activity.map((a) => ({
      type: a.type,
      createdAtMs: Number(a.createdAt),
    })),
    settlements: household.settlements.map((s) => ({
      amountCents: s.amountCents,
      atMs: Number(s.createdAt),
    })),
  });

  // Empty week → render nothing, never an empty box.
  if (lines.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHead title="This week at home" />
      <Card>
        {lines.map((line, idx) => (
          <View key={idx} style={[styles.row, idx > 0 && styles.rowDivided]}>
            <Text style={styles.text}>{line}</Text>
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 11 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowDivided: { borderTopWidth: 1, borderTopColor: Roomie.rule },
  text: { flex: 1, fontSize: 15, fontFamily: RoomieFonts.bodySemi, color: Roomie.ink },
});
