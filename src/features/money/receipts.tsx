// Receipts — a quiet photo archive under Money. Grid by month, tap to view,
// 📷 to add. A receipt can point at one expense; the expense row then shows a
// small 🧾 that opens it. No counters, no goals — an archive, not a chore.

import { id } from '@instantdb/react-native';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@clerk/expo';

import { Radius, Roomie, RoomieFonts } from '@/constants/theme';
import { logActivity } from '@/features/activity/activity';
import { pickPhoto, uploadActivityPhoto } from '@/features/activity/photo';
import { BRAIN_URL } from '@/features/brain/types';
import { resolveItem } from '@/features/kitchen/normalize';
import { formatEur } from '@/features/money/money-logic';
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

type ReadState = {
  receiptId: string;
  merchant?: string;
  totalCents?: number;
  items: { name: string; priceCents: number; checked: boolean }[];
};

export function ReceiptsGallery({
  householdId,
  visible,
  onClose,
  recentExpenses,
  userId,
  myName,
  memberIds,
}: {
  householdId: string;
  visible: boolean;
  onClose: () => void;
  // Newest-first candidates for the optional "attach to expense" step.
  recentExpenses: { id: string; title: string }[];
  userId: string;
  myName: string;
  memberIds: string[];
}) {
  const { getToken } = useAuth();
  const { data } = db.useQuery(
    visible
      ? {
          receipts: {
            $: { where: { 'household.id': householdId }, order: { createdAt: 'desc' } },
            expense: {},
          },
          pantryItems: { $: { where: { 'household.id': householdId } }, claimedBy: {} },
          $files: {},
        }
      : null,
  );
  const [open, setOpen] = useState<{ url: string; receiptId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [read, setRead] = useState<ReadState | null>(null);
  const [confirming, setConfirming] = useState(false);

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

  const onReadIt = async () => {
    if (!open || reading) return;
    setReading(true);
    try {
      const token = await getToken();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25_000);
      let res: Response;
      try {
        res = await fetch(`${BRAIN_URL}/receipt-itemize`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ imageUrl: open.url }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      const body = (await res.json()) as {
        error?: string;
        merchant?: string;
        totalCents?: number;
        items?: { name: string; priceCents: number }[];
      };
      if (!res.ok) throw new Error(body.error ?? `http ${res.status}`);
      if (!body.items?.length) {
        Alert.alert('Couldn’t read it', 'The photo may be blurry — try a straighter shot.');
        return;
      }
      setRead({
        receiptId: open.receiptId,
        merchant: body.merchant,
        totalCents: body.totalCents,
        items: body.items.map((it) => ({ ...it, checked: true })),
      });
      setOpen(null);
    } catch {
      Alert.alert('Couldn’t read it', 'No rush — the photo stays in the gallery, try again later.');
    } finally {
      setReading(false);
    }
  };

  // Confirmed items → pantry (revive-or-create, same dedupe as Kitchen) and
  // ONE expense for the receipt total, linked back to the receipt. Nothing
  // writes without the tick.
  const onConfirmRead = async () => {
    if (!read || confirming) return;
    const picked = read.items.filter((it) => it.checked);
    if (picked.length === 0) return setRead(null);
    setConfirming(true);
    const ts = Date.now();
    const pantry = data?.pantryItems ?? [];
    try {
      const txns = [];
      for (const it of picked) {
        const resolved = resolveItem(it.name);
        const existing = pantry.find((p) => p.normalizedName === resolved.normalizedName);
        if (existing) {
          txns.push(
            db.tx.pantryItems[existing.id]
              .update({ status: 'in', addedAt: ts, updatedAt: ts })
              .unlink({ claimedBy: existing.claimedBy?.id ?? '' }),
          );
        } else {
          txns.push(
            db.tx.pantryItems[id()]
              .update({
                name: resolved.name,
                normalizedName: resolved.normalizedName,
                category: resolved.category,
                status: 'in',
                shelfLifeDays: resolved.shelfLifeDays ?? undefined,
                addedAt: ts,
                householdId, // create-rule gate (AGENTS.md)
                createdAt: ts,
                updatedAt: ts,
              })
              .link({ household: householdId }),
          );
        }
        txns.push(
          db.tx.purchases[id()]
            .update({ itemName: resolved.normalizedName, at: ts, householdId })
            .link({ household: householdId, by: userId }),
        );
      }
      const totalCents =
        read.totalCents ?? picked.reduce((sum, it) => sum + it.priceCents, 0);
      const title = `Receipt · ${read.merchant ?? 'store'}`;
      const expenseId = id();
      txns.push(
        db.tx.expenses[expenseId]
          .update({
            title,
            amountCents: totalCents,
            currency: 'EUR',
            householdId, // create-rule gate (AGENTS.md)
            createdAt: ts,
          })
          .link({ household: householdId, paidBy: userId, participants: memberIds }),
        db.tx.receipts[read.receiptId].update({ label: title }).link({ expense: expenseId }),
      );
      await db.transact(txns);
      await logActivity({
        householdId,
        actorId: userId,
        actorName: myName,
        type: 'expense_added',
        metadata: { title, amountCents: totalCents, paidByName: myName },
      });
      setRead(null);
    } catch {
      Alert.alert('Could not save', 'That tap didn’t stick — try again in a moment.');
    } finally {
      setConfirming(false);
    }
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
                        onPress={() => url && setOpen({ url, receiptId: r.id })}
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
              <Image source={{ uri: open.url }} style={styles.viewerImage} contentFit="contain" />
              <Pressable
                style={[styles.readBtn, reading && { opacity: 0.6 }]}
                onPress={() => void onReadIt()}
                disabled={reading}
              >
                <Text style={styles.readBtnLabel}>{reading ? 'Reading…' : '🔍 Read it'}</Text>
              </Pressable>
            </Pressable>
          </Modal>
        ) : null}

        {read ? (
          <Modal visible transparent animationType="fade" onRequestClose={() => setRead(null)}>
            <Pressable style={styles.sheetBackdrop} onPress={() => setRead(null)}>
              <Pressable style={styles.sheet} onPress={() => {}}>
                <Text style={styles.sheetTitle}>
                  Found {read.items.length} item{read.items.length > 1 ? 's' : ''} — keep what’s
                  right
                </Text>
                <ScrollView style={styles.sheetList}>
                  {read.items.map((it, idx) => (
                    <Pressable
                      key={idx}
                      style={styles.readItem}
                      onPress={() =>
                        setRead({
                          ...read,
                          items: read.items.map((x, i) =>
                            i === idx ? { ...x, checked: !x.checked } : x,
                          ),
                        })
                      }
                    >
                      <View style={[styles.tick, it.checked && styles.tickOn]}>
                        {it.checked ? <Text style={styles.tickMark}>✓</Text> : null}
                      </View>
                      <Text style={[styles.readName, !it.checked && styles.readNameOff]}>
                        {it.name}
                      </Text>
                      <Text style={[styles.readPrice, !it.checked && styles.readNameOff]}>
                        {formatEur(it.priceCents)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Pressable
                  style={[styles.cta, confirming && { opacity: 0.6 }]}
                  onPress={() => void onConfirmRead()}
                  disabled={confirming}
                >
                  <Text style={styles.ctaLabel}>
                    {confirming
                      ? 'Saving…'
                      : `Add ${read.items.filter((i) => i.checked).length} to pantry · log ${formatEur(
                          read.totalCents ??
                            read.items
                              .filter((i) => i.checked)
                              .reduce((sum, i) => sum + i.priceCents, 0),
                        )}`}
                  </Text>
                </Pressable>
                <Text style={styles.sheetNote}>
                  Nothing writes without your tick. Wrong line? Tap it off.
                </Text>
              </Pressable>
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
  readBtn: {
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
    backgroundColor: Roomie.forest,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  readBtnLabel: { color: '#fff', fontSize: 14, fontFamily: RoomieFonts.bodySemi },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 30, 24, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Roomie.card,
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    padding: 20,
    paddingBottom: 34,
    gap: 12,
    maxHeight: '75%',
  },
  sheetTitle: { fontSize: 16, fontFamily: RoomieFonts.bodyBold, color: Roomie.ink },
  sheetList: { flexGrow: 0 },
  readItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Roomie.canvas,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 8,
  },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Roomie.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOn: { backgroundColor: Roomie.forest, borderColor: Roomie.forest },
  tickMark: { color: '#fff', fontSize: 13, fontFamily: RoomieFonts.bodyBold },
  readName: { flex: 1, fontSize: 14, fontFamily: RoomieFonts.bodySemi, color: Roomie.ink },
  readNameOff: { color: Roomie.ink3 },
  readPrice: { fontSize: 14, fontFamily: RoomieFonts.bodyBold, color: Roomie.forestInk },
  cta: {
    backgroundColor: Roomie.forest,
    borderRadius: 16,
    padding: 15,
    alignItems: 'center',
  },
  ctaLabel: { color: '#fff', fontSize: 14.5, fontFamily: RoomieFonts.bodySemi },
  sheetNote: { fontSize: 12, fontFamily: RoomieFonts.body, color: Roomie.ink3 },
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(10, 16, 12, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: { width: '100%', height: '80%' },
});
