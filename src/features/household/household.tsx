// T3 + T4 — households. No active membership → create a home OR join one with a
// code. Otherwise show the home (with its invite code to share). The invite code
// is just the household id for now; a prettier short code can come later.

import * as Clipboard from 'expo-clipboard';
import { id } from '@instantdb/react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Roomie, RoomieFonts } from '@/constants/theme';
import { db } from '@/lib/db';
import { logActivity } from '@/features/activity/activity';
import { ActivityFeed } from '@/features/activity/activity-feed';

const INVITE_CODE_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function HouseholdGate({ userId, userName }: { userId: string; userName: string }) {
  const { isLoading, error, data } = db.useQuery({
    memberships: {
      $: { where: { 'user.id': userId, status: 'active' } },
      household: {},
    },
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn&apos;t load your home.</Text>
      </View>
    );
  }

  const membership = data.memberships[0];
  const household = membership?.household;

  if (!household) {
    return <NoHousehold userId={userId} userName={userName} />;
  }

  return (
    <HouseholdHome
      name={household.name}
      role={membership.role}
      code={household.id}
      membershipId={membership.id}
      userId={userId}
      userName={userName}
    />
  );
}

function NoHousehold({ userId, userName }: { userId: string; userName: string }) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  return (
    <View style={styles.block}>
      {mode === 'create' ? (
        <CreateHousehold userId={userId} userName={userName} />
      ) : (
        <JoinHousehold userId={userId} userName={userName} />
      )}
      <Pressable onPress={() => setMode(mode === 'create' ? 'join' : 'create')} style={styles.link}>
        <Text style={styles.linkLabel}>
          {mode === 'create' ? 'Have a code? Join a home' : 'Create a home instead'}
        </Text>
      </Pressable>
    </View>
  );
}

function CreateHousehold({ userId, userName }: { userId: string; userName: string }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give your home a name.');
      return;
    }
    if (INVITE_CODE_SHAPE.test(trimmed)) {
      setError('That looks like an invite code — tap “Have a code? Join a home” below.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const householdId = id();
      const membershipId = id();
      const now = Date.now();
      await db.transact([
        db.tx.households[householdId]
          .update({ name: trimmed, createdAt: now })
          .link({ creator: userId }),
        db.tx.memberships[membershipId]
          .update({ role: 'owner', status: 'active', displayName: userName, joinedAt: now })
          .link({ household: householdId, user: userId }),
      ]);
      await logActivity({
        householdId,
        actorId: userId,
        actorName: userName,
        type: 'household_created',
      });
    } catch {
      setError('Could not create your home. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.inner}>
      <Text style={styles.title}>Create your home</Text>
      <Text style={styles.sub}>Name the place you share — your roommates join next.</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Rotterdam flat"
        placeholderTextColor="#9b9b9b"
        value={name}
        onChangeText={setName}
        autoFocus
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton label="Create home" onPress={onCreate} busy={busy} />
    </View>
  );
}

function JoinHousehold({ userId, userName }: { userId: string; userName: string }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onJoin = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Paste the invite code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data } = await db.queryOnce({
        households: { $: { where: { id: trimmed } } },
      });
      if (!data.households[0]) {
        setError('No home found for that code.');
        return;
      }
      const membershipId = id();
      await db.transact(
        db.tx.memberships[membershipId]
          .update({ role: 'member', status: 'active', displayName: userName, joinedAt: Date.now() })
          .link({ household: trimmed, user: userId }),
      );
      await logActivity({
        householdId: trimmed,
        actorId: userId,
        actorName: userName,
        type: 'member_joined',
      });
    } catch {
      setError('Could not join. Check the code and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.inner}>
      <Text style={styles.title}>Join a home</Text>
      <Text style={styles.sub}>Paste the invite code your roommate shared.</Text>
      <TextInput
        style={styles.input}
        placeholder="Invite code"
        placeholderTextColor="#9b9b9b"
        autoCapitalize="none"
        autoCorrect={false}
        value={code}
        onChangeText={setCode}
        autoFocus
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton label="Join home" onPress={onJoin} busy={busy} />
    </View>
  );
}

