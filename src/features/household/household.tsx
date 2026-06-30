// T3 + T4 — households. No active membership → create a home OR join one with a
// code. Otherwise show the home (with its invite code to share). The invite code
// is just the household id for now; a prettier short code can come later.

import * as Clipboard from 'expo-clipboard';
import { id } from '@instantdb/react-native';
import { useEffect, useState } from 'react';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Roomie, RoomieFonts } from '@/constants/theme';
import {
  Card,
  ChunkyButton,
  Count,
  Hero,
  HeroBar,
  HeroEyebrow,
  HeroTitle,
  MemberStack,
  SectionHead,
} from '@/components/ui/kit';
import { db } from '@/lib/db';
import { logActivity } from '@/features/activity/activity';
import { ActivityFeed } from '@/features/activity/activity-feed';
import { BrainInput } from '@/features/brain/brain-input';
import { HomePulse } from '@/features/home/home-pulse';
import { TinyWins } from '@/features/home/tiny-wins';

import { STARTER_PACKS, type HomeType } from '@/features/tasks/starter';

import { generateInviteCode, INVITE_CODE_SHAPE, normalizeInviteCode } from './invite-code';

type Roommate = { name: string; seed: string };

// Home-type chips for CreateHousehold — first one is the default and seeds the
// original five chores, so existing behavior is unchanged unless you pick.
const HOME_TYPES: { key: HomeType; label: string }[] = [
  { key: 'apartment', label: '2-roommate apartment' },
  { key: 'student', label: 'Student flat' },
  { key: 'couple', label: 'Couple' },
  { key: 'house', label: '3+ roommate house' },
];

export function HouseholdGate({
  userId,
  userName,
  onSignOut,
}: {
  userId: string;
  userName: string;
  onSignOut: () => void;
}) {
  const { isLoading, error, data } = db.useQuery({
    memberships: {
      $: { where: { 'user.id': userId, status: 'active' } },
      household: { memberships: { $: { where: { status: 'active' } }, user: {} } },
    },
  });

  // Self-heal: older memberships were saved without a displayName (they render
  // as "Someone" everywhere). Whenever the signed-in user opens the app with a
  // real username, stamp it onto their own membership row.
  const myMembership = data?.memberships[0];
  useEffect(() => {
    if (!myMembership || !userName || userName === 'Someone') return;
    if (myMembership.displayName === userName) return;
    void db.transact(db.tx.memberships[myMembership.id].update({ displayName: userName }));
  }, [myMembership, userName]);

  // Backfill: homes created before short invite codes existed have none. Mint
  // one on first view so every home has a shareable code.
  const householdForCode = myMembership?.household;
  useEffect(() => {
    if (!householdForCode || householdForCode.inviteCode) return;
    void db.transact(
      db.tx.households[householdForCode.id].update({ inviteCode: generateInviteCode() }),
    );
  }, [householdForCode?.id, householdForCode?.inviteCode]);

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
    return <NoHousehold userId={userId} userName={userName} onSignOut={onSignOut} />;
  }

  const members: Roommate[] = (household.memberships ?? [])
    .map((m) => ({
      name: m.displayName ?? m.user?.email?.split('@')[0] ?? 'Someone',
      seed: m.user?.id ?? m.id,
    }))
    .filter((m) => m.seed);

  return (
    <HouseholdHome
      name={household.name}
      role={membership.role}
      householdId={household.id}
      code={household.inviteCode ?? ''}
      membershipId={membership.id}
      userId={userId}
      userName={userName}
      members={members}
      onSignOut={onSignOut}
    />
  );
}

