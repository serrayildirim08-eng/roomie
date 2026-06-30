// The brain box — one line at the top of Home: "Tell the house…".
//
// Flow: type → worker returns draft fragments → DRAFT CARD (editable: kill a
// fragment with ✕, fix an expense amount inline) → Confirm → applyFragments
// writes to the rooms → a tiny quiet ack. Nothing is ever saved without
// Confirm; a failed brain is a shrug, never a guess.

import { useAuth as useClerkAuth } from '@clerk/expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Roomie, RoomieFonts } from '@/constants/theme';
import { parseAmountToCents } from '@/features/money/money-logic';

import { applyFragments } from './apply';
import { BRAIN_URL, fragmentLine } from './types';
import type { DraftFragment, DraftResponse } from './types';

type Phase = 'idle' | 'thinking' | 'draft' | 'applying' | 'done' | 'error';

// One-time disclosure before any text leaves the device for the AI.
const AI_CONSENT_KEY = 'roomie:ai-consent';

function askAiConsent(): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(
      'Roomie uses AI',
      'To sort what you type into the right place, Roomie sends this text to a third-party AI service. Your roommates don’t see it. OK to continue?',
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'OK, continue', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}

export function BrainInput({
  householdId,
  userId,
  userName,
}: {
  householdId: string;
  userId: string;
  userName: string;
}) {
  const { getToken } = useClerkAuth();
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [fragments, setFragments] = useState<DraftFragment[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const [ack, setAck] = useState<string[]>([]);
  const [amountDraft, setAmountDraft] = useState<Record<number, string>>({});
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const reset = () => {
    setPhase('idle');
    setFragments([]);
    setQuestion(null);
    setAmountDraft({});
  };

  const onSend = async () => {
    const note = text.trim();
    if (!note || phase === 'thinking') return;
    // Gate the very first AI call on an explicit one-time consent.
    const consented = await AsyncStorage.getItem(AI_CONSENT_KEY);
    if (!consented) {
      const ok = await askAiConsent();
      if (!ok) return;
      await AsyncStorage.setItem(AI_CONSENT_KEY, '1');
    }
    setPhase('thinking');
    setAck([]);
    try {
      const token = await getToken();
      const res = await fetch(`${BRAIN_URL}/draft`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: note }),
      });
      const body = (await res.json()) as DraftResponse;
      if (!res.ok) throw new Error(body.error ?? `http ${res.status}`);
      setFragments(body.fragments);
      setQuestion(body.question);
      setPhase(body.fragments.length > 0 || body.question ? 'draft' : 'done');
      if (body.fragments.length === 0 && !body.question) {
        setAck(['Nothing to file — noted. 🌿']);
        setText('');
      }
    } catch (e) {
      setErrorDetail((e as Error)?.message ?? String(e));
      setPhase('error');
    }
  };

  const onConfirm = async () => {
    // Fold any inline amount edits back into the fragments before writing.
    const finalFragments = fragments.map((f, idx) => {
      if (f.target !== 'expense' || amountDraft[idx] === undefined) return f;
      const cents = parseAmountToCents(amountDraft[idx]);
      return cents ? { ...f, amountCents: cents } : f;
    });
    setPhase('applying');
    try {
      const result = await applyFragments(finalFragments, { householdId, userId, userName });
      setAck([...result.applied.map((l) => `✓ ${l}`), ...result.skipped.map((l) => `· ${l}`)]);
      setText('');
      setPhase('done');
      setFragments([]);
      setQuestion(null);
      setAmountDraft({});
    } catch {
      setPhase('error');
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Tell the house… (süt aldım 5€)"
          placeholderTextColor={Roomie.sub}
          value={text}
          onChangeText={(t) => {
            setText(t);
            if (phase === 'done' || phase === 'error') setPhase('idle');
          }}
          onSubmitEditing={onSend}
          returnKeyType="send"
        />
        <Pressable style={styles.send} onPress={onSend} disabled={phase === 'thinking'}>
          {phase === 'thinking' ? (
            <ActivityIndicator color={Roomie.onAccent} />
          ) : (
            <Text style={styles.sendLabel}>✨</Text>
          )}
        </Pressable>
      </View>

      {phase === 'draft' ? (
        <View style={styles.card}>
          <Text style={styles.reviewNote}>Review before saving — nothing saves until you confirm.</Text>
          {question ? <Text style={styles.question}>🧠 {question}</Text> : null}
          {fragments.map((f, idx) => (
            <View key={idx} style={styles.fragRow}>
              <Text style={styles.fragText}>{fragmentLine(f)}</Text>
              {f.target === 'expense' ? (
                <TextInput
                  style={styles.amountEdit}
                  defaultValue={((f.amountCents ?? 0) / 100).toFixed(2)}
                  keyboardType="decimal-pad"
                  onChangeText={(v) => setAmountDraft((d) => ({ ...d, [idx]: v }))}
                />
              ) : null}
              <Pressable
                onPress={() => setFragments((fs) => fs.filter((_, i) => i !== idx))}
                hitSlop={8}
                accessibilityLabel="Remove this part"
              >
                <Text style={styles.fragKill}>✕</Text>
              </Pressable>
            </View>
          ))}
          <View style={styles.cardActions}>
            <Pressable style={styles.cancel} onPress={reset}>
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
            {fragments.length > 0 ? (
              <Pressable style={styles.confirm} onPress={onConfirm}>
                <Text style={styles.confirmLabel}>Confirm ✓</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {phase === 'applying' ? <ActivityIndicator style={styles.applying} /> : null}

      {phase === 'done' && ack.length > 0 ? (
        <View style={styles.ackWrap}>
          {ack.map((line, i) => (
            <Text key={i} style={styles.ackLine}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}

      {phase === 'error' ? (
        <Text style={styles.error}>
          Brain couldn&apos;t read that — nothing was saved.
          {errorDetail ? `\n(${errorDetail})` : ''}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginBottom: 4 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: Roomie.hairline,
    backgroundColor: Roomie.input,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: RoomieFonts.body,
    color: Roomie.ink,
  },
  send: {
    backgroundColor: Roomie.accent,
    borderRadius: 16,
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Roomie.accent,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  sendLabel: { fontSize: 20 },
  card: {
    backgroundColor: Roomie.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Roomie.hairline,
    padding: 14,
    gap: 8,
  },
  reviewNote: { fontSize: 12.5, fontFamily: RoomieFonts.body, color: Roomie.sub },
  question: { fontSize: 14, fontFamily: RoomieFonts.bodySemi, color: Roomie.ink },
  fragRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fragText: { flex: 1, fontSize: 14, fontFamily: RoomieFonts.bodySemi, color: Roomie.ink },
  amountEdit: {
    borderWidth: 1,
    borderColor: Roomie.hairline,
    backgroundColor: Roomie.input,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    fontFamily: RoomieFonts.bodySemi,
    color: Roomie.ink,
    minWidth: 64,
    textAlign: 'right',
  },
  fragKill: { fontSize: 14, color: Roomie.danger, padding: 4 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 2 },
  cancel: { paddingVertical: 9, paddingHorizontal: 10 },
  cancelLabel: { fontSize: 14, fontFamily: RoomieFonts.bodySemi, color: Roomie.sub },
  confirm: {
    backgroundColor: Roomie.sage,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  confirmLabel: { color: Roomie.onAccent, fontSize: 14, fontFamily: RoomieFonts.bodyBold },
  applying: { marginTop: 4 },
  ackWrap: { gap: 2 },
  ackLine: { fontSize: 13, fontFamily: RoomieFonts.body, color: Roomie.sage },
  error: { fontSize: 13, fontFamily: RoomieFonts.body, color: Roomie.danger },
});