function HouseholdHome({
  name,
  role,
  code,
  membershipId,
  userId,
  userName,
}: {
  name: string;
  role: string;
  code: string;
  membershipId: string;
  userId: string;
  userName: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const onLeave = () => {
    Alert.alert('Leave this home?', `You'll leave “${name}”. You can rejoin with the code.`, [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await db.transact(db.tx.memberships[membershipId].update({ status: 'removed' }));
            await logActivity({
              householdId: code,
              actorId: userId,
              actorName: userName,
              type: 'member_left',
            });
          })();
        },
      },
    ]);
  };

  return (
    <View style={styles.block}>
      <Text style={styles.eyebrow}>Your home</Text>
      <Text style={styles.homeName}>{name} 🏡</Text>
      <Text style={styles.sub}>You&apos;re the {role}.</Text>

      <View style={styles.inviteBox}>
        <Text style={styles.inviteLabel}>Invite code — share with your roommates</Text>
        <Text style={styles.inviteCode} selectable>
          {code}
        </Text>
        <Pressable style={styles.copyButton} onPress={onCopy}>
          <Text style={styles.copyLabel}>{copied ? 'Copied ✓' : 'Copy code'}</Text>
        </Pressable>
      </View>

      <ActivityFeed householdId={code} />

      <Pressable onPress={onLeave} style={styles.leave}>
        <Text style={styles.leaveLabel}>Leave home</Text>
      </Pressable>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  busy,
}: {
  label: string;
  onPress: () => void;
  busy: boolean;
}) {
  return (
    <Pressable
      style={[styles.button, busy && styles.buttonDisabled]}
      onPress={onPress}
      disabled={busy}
    >
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonLabel}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 24, alignItems: 'center' },
  block: { gap: 12, paddingVertical: 8 },
  inner: { gap: 10 },
  title: { fontSize: 26, fontFamily: RoomieFonts.display, color: Roomie.ink },
  eyebrow: {
    fontSize: 12,
    fontFamily: RoomieFonts.bodyBold,
    color: Roomie.sub,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  homeName: { fontSize: 34, fontFamily: RoomieFonts.displayBold, color: Roomie.ink },
  sub: { fontSize: 15, fontFamily: RoomieFonts.body, color: Roomie.sub },
  input: {
    borderWidth: 1,
    borderColor: Roomie.hairline,
    backgroundColor: Roomie.input,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: RoomieFonts.body,
    color: Roomie.ink,
    marginTop: 4,
  },
  button: {
    backgroundColor: Roomie.accent,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: Roomie.accent,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  buttonDisabled: { opacity: 0.6 },
  buttonLabel: { color: Roomie.onAccent, fontSize: 16, fontFamily: RoomieFonts.bodyBold },
  link: { alignItems: 'center', paddingVertical: 10 },
  linkLabel: { color: Roomie.sub, fontSize: 14, fontFamily: RoomieFonts.bodySemi },
  inviteBox: {
    marginTop: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: Roomie.card,
    borderWidth: 1,
    borderColor: Roomie.hairline,
    gap: 6,
  },
  inviteLabel: { fontSize: 12, fontFamily: RoomieFonts.bodySemi, color: Roomie.sub },
  inviteCode: { fontSize: 13, color: Roomie.ink, fontFamily: RoomieFonts.bodyBold },
  copyButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: Roomie.ink,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  copyLabel: { color: Roomie.canvas, fontSize: 14, fontFamily: RoomieFonts.bodyBold },
  leave: { alignSelf: 'flex-start', paddingVertical: 8 },
  leaveLabel: { fontSize: 13, fontFamily: RoomieFonts.bodySemi, color: Roomie.sub },
  error: { color: Roomie.danger, fontSize: 14, fontFamily: RoomieFonts.bodySemi },
});