function NoHousehold({
  userId,
  userName,
  onSignOut,
}: {
  userId: string;
  userName: string;
  onSignOut: () => void;
}) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  return (
    <SafeAreaView style={styles.noHomeSafe}>
      <ScrollView contentContainerStyle={styles.noHomeBody} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>Roomie</Text>
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
        <Pressable onPress={onSignOut} style={styles.link}>
          <Text style={styles.signoutLabel}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function CreateHousehold({ userId, userName }: { userId: string; userName: string }) {
  const [name, setName] = useState('');
  const [homeType, setHomeType] = useState<HomeType>('apartment');
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
      const inviteCode = generateInviteCode();
      const now = Date.now();
      // Create the home + your owner membership FIRST and let it commit. The
      // chore-seed perms check "is this person a member of the household", which
      // can't resolve while the household, membership and chores are all born in
      // a single transaction — the membership isn't visible yet. Two steps fixes
      // it without loosening the rules.
      await db.transact([
        db.tx.households[householdId]
          .update({ name: trimmed, creatorId: userId, inviteCode, createdAt: now })
          .link({ creator: userId }),
        db.tx.memberships[membershipId]
          .update({
            role: 'owner',
            status: 'active',
            userId,
            displayName: userName,
            joinedAt: now,
          })
          .link({ household: householdId, user: userId }),
      ]);
      // Now that the membership exists, seed the chosen pack's chores quietly.
      await db.transact(
        STARTER_PACKS[homeType].map((name, idx) =>
          db.tx.chores[id()]
            .update({ name, createdAt: now + idx, updatedAt: now + idx })
            .link({ household: householdId, turn: userId }),
        ),
      );
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
      <Text style={styles.chipHint}>What kind of home? Sets your starting chores.</Text>
      <View style={styles.chipRow}>
        {HOME_TYPES.map((t) => {
          const on = t.key === homeType;
          return (
            <Pressable
              key={t.key}
              onPress={() => setHomeType(t.key)}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
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
    const entered = normalizeInviteCode(code);
    if (!entered) {
      setError('Paste the invite code.');
      return;
    }
    if (!INVITE_CODE_SHAPE.test(entered)) {
      setError('That doesn’t look like an invite code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // ruleParams lets a non-member see exactly the one home whose code this
      // is (the households.view rule). So we can look it up FIRST, then join —
      // no blind join + rollback dance.
      const { data } = await db.queryOnce(
        { households: { $: { where: { inviteCode: entered } } } },
        { ruleParams: { code: entered } },
      );
      const home = data.households[0];
      if (!home) {
        setError('No home found for that code.');
        return;
      }
      await db.transact(
        db.tx.memberships[id()]
          .update({
            role: 'member',
            status: 'active',
            userId,
            displayName: userName,
            joinedAt: Date.now(),
          })
          .link({ household: home.id, user: userId }),
      );
      await logActivity({
        householdId: home.id,
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
  householdId,
  code,
  membershipId,
  userId,
  userName,
  members,
  onSignOut,
}: {
  name: string;
  role: string;
  householdId: string;
  code: string;
  membershipId: string;
  userId: string;
  userName: string;
  members: Roommate[];
  onSignOut: () => void;
}) {
  const insets = useSafeAreaInsets();
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
            try {
              // Log BEFORE deleting the row — once it's gone we're no longer a
              // member and the activity write would be denied by perms.
              await logActivity({
                householdId,
                actorId: userId,
                actorName: userName,
                type: 'member_left',
              });
              // Delete (not status-flip) so read access is cut immediately. Any
              // money this person fronted or owes still lives on the expense and
              // settlement rows, so the books stay balanced.
              await db.transact(db.tx.memberships[membershipId].delete());
            } catch {
              Alert.alert('Could not leave', 'Try again.');
            }
          })();
        },
      },
    ]);
  };

  const roommateSub = members.length <= 1 ? 'just you so far' : `${members.length} roommates`;
  const stackLabel =
    members.length <= 1 ? 'invite your roommates' : members.map((m) => m.name).join(' · ');

  return (
    <View style={styles.homeScreen}>
      <ScrollView
        contentContainerStyle={styles.homeScroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Hero topInset={insets.top}>
          <HeroBar houseName={name} sub={roommateSub} you={userName} youSeed={userId} />
          <HeroEyebrow>{`You're the ${role}`}</HeroEyebrow>
          <HeroTitle>Hi {userName} 👋</HeroTitle>
          {members.length > 0 ? <MemberStack members={members} label={stackLabel} /> : null}
        </Hero>

        <View style={styles.homeBody}>
          <BrainInput householdId={householdId} userId={userId} userName={userName} />

          <HomePulse householdId={householdId} userId={userId} />

          <TinyWins householdId={householdId} userId={userId} />

          <Card pad style={styles.inviteCard}>
            <Text style={styles.inviteLabel}>Invite code — share with your roommates</Text>
            <Text style={styles.inviteCode} selectable>
              {code}
            </Text>
            <ChunkyButton
              label={copied ? 'Copied ✓' : 'Copy code'}
              tone="green"
              onPress={onCopy}
              style={styles.copyChunky}
            />
          </Card>

          <View style={styles.section}>
            <SectionHead title="House activity" right={<Count>recent</Count>} />
            <Card>
              <ActivityFeed householdId={householdId} />
            </Card>
          </View>

          <View style={styles.homeFooter}>
            <Pressable onPress={onLeave} style={styles.leave}>
              <Text style={styles.leaveLabel}>Leave home</Text>
            </Pressable>
            <Pressable onPress={onSignOut} style={styles.leave}>
              <Text style={styles.signoutLabel}>Sign out</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
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
  inviteCard: { alignItems: 'center' },
  inviteLabel: { fontSize: 12, fontFamily: RoomieFonts.bodySemi, color: Roomie.sub, textAlign: 'center' },
  inviteCode: {
    fontSize: 32,
    color: Roomie.forestInk,
    fontFamily: RoomieFonts.displayBold,
    textAlign: 'center',
    letterSpacing: 4,
    marginTop: 4,
    marginBottom: 4,
  },
  copyButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: Roomie.ink,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  copyLabel: { color: Roomie.canvas, fontSize: 14, fontFamily: RoomieFonts.bodyBold },
  chipHint: { fontSize: 13, fontFamily: RoomieFonts.body, color: Roomie.sub, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  chip: {
    borderWidth: 1,
    borderColor: Roomie.hairline,
    backgroundColor: Roomie.input,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipOn: { backgroundColor: Roomie.forest, borderColor: Roomie.forest },
  chipLabel: { fontSize: 13, fontFamily: RoomieFonts.bodySemi, color: Roomie.ink },
  chipLabelOn: { color: '#fff' },
  leave: { alignSelf: 'flex-start', paddingVertical: 8 },
  leaveLabel: { fontSize: 13, fontFamily: RoomieFonts.bodySemi, color: Roomie.sub },
  signoutLabel: { fontSize: 13, fontFamily: RoomieFonts.bodySemi, color: Roomie.danger },
  error: { color: Roomie.danger, fontSize: 14, fontFamily: RoomieFonts.bodySemi },

  // Home (in a household) — full-bleed hero + carded body.
  homeScreen: { flex: 1, backgroundColor: Roomie.canvas },
  homeScroll: { paddingBottom: 120 }, // clears the native tab bar (was hidden)
  homeBody: { padding: 18, gap: 16 },
  section: { gap: 11 },
  copyChunky: { marginTop: 12, alignSelf: 'center', minWidth: 150 },
  homeFooter: { flexDirection: 'row', gap: 18, marginTop: 4 },

  // No-household (create / join) screen.
  noHomeSafe: { flex: 1, backgroundColor: Roomie.canvas },
  noHomeBody: { padding: 28, paddingTop: 12, gap: 12 },
  brand: { fontSize: 30, fontFamily: RoomieFonts.displayBold, color: Roomie.forest, marginBottom: 8 },
});
