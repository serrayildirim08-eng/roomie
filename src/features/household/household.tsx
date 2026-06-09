// T3 — households. If the signed-in user has no active membership, show a
// "create your home" form. Otherwise show the home. Creating a home writes the
// first real shared data to InstantDB: a household + an owner membership.

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
    return <CreateHousehold userId={userId} />;
  }

  return <HouseholdHome name={household.name} role={membership.role} />;
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
      // The live query re-renders into HouseholdHome on its own.
    } catch {
      setError('Could not create your home. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.block}>
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
      <Pressable
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={onCreate}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonLabel}>Create home</Text>
        )}
      </Pressable>
    </View>
  );
}

function HouseholdHome({ name, role }: { name: string; role: string }) {
  return (
    <View style={styles.block}>
      <Text style={styles.eyebrow}>Your home</Text>
      <Text style={styles.homeName}>{name}</Text>
      <Text style={styles.sub}>You&apos;re the {role}. Next: invite your roommates.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 24, alignItems: 'center' },
  block: { gap: 10, paddingVertical: 8 },
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
  error: { color: '#c0392b', fontSize: 14 },
});
