// Receipts — a quiet photo archive under Money. Grid by month, tap to view,
// 📷 to add. A receipt can point at one expense; the expense row then shows a
// small 🧾 that opens it. No counters, no goals — an archive, not a chore.

import { id } from '@instantdb/react-native';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Radius, Roomie, RoomieFonts } from '@/constants/theme';
import { pickPhoto, uploadActivityPhoto } from '@/features/activity/photo';
import { db } from '@/lib/db';

type ReceiptRow = {
  id: string;
  fileId: string;
  label?: string | null;
  createdAt: number | string;
  expense?: { id: string; title?: string } | null;
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function monthHead(createdAt: number): string {
  const d = new Date(createdAt);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function ReceiptsGallery({
  householdId,
  visible,
  onClose,
  recentExpenses,
}: {
  householdId: string;
  visible: boolean;
  onClose: () => void;
  // Newest-first candidates for the optional "attach to expense" step.
  recentExpenses: { id: string; title: string }[];
}) {
  const { data } = db.useQuery(
    visible
      ? {
          receipts: {
            $: { where: { 'household.id': householdId }, order: { createdAt: 'desc' } },
            expense: {},
          },
          $files: {},
        }
      : null,
  );
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const receipts = (data?.receipts ?? []) as ReceiptRow[];
  const urlByFileId: Record<string, string> = {};
  for (const f of data?.$files ?? []) {
    if (f.url) urlByFileId[f.id] = f.url;
  }

  const onSnap = async () => {
    if (busy) return;
    const uri = await pickPhoto();
    if (!uri) return;
    setBusy(true);
    const photo = await uploadActivityPhoto(householdId, uri);
    setBusy(false);
    if (!photo) {
      Alert.alert('Could not upload', 'Try again in a moment.');
      return;
    }
    const save = (expenseId?: string, label?: string) =>
      void db.transact(
        db.tx.receipts[id()]
          .update({
            fileId: photo.fileId,
            path: photo.path,
            ...(label ? { label } : {}),
            householdId, // create-rule gate (AGENTS.md)
            createdAt: Date.now(),
          })
          .link({ household: householdId, ...(expenseId ? { expense: expenseId } : {}) }),
      );
    if (recentExpenses.length === 0) return save();
    Alert.alert('Attach to an expense?', 'Optional — it can just live in the gallery.', [
      { text: 'Just the gallery', onPress: () => save() },
      ...recentExpenses.slice(0, 3).map((e) => ({
        text: e.title,
        onPress: () => save(e.id, e.title),
      })),
    ]);
  };

  // Group by month, newest first (receipts arrive sorted).
  const groups: { head: string; rows: ReceiptRow[] }[] = [];
  for (const r of receipts) {
    const head = monthHead(Number(r.createdAt));
    const last = groups[groups.length - 1];
    if (last && last.head === head) last.rows.push(r);
    else groups.push({ head, rows: [r] });
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.bar}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.barClose}>Close</Text>
          </Pressable>
          <Text style={styles.barTitle}>Receipts</Text>
          <Pressable onPress={() => void onSnap()} hitSlop={8} disabled={busy}>
            <Text style={styles.barSnap}>{busy ? '…' : '📷'}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.scroll}>
          {groups.length === 0 ? (
            <Text style={styles.muted}>
              No receipts yet. Snap one with 📷 — it can attach to an expense, or just live here.
            </Text>
          ) : (
            groups.map((g) => (
              <View key={g.head}>
                <Text style={styles.month}>{g.head}</Text>
                <View style={styles.grid}>
                  {g.rows.map((r) => {
                    const url = urlByFileId[r.fileId];
                    return (
                      <Pressable
                        key={r.id}
                        style={styles.cell}
                        onPress={() => url && setOpen(url)}
                      >
                        {url ? (
                          <Image source={{ uri: url }} style={styles.cellImage} contentFit="cover" />
                        ) : (
                          <Text style={styles.cellEmoji}>🧾</Text>
                        )}
                        {r.expense?.title || r.label ? (
                          <Text style={styles.cellLabel} numberOfLines={1}>
                            {r.expense?.title ?? r.label}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))
          )}
        </ScrollView>
        {open ? (
          <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(null)}>
            <Pressable style={styles.viewer} onPress={() => setOpen(null)}>
              <Image source={{ uri: open }} style={styles.viewerImage} contentFit="contain" />
            </Pressable>
          </Modal>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Roomie.canvas },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  barClose: { fontSize: 14, fontFamily: RoomieFonts.bodySemi, color: Roomie.sub },
  barTitle: { fontSize: 17, fontFamily: RoomieFonts.bodyBold, color: Roomie.ink },
  barSnap: { fontSize: 20 },
  scroll: { padding: 16, paddingBottom: 60, gap: 8 },
  month: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontFamily: RoomieFonts.bodyBold,
    color: Roomie.ink3,
    marginTop: 10,
    marginBottom: 6,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: {
    width: '31%',
    aspectRatio: 3 / 4,
    borderRadius: Radius.chip,
    backgroundColor: Roomie.card,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellImage: { width: '100%', height: '100%' },
  cellEmoji: { fontSize: 26 },
  cellLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    fontSize: 10.5,
    fontFamily: RoomieFonts.bodySemi,
    color: '#fff',
    backgroundColor: 'rgba(15, 61, 39, 0.65)',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  muted: { fontSize: 14, fontFamily: RoomieFonts.body, color: Roomie.sub, padding: 16 },
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(10, 16, 12, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: { width: '100%', height: '80%' },
});
