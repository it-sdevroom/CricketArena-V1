import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';

import { Button, Card, EmptyState, ErrorNotice, Input, Screen, Section } from '@/components/UI';
import { C } from '@/constants/theme';
import { auth } from '@/src/data/repo';
import { useAuth } from '@/src/store/auth';
import { describeError } from '@/src/lib/supabase';

export default function Profile() {
  const { user, profile, refresh, memberships } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [city, setCity] = useState(profile?.city ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!user) {
    return (
      <Screen>
        <EmptyState
          icon="person-circle-outline"
          title="Not signed in"
          message="Sign in to manage your profile."
          actionLabel="Sign in"
          onAction={() => router.push('/(auth)/sign-in')}
        />
      </Screen>
    );
  }

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await auth.updateProfile(user.id, { full_name: fullName.trim(), city: city.trim() || null });
      await refresh();
      setSaved(true);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {error ? <ErrorNotice message={error} /> : null}

      <Input label="FULL NAME" value={fullName} onChangeText={setFullName} placeholder="Your name" />
      <Input label="CITY" value={city} onChangeText={setCity} placeholder="Riyadh" />

      <Card style={s.readonly}>
        <Text style={s.readonlyLabel}>SIGNED IN AS</Text>
        <Text style={s.readonlyValue}>{user.email ?? user.phone ?? user.id}</Text>
      </Card>

      <Button title={saved ? 'Saved' : 'Save changes'} onPress={save} loading={busy} />

      {memberships.length ? (
        <Section title="Your roles">
          <Card style={s.roles}>
            {memberships.map((org) => (
              <Text key={org.id} style={s.roleLine}>
                <Text style={s.roleOrg}>{org.name}</Text> — {org.role.replace(/_/g, ' ')}
              </Text>
            ))}
          </Card>
        </Section>
      ) : null}

      <Section title="Privacy">
        <Button title="Privacy policy" secondary onPress={() => router.push('/legal/privacy')} />
      </Section>

      <Section title="Danger zone">
        <Card style={s.danger}>
          <Text style={s.dangerTitle}>Delete your account</Text>
          <Text style={s.dangerBody}>
            This removes your login, profile, follows and notifications, and cannot be undone.
            Matches you have already played in keep their scorecards — those runs belong to the
            match, not to your login — but they will no longer be linked to your account.
          </Text>
          <Button
            title="Delete my account"
            danger
            onPress={() => router.push('/legal/delete-account')}
          />
        </Card>
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  readonly: { marginBottom: 20, gap: 6 },
  readonlyLabel: { color: C.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  readonlyValue: { color: C.white, fontWeight: '700' },
  roles: { gap: 9 },
  roleLine: { color: C.muted, fontSize: 13, textTransform: 'capitalize' },
  roleOrg: { color: C.white, fontWeight: '800' },
  danger: { gap: 12, borderColor: C.red + '55' },
  dangerTitle: { color: C.white, fontWeight: '900', fontSize: 15 },
  dangerBody: { color: C.muted, fontSize: 13, lineHeight: 19 },
});
