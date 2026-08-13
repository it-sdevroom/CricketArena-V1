import { Link, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { Button, Card, ErrorNotice, Input, Screen, Segmented } from '@/components/UI';
import { C } from '@/constants/theme';
import { auth } from '@/src/data/repo';
import { describeError } from '@/src/lib/supabase';

type Method = 'email' | 'phone';

/**
 * Two ways in: email and password, or a phone one-time code. Phone OTP needs an
 * SMS provider configured in the Supabase dashboard, so the screen says so
 * plainly rather than failing with a cryptic provider error.
 */
export default function SignIn() {
  const [method, setMethod] = useState<Method>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitEmail = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.signInWithPassword(email.trim(), password);
      router.replace('/(tabs)');
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.sendPhoneOtp(phone.trim());
      setCodeSent(true);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.verifyPhoneOtp(phone.trim(), code.trim());
      router.replace('/(tabs)');
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={s.flex}
    >
      <Screen>
        <Text style={s.title}>Welcome back</Text>
        <Text style={s.lead}>
          Sign in to score matches, run tournaments and manage your squads. Following scores does not
          need an account.
        </Text>

        <Segmented
          value={method}
          onChange={(next) => {
            setMethod(next);
            setError(null);
          }}
          options={[
            { value: 'email', label: 'Email' },
            { value: 'phone', label: 'Phone' },
          ]}
        />

        <View style={s.form}>
          {error ? <ErrorNotice message={error} /> : null}

          {method === 'email' ? (
            <>
              <Input
                label="EMAIL"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@example.com"
              />
              <Input
                label="PASSWORD"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="current-password"
                placeholder="••••••••"
                onSubmitEditing={submitEmail}
              />
              <Button
                title="Sign in"
                onPress={submitEmail}
                loading={busy}
                disabled={!email.trim() || password.length < 6}
              />
              <View style={s.footer}>
                <Text style={s.muted}>New here? </Text>
                <Link href="/(auth)/sign-up" style={s.link}>
                  Create an account
                </Link>
              </View>
            </>
          ) : (
            <>
              <Input
                label="PHONE NUMBER"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                placeholder="+966 5X XXX XXXX"
                editable={!codeSent}
                hint="Include the country code."
              />
              {codeSent ? (
                <>
                  <Input
                    label="6-DIGIT CODE"
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    autoComplete="sms-otp"
                    maxLength={6}
                    placeholder="123456"
                  />
                  <Button
                    title="Verify and sign in"
                    onPress={verifyCode}
                    loading={busy}
                    disabled={code.trim().length < 6}
                  />
                  <Button
                    title="Use a different number"
                    secondary
                    onPress={() => {
                      setCodeSent(false);
                      setCode('');
                    }}
                    style={s.spaced}
                  />
                </>
              ) : (
                <Button
                  title="Send code"
                  onPress={sendCode}
                  loading={busy}
                  disabled={phone.trim().length < 8}
                />
              )}
              <Card style={s.note}>
                <Text style={s.noteText}>
                  Phone sign-in needs an SMS provider enabled under Authentication → Providers in
                  your Supabase dashboard. Email works out of the box.
                </Text>
              </Card>
            </>
          )}
        </View>

        <Button
          title="Continue as a guest"
          secondary
          icon="eye-outline"
          onPress={() => router.replace('/(tabs)')}
          style={s.guest}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.bg },
  title: { color: C.white, fontSize: 27, fontWeight: '900' },
  lead: { color: C.muted, lineHeight: 21, marginTop: 8, marginBottom: 22 },
  form: { marginTop: 22, gap: 2 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 18 },
  muted: { color: C.muted },
  link: { color: C.green, fontWeight: '800' },
  spaced: { marginTop: 10 },
  note: { marginTop: 16, backgroundColor: C.card2 },
  noteText: { color: C.muted, fontSize: 12, lineHeight: 18 },
  guest: { marginTop: 26 },
});
