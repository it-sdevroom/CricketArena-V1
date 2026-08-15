import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text } from 'react-native';

import { Button, Card, ErrorNotice, Input, Screen, PasswordInput } from '@/components/UI';
import { C } from '@/constants/theme';
import { auth } from '@/src/data/repo';
import { describeError } from '@/src/lib/supabase';

export default function SignUp() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const passwordProblem =
    password.length > 0 && password.length < 8 ? 'Use at least 8 characters.' : undefined;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await auth.signUp(email.trim(), password, fullName.trim());
      // With email confirmation switched on Supabase returns a user but no
      // session, so sending them to the app would just bounce them back.
      if (result.session) {
        router.replace('/(tabs)');
      } else {
        setNeedsConfirmation(true);
      }
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  if (needsConfirmation) {
    return (
      <Screen>
        <Text style={s.title}>Check your email</Text>
        <Text style={s.lead}>
          We sent a confirmation link to {email.trim()}. Open it, then come back and sign in.
        </Text>
        <Button title="Back to sign in" onPress={() => router.replace('/(auth)/sign-in')} />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.flex}>
      <Screen>
        <Text style={s.title}>Create your account</Text>
        <Text style={s.lead}>
          You will start as a fan. An organiser can then invite you into their competition as a
          scorer, team manager or administrator.
        </Text>

        {error ? <ErrorNotice message={error} /> : null}

        <Input
          label="FULL NAME"
          value={fullName}
          onChangeText={setFullName}
          autoComplete="name"
          placeholder="Adnan Rahman"
        />
        <Input
          label="EMAIL"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@example.com"
        />
        <PasswordInput
                label="PASSWORD"
          value={password}
          onChangeText={setPassword}
          
          autoComplete="new-password"
          placeholder="At least 8 characters"
          error={passwordProblem}
        />

        <Button
          title="Create account"
          onPress={submit}
          loading={busy}
          disabled={!fullName.trim() || !email.trim() || password.length < 8}
        />

        <Card style={s.note}>
          <Text style={s.noteText}>
            Want to run your own league? After signing in, open More → Organiser console and create
            an organisation. You become its administrator automatically.
          </Text>
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.bg },
  title: { color: C.white, fontSize: 27, fontWeight: '900' },
  lead: { color: C.muted, lineHeight: 21, marginTop: 8, marginBottom: 24 },
  note: { marginTop: 22, backgroundColor: C.card2 },
  noteText: { color: C.muted, fontSize: 12, lineHeight: 18 },
});
