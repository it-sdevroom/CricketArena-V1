import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Card, EmptyState, ErrorNotice, Input, Screen } from '@/components/UI';
import { C } from '@/constants/theme';
import { useAuth } from '@/src/store/auth';
import { supabase, describeError } from '@/src/lib/supabase';

/**
 * Account deletion.
 *
 * Deliberately a separate screen rather than a dialog: this is irreversible,
 * and the store guidelines expect it to be reachable and unambiguous rather
 * than buried. The typed confirmation exists so it cannot happen by mistake on
 * a phone in someone's pocket.
 */

const CONFIRM_WORD = 'DELETE';

export default function DeleteAccount() {
  const { user, signOut } = useAuth();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return (
      <Screen>
        <EmptyState
          icon="person-circle-outline"
          title="Not signed in"
          message="There is no account to delete."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('delete_my_account');
      if (rpcError) throw rpcError;
      // The account is gone; clear the local session so the app does not keep
      // retrying with a token that no longer resolves to a user.
      await signOut();
      router.replace('/');
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  };

  const armed = confirm.trim().toUpperCase() === CONFIRM_WORD;

  return (
    <Screen>
      {error ? <ErrorNotice message={error} /> : null}

      <Card style={s.card}>
        <Text style={s.title}>This cannot be undone</Text>

        <View style={s.list}>
          <Line tone="red" text="Your login and profile are deleted" />
          <Line tone="red" text="Your follows, notifications and pending registrations are deleted" />
          <Line tone="red" text="You are removed from every organisation you belong to" />
        </View>

        <Text style={s.subtle}>What stays</Text>
        <View style={s.list}>
          <Line tone="muted" text="Scorecards of matches you have already played in" />
          <Line tone="muted" text="Your name against those innings, with no account or contact details attached" />
        </View>

        <Text style={s.why}>
          Match records stay because they belong to the competition, not to one account. Removing
          them would rewrite results other players and organisers depend on.
        </Text>
      </Card>

      <Card style={s.card}>
        <Text style={s.signedIn}>Signed in as {user.email ?? user.phone ?? user.id}</Text>
        <Input
          label={`TYPE ${CONFIRM_WORD} TO CONFIRM`}
          value={confirm}
          onChangeText={setConfirm}
          placeholder={CONFIRM_WORD}
          autoCapitalize="characters"
        />
        <Button
          title="Permanently delete my account"
          danger
          disabled={!armed}
          loading={busy}
          onPress={remove}
        />
        <Button title="Keep my account" secondary onPress={() => router.back()} />
      </Card>
    </Screen>
  );
}

function Line({ text, tone }: { text: string; tone: 'red' | 'muted' }) {
  return (
    <View style={s.line}>
      <View style={[s.dot, { backgroundColor: tone === 'red' ? C.red : C.muted }]} />
      <Text style={s.lineText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: 14, marginBottom: 16 },
  title: { color: C.red, fontWeight: '900', fontSize: 17 },
  list: { gap: 8 },
  line: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  lineText: { color: C.muted, fontSize: 13, lineHeight: 20, flex: 1 },
  subtle: { color: C.green, fontWeight: '900', fontSize: 12, letterSpacing: 0.6, marginTop: 4 },
  why: { color: C.muted, fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
  signedIn: { color: C.white, fontWeight: '700', fontSize: 13 },
});
