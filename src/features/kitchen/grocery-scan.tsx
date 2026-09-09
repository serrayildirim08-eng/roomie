// Grocery Scan — a shopping session. Scan each item's barcode (→ Open Food
// Facts for a name), watch the list build, then enter the total and split it.
// "Finish" writes everything at once: pantry items (status 'in'), one Money
// expense for the total, and a purchase-log row per item. Nothing is written
// until Finish — the session is throwaway state until then.
//
// A barcode gives identity, not price: the total is typed, the split reuses
// Money's equal-split engine. Unknown / barcodeless items fall back to a quick
// "type the name" sheet so the flow never dead-ends.

import { id } from '@instantdb/react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, ChunkyButton, Hero, HeroEyebrow, HeroTitle } from '@/components/ui/kit';
import { Roomie, RoomieFonts } from '@/constants/theme';
import { logActivity } from '@/features/activity/activity';
import { formatEur, nowMs, parseAmountToCents } from '@/features/money/money-logic';
import { db } from '@/lib/db';

import { itemEmoji } from './alias-data';
import { lookupBarcode } from './barcode-lookup';
import { resolveItem } from './normalize';

interface ScanLine {
  key: string;
  name: string;
  normalizedName: string;
  category: string;
  shelfLifeDays: number | null;
  barcode?: string;
  // Diet flags the scanned label declared (vegan / gluten-free / …). Barcode-only
  // — typed/manual items leave this unset.
  dietTags?: string[];
}

interface ExistingItem {
  id: string;
  normalizedName: string;
  status: string;
  claimedBy?: { id: string } | null;
}

interface GroceryScanProps {
  visible: boolean;
  onClose: () => void;
  householdId: string;
  userId: string;
  myName: string;
  members: { id: string; name: string }[];
  existingItems: ExistingItem[];
  nameById: Record<string, string>;
}

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] as const;

