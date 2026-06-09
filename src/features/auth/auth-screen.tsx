// Roomie auth screen — username + password sign in, with username/email/password
// sign up verified by an emailed code. Shown by the root layout whenever the
// user is signed out (see app/_layout.tsx <SignedOut>).
//
// Clerk runs the auth; on success setActive() flips Clerk to "signed in" and the
// root layout swaps this screen for the app. Minimal UI on purpose.

// Classic (stable) hooks — `@clerk/expo` v3's default hooks moved to the new
// "signals/future" API; the legacy entry keeps the documented create/verify
// flow and runs in pure JS (Expo Go friendly).
import { useSignIn, useSignUp } from '@clerk/expo/legacy';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Mode = 'signIn' | 'signUp';

function messageFromError(err: unknown): string {
  if (err && typeof err === 'object' && 'errors' in err) {
    const errors = (err as { errors?: { message?: string }[] }).errors;
    if (errors?.[0]?.message) return errors[0].message;
  }
  return 'Something went wrong. Please try again.';
}

export function AuthScreen() {
  const { isLoaded: signInLoaded, signIn, setActive: setSignInActive } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setSignUpActive } = useSignUp();

  const [mode, setMode] = useState<Mode>('signIn');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSignIn = async () => {
    if (!signInLoaded) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signIn.create({ identifier: username.trim(), password });
      if (res.status === 'complete') {
        await setSignInActive({ session: res.createdSessionId });
      } else {
        setError('Could not finish signing in.');
      }
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setBusy(false);
    }
  };

  const onSignUp = async () => {
    if (!signUpLoaded) return;
    setBusy(true);
    setError(null);
    try {
      await signUp.create({
        username: username.trim(),
        emailAddress: email.trim(),
        password,
      });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async () => {
    if (!signUpLoaded) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (res.status === 'complete') {
        await setSignUpActive({ session: res.createdSessionId });
      } else {
        setError('That code did not work. Check your email and try again.');
      }
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setPendingVerification(false);
    setPassword('');
    setCode('');
  };

  // Sign-up step 2: enter the emailed code.
  if (mode === 'signUp' && pendingVerification) {
    return (
      <Shell>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>We sent a 6-digit code to {email}.</Text>
        <TextInput
          style={styles.input}
          placeholder="6-digit code"
          placeholderTextColor="#9b9b9b"
          keyboardType="number-pad"
          value={code}
          onChangeText={setCode}
          autoFocus
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton label="Verify" onPress={onVerify} busy={busy} />
        <LinkButton label="Back" onPress={() => switchMode('signUp')} />
      </Shell>
    );
  }

  const isSignIn = mode === 'signIn';

  return (
    <Shell>
      <Text style={styles.title}>Roomie</Text>
      <Text style={styles.subtitle}>{isSignIn ? 'Welcome back.' : 'Create your account.'}</Text>

      <TextInput
        style={styles.input}
        placeholder="Username"
        placeholderTextColor="#9b9b9b"
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
      />
      {!isSignIn ? (
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#9b9b9b"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
      ) : null}
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#9b9b9b"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PrimaryButton
        label={isSignIn ? 'Sign in' : 'Sign up'}
        onPress={isSignIn ? onSignIn : onSignUp}
        busy={busy}
      />
      <LinkButton
        label={isSignIn ? 'New here? Create an account' : 'Already have an account? Sign in'}
        onPress={() => switchMode(isSignIn ? 'signUp' : 'signIn')}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        {children}
      </KeyboardAvoidingView>
    </SafeAreaView>
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

function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.link} onPress={onPress}>
      <Text style={styles.linkLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 12 },
  title: { fontSize: 34, fontWeight: '700', color: '#111' },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#e2e2e2',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111',
  },
  button: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { alignItems: 'center', paddingVertical: 12 },
  linkLabel: { color: '#666', fontSize: 14 },
  error: { color: '#c0392b', fontSize: 14 },
});
