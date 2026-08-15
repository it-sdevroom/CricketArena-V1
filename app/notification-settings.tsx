import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Switch, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';

import { Button, Card, EmptyState, ErrorNotice, Screen, Section } from '@/components/UI';
import { C } from '@/constants/theme';
import { push } from '@/src/data/repo';
import { useAuth } from '@/src/store/auth';
import { registerForPush } from '@/src/lib/notifications';
import { isSignOutOnCloseEnabled, setSignOutOnClose } from '@/src/lib/session-policy';
import { describeError } from '@/src/lib/supabase';

/**
 * Choose what is worth interrupting someone for.
 *
 * A ball-by-ball push feed would be unbearable, so the options are the moments
 * people actually want: a match starting, a result, an answer to a squad
 * application. Everything defaults on except the noisiest one.
 */

const OPTIONS: { key: string; title: string; detail: string }[] = [
  {
    key: 'match_start',
    title: 'Match starts',
    detail: 'When a team you follow takes the field.',
  },
  {
    key: 'match_result',
    title: 'Results',
    detail: 'The final score once a match you follow finishes.',
  },
  {
    key: 'registration_updates',
    title: 'Your registrations',
    detail: 'When an organiser approves or declines your application to join a squad.',
  },
  {
    key: 'chat_mentions',
    title: 'Tournament chat',
    detail: 'Messages in competitions you belong to.',
  },
  {
    key: 'wicket_of_followed_player',
    title: 'Every wicket',
    detail: 'A player you follow is dismissed. Noisy during a run chase.',
  },
];

export default function NotificationSettings() {
  const { user } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [signOutOnClose, setSignOutOnCloseState] = useState(false);

  useEffect(() => {
    void isSignOutOnCloseEnabled().then(setSignOutOnCloseState);
  }, []);

  const saved = useQuery({
    queryKey: ['notification-prefs', user?.id],
    queryFn: () => push.getPreferences(user!.id),
    enabled: !!user,
  });

  useEffect(() => {
    if (saved.data) {
      setPrefs(
        Object.fromEntries(OPTIONS.map((o) => [o.key, (saved.data as any)[o.key] ?? true])),
      );
    } else if (saved.isFetched) {
      // No row yet: defaults, with the noisy one off.
      setPrefs(
        Object.fromEntries(
          OPTIONS.map((o) => [o.key, o.key !== 'wicket_of_followed_player']),
        ),
      );
    }
  }, [saved.data, saved.isFetched]);

  if (!user) {
    return (
      <Screen>
        <EmptyState
          icon="notifications-off-outline"
          title="Not signed in"
          message="Sign in to choose what you are notified about."
          actionLabel="Sign in"
          onAction={() => router.push('/(auth)/sign-in')}
        />
      </Screen>
    );
  }

  const enable = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    const result = await registerForPush();
    if (result.token) {
      setStatus('This device will now receive notifications.');
    } else {
      setError(result.message ?? 'Could not enable notifications.');
    }
    setBusy(false);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await push.savePreferences(user.id, prefs);
      setStatus('Saved.');
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {error ? <ErrorNotice message={error} /> : null}
      {status ? <Text style={s.ok}>{status}</Text> : null}

      {Platform.OS === 'web' ? (
        <Card style={s.note}>
          <Text style={s.noteTitle}>Notifications need the phone app</Text>
          <Text style={s.noteBody}>
            The website cannot send notifications to a locked phone. Install the Android app and
            these settings will apply there. You can still choose your preferences here.
          </Text>
        </Card>
      ) : (
        <Section title="This device">
          <Card style={s.note}>
            <Text style={s.noteBody}>
              Allow notifications so match updates reach you when the app is closed.
            </Text>
            <Button title="Enable on this device" onPress={enable} loading={busy} />
          </Card>
        </Section>
      )}

      <Section title="Tell me about">
        <Card style={s.list}>
          {OPTIONS.map((option, i) => (
            <View key={option.key} style={[s.row, i > 0 && s.rowBorder]}>
              <View style={s.rowText}>
                <Text style={s.rowTitle}>{option.title}</Text>
                <Text style={s.rowDetail}>{option.detail}</Text>
              </View>
              <Switch
                value={prefs[option.key] ?? false}
                onValueChange={(v) => setPrefs((p) => ({ ...p, [option.key]: v }))}
                trackColor={{ true: C.green, false: C.line }}
                thumbColor={C.white}
              />
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Security">
        <Card style={s.list}>
          <View style={s.row}>
            <View style={s.rowText}>
              <Text style={s.rowTitle}>Sign out when the app closes</Text>
              <Text style={s.rowDetail}>
                For a shared or borrowed phone. Leave this off if you score matches — being
                signed out mid-over, possibly with balls still waiting to sync, is worse than
                the risk it guards against. Backgrounding the app for a call does not count.
              </Text>
            </View>
            <Switch
              value={signOutOnClose}
              onValueChange={(v) => {
                setSignOutOnCloseState(v);
                void setSignOutOnClose(v);
              }}
              trackColor={{ true: C.green, false: C.line }}
              thumbColor={C.white}
            />
          </View>
        </Card>
      </Section>

      <Button title="Save preferences" onPress={save} loading={busy} />
    </Screen>
  );
}

const s = StyleSheet.create({
  ok: { color: C.green, fontWeight: '800', marginBottom: 14 },
  note: { gap: 12, marginBottom: 4 },
  noteTitle: { color: C.white, fontWeight: '900', fontSize: 15 },
  noteBody: { color: C.muted, fontSize: 13, lineHeight: 19 },
  list: { gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: C.line },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { color: C.white, fontWeight: '800', fontSize: 14 },
  rowDetail: { color: C.muted, fontSize: 12, lineHeight: 17 },
});