export function GroceryScan({
  visible,
  onClose,
  householdId,
  userId,
  myName,
  members,
  existingItems,
  nameById,
}: GroceryScanProps) {
  const insets = useSafeAreaInsets();
  const [perm, requestPerm] = useCameraPermissions();

  const [phase, setPhase] = useState<'scan' | 'review'>('scan');
  const [lines, setLines] = useState<ScanLine[]>([]);
  const [looking, setLooking] = useState(false);
  const [manual, setManual] = useState<{ barcode?: string; editKey?: string } | null>(null);
  const [manualName, setManualName] = useState('');
  const [total, setTotal] = useState('');
  const [payerId, setPayerId] = useState(userId);
  const [shareIds, setShareIds] = useState<string[]>(members.map((m) => m.id));
  const [saving, setSaving] = useState(false);

  const keySeq = useRef(0);
  const lastScan = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  const reset = useCallback(() => {
    setPhase('scan');
    setLines([]);
    setLooking(false);
    setManual(null);
    setManualName('');
    setTotal('');
    setPayerId(userId);
    setShareIds(members.map((m) => m.id));
    setSaving(false);
    lastScan.current = { code: '', at: 0 };
  }, [members, userId]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const addLine = useCallback((line: Omit<ScanLine, 'key'>) => {
    setLines((prev) => {
      if (prev.some((l) => l.normalizedName === line.normalizedName)) return prev; // dedupe in-session
      keySeq.current += 1;
      return [...prev, { ...line, key: `l${keySeq.current}` }];
    });
  }, []);

  const addByBarcode = useCallback(
    async (code: string) => {
      setLooking(true);
      // Cap the lookup at ~6s — a stalled network shouldn't freeze the scanner.
      // On abort lookupBarcode resolves null, which opens the manual sheet below.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      let product;
      try {
        product = await lookupBarcode(code, controller.signal);
      } finally {
        clearTimeout(timer);
      }
      setLooking(false);
      if (!product) {
        setManualName('');
        setManual({ barcode: code }); // unknown → type the name, keep the code
        return;
      }
      const r = resolveItem(product.name);
      addLine({
        name: product.name,
        normalizedName: r.normalizedName,
        // The barcode's own category wins when the label carried one; fall back
        // to the name-derived alias category otherwise.
        category: product.category ?? r.category,
        shelfLifeDays: r.shelfLifeDays,
        barcode: code,
        dietTags: product.dietTags,
      });
    },
    [addLine],
  );

  const onScanned = useCallback(
    ({ data }: { data: string }) => {
      if (looking || manual) return;
      const at = Date.now();
      if (data === lastScan.current.code && at - lastScan.current.at < 2500) return; // debounce repeats
      lastScan.current = { code: data, at };
      if (lines.some((l) => l.barcode === data)) return;
      void addByBarcode(data);
    },
    [looking, manual, lines, addByBarcode],
  );

  const submitManual = useCallback(() => {
    const typed = manualName.trim();
    if (!typed) return;
    const r = resolveItem(typed);
    if (manual?.editKey) {
      // Rename an existing line — re-derive the normalized fields so a hand-typed
      // name stays as consistent as a scanned one. Keep its key and barcode.
      const editKey = manual.editKey;
      setLines((prev) =>
        prev.map((l) =>
          l.key === editKey
            ? {
                ...l,
                name: r.name,
                normalizedName: r.normalizedName,
                category: r.category,
                shelfLifeDays: r.shelfLifeDays,
              }
            : l,
        ),
      );
    } else {
      addLine({
        name: r.name,
        normalizedName: r.normalizedName,
        category: r.category,
        shelfLifeDays: r.shelfLifeDays,
        barcode: manual?.barcode,
      });
    }
    setManual(null);
    setManualName('');
  }, [manualName, manual, addLine]);

  const removeLine = useCallback((key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }, []);

  const toggleShare = useCallback((mid: string) => {
    setShareIds((prev) =>
      prev.includes(mid) ? (prev.length > 1 ? prev.filter((x) => x !== mid) : prev) : [...prev, mid],
    );
  }, []);

  const cents = parseAmountToCents(total);
  const perHead = cents && shareIds.length ? Math.floor(cents / shareIds.length) : 0;

  const finish = useCallback(async () => {
    if (!lines.length || saving) return;
    setSaving(true);
    const ts = nowMs();
    const txns = [];

    for (const line of lines) {
      const existing = existingItems.find((it) => it.normalizedName === line.normalizedName);
      if (existing) {
        txns.push(
          db.tx.pantryItems[existing.id]
            .update({
              status: 'in',
              addedAt: ts,
              updatedAt: ts,
              ...(line.barcode ? { barcode: line.barcode } : {}),
              ...(line.dietTags?.length ? { dietTags: line.dietTags } : {}),
            })
            .unlink({ claimedBy: existing.claimedBy?.id ?? '' }),
        );
      } else {
        txns.push(
          db.tx.pantryItems[id()]
            .update({
              name: line.name,
              normalizedName: line.normalizedName,
              category: line.category,
              status: 'in',
              shelfLifeDays: line.shelfLifeDays ?? undefined,
              barcode: line.barcode ?? undefined,
              dietTags: line.dietTags?.length ? line.dietTags : undefined,
              addedAt: ts,
              householdId,
              createdAt: ts,
              updatedAt: ts,
            })
            .link({ household: householdId }),
        );
      }
      // Invisible foundation: every grocery is a timestamped purchase event.
      txns.push(
        db.tx.purchases[id()]
          .update({ itemName: line.normalizedName, at: ts, householdId })
          .link({ household: householdId, by: userId }),
      );
    }

    const title = `Groceries · ${lines.length} item${lines.length > 1 ? 's' : ''}`;
    if (cents) {
      txns.push(
        db.tx.expenses[id()]
          .update({ title, amountCents: cents, currency: 'EUR', householdId, createdAt: ts })
          .link({ household: householdId, paidBy: payerId, participants: shareIds }),
      );
    }

    await db.transact(txns);
    if (cents) {
      await logActivity({
        householdId,
        actorId: userId,
        actorName: myName,
        type: 'expense_added',
        metadata: { title, amountCents: cents, paidByName: nameById[payerId] ?? myName },
      });
    }
    handleClose();
  }, [
    lines,
    saving,
    existingItems,
    householdId,
    userId,
    cents,
    payerId,
    shareIds,
    myName,
    nameById,
    handleClose,
  ]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.screen}>
        {phase === 'scan' ? (
          <>
            <Hero topInset={insets.top}>
              <Pressable onPress={handleClose} hitSlop={10} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>✕ Cancel</Text>
              </Pressable>
              <HeroEyebrow>Shopping</HeroEyebrow>
              <View style={styles.titleRow}>
                <HeroTitle>Scan items</HeroTitle>
                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>{lines.length}</Text>
                </View>
              </View>
            </Hero>

            <View style={styles.body}>
              <View style={styles.camWrap}>
                {perm?.granted ? (
                  <CameraView
                    style={styles.cam}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
                    onBarcodeScanned={onScanned}
                  >
                    <View style={styles.frame} />
                    <Text style={styles.camHint}>
                      {looking ? 'looking it up…' : 'point at a barcode'}
                    </Text>
                  </CameraView>
                ) : (
                  <View style={[styles.cam, styles.camOff]}>
                    <Text style={styles.camOffText}>
                      {perm && !perm.canAskAgain
                        ? 'Camera access is off. Add items by name below.'
                        : 'Camera helps you scan barcodes.'}
                    </Text>
                    {perm?.canAskAgain !== false ? (
                      <Pressable style={styles.permBtn} onPress={requestPerm}>
                        <Text style={styles.permBtnText}>Enable camera</Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </View>

              <ScrollView style={styles.listScroll} contentContainerStyle={styles.listPad}>
                {lines.length === 0 ? (
                  <Card pad>
                    <Text style={styles.muted}>Scanned items show up here.</Text>
                  </Card>
                ) : (
                  <Card>
                    {lines.map((l, idx) => (
                      <View key={l.key} style={[styles.row, idx > 0 && styles.rowDivided]}>
                        <Text style={styles.rowEmoji}>{itemEmoji(l.name, l.category)}</Text>
                        <Pressable
                          style={styles.rowNameWrap}
                          hitSlop={6}
                          onPress={() => {
                            setManualName(l.name);
                            setManual({ editKey: l.key });
                          }}
                        >
                          <Text style={styles.rowName} numberOfLines={1}>
                            {l.name}
                          </Text>
                        </Pressable>
                        <Pressable onPress={() => removeLine(l.key)} hitSlop={8} style={styles.del}>
                          <Text style={styles.delX}>✕</Text>
                        </Pressable>
                      </View>
                    ))}
                  </Card>
                )}
              </ScrollView>

              <View style={styles.footer}>
                <Pressable style={styles.typeBtn} onPress={() => setManual({})}>
                  <Text style={styles.typeBtnText}>⌨️  Type instead</Text>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <ChunkyButton
                    label="Review →"
                    disabled={lines.length === 0}
                    onPress={() => setPhase('review')}
                  />
                </View>
              </View>
            </View>
          </>
        ) : (
          <>
            <Hero topInset={insets.top}>
              <View style={styles.headRow}>
                <Pressable onPress={() => setPhase('scan')} hitSlop={10}>
                  <Text style={styles.back}>← Back</Text>
                </Pressable>
              </View>
              <HeroEyebrow>Last step</HeroEyebrow>
              <HeroTitle>Finish up?</HeroTitle>
            </Hero>

            <ScrollView style={styles.body} contentContainerStyle={styles.reviewPad}>
              <Card>
                <View style={styles.sum}>
                  <View style={[styles.sumIc, { backgroundColor: Roomie.sageSoft }]}>
                    <Text style={styles.sumEmoji}>🧺</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sumBig}>
                      {lines.length} item{lines.length > 1 ? 's' : ''} → Kitchen
                    </Text>
                    <Text style={styles.sumMuted} numberOfLines={2}>
                      {lines.map((l) => l.name).join(' · ')}
                    </Text>
                  </View>
                </View>
                <View style={[styles.sum, styles.sumLast]}>
                  <View style={[styles.sumIc, { backgroundColor: '#FFF0E6' }]}>
                    <Text style={styles.sumEmoji}>💶</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sumBig}>
                      {cents ? `${formatEur(cents)} → Money` : 'No cost added'}
                    </Text>
                    <Text style={styles.sumMuted}>
                      {cents
                        ? `equal split · ${formatEur(perHead)} each (${shareIds.length})`
                        : 'add a total below to split it'}
                    </Text>
                  </View>
                </View>
              </Card>

              <Card pad style={{ gap: 12 }}>
                <Text style={styles.label}>Total</Text>
                <TextInput
                  style={styles.input}
                  placeholder="€ 0,00"
                  placeholderTextColor={Roomie.sub}
                  keyboardType="decimal-pad"
                  value={total}
                  onChangeText={setTotal}
                  maxLength={9}
                />

                <Text style={styles.label}>Paid by</Text>
                <View style={styles.chips}>
                  {members.map((m) => (
                    <Pressable
                      key={m.id}
                      onPress={() => setPayerId(m.id)}
                      style={[styles.chip, payerId === m.id && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, payerId === m.id && styles.chipTextOn]}>
                        {m.id === userId ? 'You' : m.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.label}>Split between</Text>
                <View style={styles.chips}>
                  {members.map((m) => {
                    const on = shareIds.includes(m.id);
                    return (
                      <Pressable
                        key={m.id}
                        onPress={() => toggleShare(m.id)}
                        style={[styles.chip, on && styles.chipOn]}
                      >
                        <Text style={[styles.chipText, on && styles.chipTextOn]}>
                          {m.id === userId ? 'You' : m.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Card>

              <ChunkyButton
                label={saving ? 'Saving…' : 'Confirm & finish ✓'}
                disabled={saving}
                onPress={finish}
              />
            </ScrollView>
          </>
        )}

        {manual ? (
          <View style={styles.sheetWrap}>
            <Pressable style={styles.scrim} onPress={() => setManual(null)} />
            <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
              <View style={styles.grab} />
              <Text style={styles.sheetTitle}>
                {manual.editKey
                  ? 'Rename'
                  : manual.barcode
                    ? "Couldn't find that one 🤔"
                    : 'Add by name'}
              </Text>
              <Text style={styles.sheetLede}>
                {manual.editKey
                  ? 'Type a new name for this item.'
                  : manual.barcode
                    ? 'Barcode not recognised — type the name and it joins the list.'
                    : 'No barcode? Type the name (produce, bakery…).'}
              </Text>
              <TextInput
                style={[styles.input, { marginTop: 12 }]}
                placeholder="e.g. tomatoes"
                placeholderTextColor={Roomie.sub}
                value={manualName}
                onChangeText={setManualName}
                onSubmitEditing={submitManual}
                returnKeyType="done"
                autoFocus
              />
              <View style={{ marginTop: 14 }}>
                <ChunkyButton
                  label={manual.editKey ? 'Save' : 'Add'}
                  disabled={!manualName.trim()}
                  onPress={submitManual}
                />
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Roomie.canvas },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cancelBtn: { alignSelf: 'flex-start', marginBottom: 6 },
  cancelText: { color: Roomie.onAccent, fontSize: 15, fontFamily: RoomieFonts.bodyBold },
  back: { color: Roomie.onAccent, fontSize: 15, fontFamily: RoomieFonts.bodyBold },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  countPill: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 3,
  },
  countPillText: { color: Roomie.onAccent, fontFamily: RoomieFonts.display, fontSize: 13 },

  body: { flex: 1, paddingHorizontal: 18 },
  camWrap: { marginTop: 14 },
  cam: {
    height: 180,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#15201a',
  },
  frame: {
    width: 180,
    height: 96,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  camHint: {
    position: 'absolute',
    bottom: 12,
    color: '#fff',
    fontFamily: RoomieFonts.display,
    fontSize: 13,
  },
  camOff: { padding: 22, gap: 14 },
  camOffText: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: RoomieFonts.body,
    fontSize: 14,
    textAlign: 'center',
  },
  permBtn: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  permBtnText: { color: '#fff', fontFamily: RoomieFonts.bodyBold, fontSize: 14 },

  listScroll: { flex: 1, marginTop: 14 },
  listPad: { paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowDivided: { borderTopWidth: 1, borderTopColor: Roomie.rule },
  rowEmoji: { fontSize: 20, width: 28, textAlign: 'center' },
  rowNameWrap: { flex: 1 },
  rowName: { fontSize: 15, fontFamily: RoomieFonts.display, color: Roomie.ink },
  del: { padding: 6 },
  delX: { fontSize: 15, color: Roomie.danger },
  muted: { fontSize: 15, fontFamily: RoomieFonts.body, color: Roomie.sub },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  typeBtn: {
    borderWidth: 1.5,
    borderColor: Roomie.hairline,
    backgroundColor: Roomie.surface,
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  typeBtnText: { color: Roomie.sub, fontFamily: RoomieFonts.display, fontSize: 14 },

  reviewPad: { paddingTop: 16, paddingBottom: 40, gap: 14 },
  sum: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: Roomie.rule },
  sumLast: { borderBottomWidth: 0 },
  sumIc: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  sumEmoji: { fontSize: 20 },
  sumBig: { fontFamily: RoomieFonts.displayBold, fontSize: 16, color: Roomie.ink },
  sumMuted: { fontFamily: RoomieFonts.body, fontSize: 12, color: Roomie.sub, marginTop: 2 },

  label: { fontFamily: RoomieFonts.bodyBold, fontSize: 13, color: Roomie.sub },
  input: {
    borderWidth: 1,
    borderColor: Roomie.hairline,
    backgroundColor: Roomie.input,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    fontFamily: RoomieFonts.display,
    color: Roomie.ink,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1.5,
    borderColor: Roomie.hairline,
    backgroundColor: Roomie.surface,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipOn: { backgroundColor: Roomie.accent, borderColor: Roomie.accent },
  chipText: { fontFamily: RoomieFonts.display, fontSize: 13, color: Roomie.sub },
  chipTextOn: { color: Roomie.onAccent },

  sheetWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,30,22,0.35)' },
  sheet: {
    backgroundColor: Roomie.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 20,
  },
  grab: { width: 40, height: 4, borderRadius: 9, backgroundColor: Roomie.hairline, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontFamily: RoomieFonts.displayBold, fontSize: 18, color: Roomie.ink },
  sheetLede: { fontFamily: RoomieFonts.body, fontSize: 13, color: Roomie.sub, marginTop: 6, lineHeight: 18 },
});
