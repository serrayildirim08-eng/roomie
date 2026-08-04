// Calendar — the month at home, at a glance. Forest dot = a bill lands that
// day (derived from bills.dueDay, managed in Money — this screen is read-only
// for bills). Gold dot = a hand-added all-day event. Tap a day → its list +
// a quiet add box. No hours, no repeats, no reminders — a wall calendar.

import { id } from '@instantdb/react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Hero, HeroBar, HeroEyebrow, SectionHead } from '@/components/ui/kit';
import { Radius, Roomie, RoomieFonts } from '@/constants/theme';
import { logActivity } from '@/features/activity/activity';
import { formatEur, nowMs } from '@/features/money/money-logic';
import { dueDayLabel } from '@/features/money/bills-logic';
import { db } from '@/lib/db';

import { billDateInMonth, buildMonthGrid, dayTitle, monthTitle, todayKey } from './calendar-logic';

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function emailName(email?: string): string | undefined {
  const local = email?.split('@')[0]?.replace(/\+.*$/, '');
  return local || undefined;
}

export function CalendarScreen({ userId }: { userId: string }) {
  const insets = useSafeAreaInsets();
  const { isLoading, error, data } = db.useQuery({
    memberships: {
      $: { where: { 'user.id': userId, status: 'active' } },
      household: {
        memberships: { $: { where: { status: 'active' } }, user: {} },
        bills: { paidBy: {} },
        events: {},
      },
    },
  });

  const now = new Date(nowMs());
  const [ym, setYm] = useState<{ y: number; m0: number }>({
    y: now.getFullYear(),
    m0: now.getMonth(),
  });
  const [selected, setSelected] = useState<string>(todayKey(nowMs()));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  const household = data?.memberships[0]?.household;
  if (error || !household) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Couldn&apos;t load the calendar.</Text>
      </View>
    );
  }

  const myName =
    emailName(
      household.memberships.find((m) => m.user?.id === userId)?.user?.email ?? undefined,
    ) ?? 'You';

  const bills = household.bills ?? [];
  const events = household.events ?? [];

  // Dots for the visible month.
  const billsByDate: Record<string, typeof bills> = {};
  for (const b of bills) {
    const key = billDateInMonth(b.dueDay, ym.y, ym.m0);
    (billsByDate[key] ??= []).push(b);
  }
  const eventsByDate: Record<string, typeof events> = {};
  for (const e of events) {
    (eventsByDate[e.date] ??= []).push(e);
  }

  const grid = buildMonthGrid(ym.y, ym.m0);
  const tKey = todayKey(nowMs());
  const dayBills = billsByDate[selected] ?? [];
  const dayEvents = eventsByDate[selected] ?? [];

  const shiftMonth = (delta: number) => {
    const d = new Date(ym.y, ym.m0 + delta, 1);
    setYm({ y: d.getFullYear(), m0: d.getMonth() });
  };

  const onAddEvent = async () => {
    const name = draft.trim();
    if (!name || busy) return;
    setBusy(true);
    setDraft('');
    try {
      await db.transact(
        db.tx.events[id()]
          .update({
            name,
            date: selected,
            householdId: household.id, // create-rule gate (AGENTS.md)
            createdAt: nowMs(),
          })
          .link({ household: household.id }),
      );
      await logActivity({
        householdId: household.id,
        actorId: userId,
        actorName: myName,
        type: 'event_added',
        metadata: { title: name, date: selected },
      });
    } catch {
      setDraft(name); // give the text back — nothing lost
      Alert.alert('Could not save', 'That tap didn’t stick — try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const onRemoveEvent = (eventId: string, name: string) => {
    Alert.alert('Remove event?', `"${name}" comes off the calendar.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void db.transact(db.tx.events[eventId].delete()),
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Hero topInset={insets.top}>
          <HeroBar
            houseName={household.name}
            sub="Calendar"
            you={myName}
            youSeed={userId}
          />
          <HeroEyebrow>The month at home</HeroEyebrow>
          <View style={styles.monthRow}>
            <Pressable onPress={() => shiftMonth(-1)} hitSlop={10}>
              <Text style={styles.monthArrow}>‹</Text>
            </Pressable>
            <Text style={styles.monthTitle}>{monthTitle(ym.y, ym.m0)}</Text>
            <Pressable onPress={() => shiftMonth(1)} hitSlop={10}>
              <Text style={styles.monthArrow}>›</Text>
            </Pressable>
          </View>
        </Hero>

        <View style={styles.body}>
          <View style={styles.cal}>
            <View style={styles.dowRow}>
              {DOW.map((d, i) => (
                <Text key={i} style={styles.dow}>
                  {d}
                </Text>
              ))}
            </View>
            <View style={styles.grid}>
              {grid.map((cell) => {
                const hasBill = cell.inMonth && (billsByDate[cell.key]?.length ?? 0) > 0;
                const hasEvent = (eventsByDate[cell.key]?.length ?? 0) > 0;
                const isToday = cell.key === tKey;
                const isSel = cell.key === selected;
                return (
                  <Pressable
                    key={cell.key}
                    style={[styles.day, isToday && styles.dayToday, isSel && styles.daySel]}
                    onPress={() => setSelected(cell.key)}
                  >
                    <Text
                      style={[
                        styles.dayNum,
                        !cell.inMonth && styles.dayDim,
                        isToday && styles.dayNumToday,
                      ]}
                    >
                      {cell.day}
                    </Text>
                    <View style={styles.dots}>
                      {hasBill ? <View style={[styles.dot, styles.dotBill]} /> : null}
                      {hasEvent ? <View style={[styles.dot, styles.dotEvent]} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.dot, styles.dotBill]} />
                <Text style={styles.legendText}>bill due</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.dot, styles.dotEvent]} />
                <Text style={styles.legendText}>event</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <SectionHead title={dayTitle(selected)} />
            {dayBills.length === 0 && dayEvents.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.muted}>Nothing planned. 🌿</Text>
              </View>
            ) : (
              <View style={styles.card}>
                {dayBills.map((b, idx) => (
                  <Pressable
                    key={b.id}
                    style={[styles.item, idx > 0 && styles.itemDivided]}
                    onPress={() => router.push('/money')}
                  >
                    <View style={[styles.itemIcon, styles.itemIconBill]}>
                      <Text style={styles.itemEmoji}>📄</Text>
                    </View>
                    <View style={styles.itemMeta}>
                      <Text style={styles.itemName}>
                        {b.name} — {formatEur(b.amountCents)}
                      </Text>
                      <Text style={styles.itemCap}>
                        {dueDayLabel(b.dueDay)} · manage in Money
                      </Text>
                    </View>
                    <Text style={styles.itemGo}>›</Text>
                  </Pressable>
                ))}
                {dayEvents.map((e, idx) => (
                  <View
                    key={e.id}
                    style={[styles.item, (idx > 0 || dayBills.length > 0) && styles.itemDivided]}
                  >
                    <View style={[styles.itemIcon, styles.itemIconEvent]}>
                      <Text style={styles.itemEmoji}>🌙</Text>
                    </View>
                    <View style={styles.itemMeta}>
                      <Text style={styles.itemName}>{e.name}</Text>
                      {e.note ? <Text style={styles.itemCap}>“{e.note}”</Text> : null}
                    </View>
                    <Pressable onPress={() => onRemoveEvent(e.id, e.name)} hitSlop={8}>
                      <Text style={styles.itemRemove}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.addRow}>
              <TextInput
                style={styles.input}
                placeholder={`Add an event on ${dayTitle(selected).split(', ')[1]}…`}
                placeholderTextColor={Roomie.sub}
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={() => void onAddEvent()}
                returnKeyType="done"
              />
              <Pressable
                style={[styles.addButton, busy && { opacity: 0.6 }]}
                onPress={() => void onAddEvent()}
                disabled={busy}
              >
                <Text style={styles.addButtonLabel}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Roomie.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Roomie.canvas },
  scroll: { paddingBottom: 100 },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 },
  monthTitle: { fontFamily: RoomieFonts.display, fontSize: 24, color: '#fff' },
  monthArrow: { fontSize: 22, color: 'rgba(255,255,255,0.75)', fontFamily: RoomieFonts.bodyBold },
  body: { padding: 16, gap: 14 },
  cal: {
    backgroundColor: Roomie.card,
    borderRadius: Radius.card,
    padding: 12,
    shadowColor: '#16201B',
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  dowRow: { flexDirection: 'row', marginBottom: 4 },
  dow: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10.5,
    fontFamily: RoomieFonts.bodyBold,
    color: Roomie.ink3,
    letterSpacing: 1,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  day: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 12,
  },
  dayToday: { backgroundColor: Roomie.sageSoft },
  daySel: { borderWidth: 2, borderColor: Roomie.forest },
  dayNum: { fontSize: 13.5, fontFamily: RoomieFonts.bodySemi, color: Roomie.ink },
  dayNumToday: { color: Roomie.forest, fontFamily: RoomieFonts.bodyBold },
  dayDim: { color: Roomie.ink3, opacity: 0.45 },
  dots: { flexDirection: 'row', gap: 3, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 99 },
  dotBill: { backgroundColor: Roomie.forest },
  dotEvent: { backgroundColor: '#D9A400' },
  legend: { flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { fontSize: 11, fontFamily: RoomieFonts.bodySemi, color: Roomie.sub },
  section: { gap: 8 },
  card: {
    backgroundColor: Roomie.card,
    borderRadius: Radius.card,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  itemDivided: { borderTopWidth: 1, borderTopColor: Roomie.rule },
  itemIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemIconBill: { backgroundColor: Roomie.sageSoft },
  itemIconEvent: { backgroundColor: '#FFF6DC' },
  itemEmoji: { fontSize: 16 },
  itemMeta: { flex: 1 },
  itemName: { fontSize: 14.5, fontFamily: RoomieFonts.bodySemi, color: Roomie.ink },
  itemCap: { fontSize: 12, fontFamily: RoomieFonts.body, color: Roomie.sub, marginTop: 2 },
  itemGo: { fontSize: 16, color: Roomie.ink3 },
  itemRemove: { fontSize: 14, color: Roomie.ink3 },
  addRow: { flexDirection: 'row', gap: 10 },
  input: {
    flex: 1,
    backgroundColor: Roomie.card,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 14,
    fontFamily: RoomieFonts.bodySemi,
    color: Roomie.ink,
  },
  addButton: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: Roomie.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonLabel: { color: '#fff', fontSize: 22, fontFamily: RoomieFonts.bodyBold },
  muted: { fontSize: 14, fontFamily: RoomieFonts.body, color: Roomie.sub, paddingVertical: 12 },
});
