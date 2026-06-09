// T3 + T4 — households. No active membership → create a home OR join one with a
// code. Otherwise show the home (with its invite code to share). The invite code
// is just the household id for now; a prettier short code can come later.

import { id } from '@instantdb/react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { db } from '@/lib/db';

export function HouseholdGate({ userId }: { userId: string }) {
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
    return <NoHousehold userId={userId} />;
  }

  return <HouseholdHome name={household.name} role={membership.role} code={household.id} />;
}

function NoHousehold({ userId }: { userId: string }) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  return (
    <View style={styles.block}>
      {mode === 'create' ? <CreateHousehold userId={userId} /> : <JoinHousehold userId={userId} />}
      <Pressable onPress={() => setMode(mode === 'create' ? 'join' : 'create')} style={styles.link}>
        <Text style={styles.linkLabel}>
          {mode === 'create' ? 'Have a code? Join a home' : 'Create a home instead'}
        </Text>
      </Pressable>
    </View>
  );
}

function CreateHousehold({ userId }: { userId: string }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give your home a name.');
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
          .update({ role: 'owner', status: 'active', joinedAt: now })
          .link({ household: householdId, user: userId }),
      ]);
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

function JoinHousehold({ userId }: { userId: string }) {
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
          .update({ role: 'member', status: 'active', joinedAt: Date.now() })
          .link({ household: trimmed, user: userId }),
      );
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

function HouseholdHome({ name, role, code }: { name: string; role: string; code: string }) {
  return (
    <View style={styles.block}>
      <Text style={styles.eyebrow}>Your home</Text>
      <Text style={styles.homeName}>{name}</Text>
      <Text style={styles.sub}>You&apos;re the {role}.</Text>

      <View style={styles.inviteBox}>
        <Text style={styles.inviteLabel}>Invite code — share with your roommates</Text>
        <Text style={styles.inviteCode} selectable>
          {code}
        </Text>
      </View>
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
  title: { fontSize: 24, fontWeight: '700', color: '#111' },
  eyebrow: { fontSize: 13, color: '#9b9b9b', textTransform: 'uppercase', letterSpacing: 1 },
  homeName: { fontSize: 30, fontWeight: '700', color: '#111' },
  sub: { fontSize: 15, color: '#666' },
  input: {
    borderWidth: 1,
    borderColor: '#e2e2e2',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111',
    marginTop: 4,
  },
  button: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { alignItems: 'center', paddingVertical: 10 },
  linkLabel: { color: '#666', fontSize: 14 },
  inviteBox: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    gap: 6,
  },
  inviteLabel: { fontSize: 12, color: '#9b9b9b' },
  inviteCode: { fontSize: 13, color: '#111', fontWeight: '600' },
  error: { color: '#c0392b', fontSize: 14 },
});
