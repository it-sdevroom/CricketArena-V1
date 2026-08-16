import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  Button,
  Card,
  ChipGroup,
  EmptyState,
  ErrorNotice,
  Input,
  Loading,
  Screen,
  Section,
} from '@/components/UI';
import { C } from '@/constants/theme';
import { organizations } from '@/src/data/repo';
import { useAuth } from '@/src/store/auth';
import { describeError } from '@/src/lib/supabase';
import type { AppRole } from '@/src/data/types';

/**
 * The tournament committee.
 *
 * Running a competition is not a one-person job: somebody schedules, somebody
 * scores, somebody manages a squad. Until now only the person who created the
 * organisation could do anything, which meant sharing one login — and a shared
 * login makes the correction log useless, because every change is attributed to
 * the same name.
 *
 * Roles here are deliberately narrow. A scorer can record balls but cannot
 * delete a tournament; a team manager can pick their squad but cannot score
 * someone else's match. Only an administrator can appoint others, and the
 * database enforces all of it — this screen only shows what the policies
 * already allow.
 */

const ROLES: { value: AppRole; label: string; can: string }[] = [
  {
    value: 'tournament_admin',
    label: 'Administrator',
    can: 'Everything: fixtures, squads, results, and appointing other people.',
  },
  {
    value: 'scorer',
    label: 'Scorer',
    can: 'Score any match in this competition and correct their own mistakes.',
  },
  {
    value: 'umpire',
    label: 'Umpire',
    can: 'Named on matches they officiate. Cannot change scores.',
  },
  {
    value: 'team_manager',
    label: 'Team manager',
    can: 'Add players and pick the eleven for their own team.',
  },
  {
    value: 'stream_operator',
    label: 'Media',
    can: 'Publish highlights, photographs and stream links.',
  },
  {
    value: 'fan',
    label: 'Member',
    can: 'Read-only, plus the tournament chat.',
  },
];

export default function Committee() {
  const { activeOrg, can, user } = useAuth();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AppRole>('scorer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const members = useQuery({
    queryKey: ['org-members', activeOrg?.id],
    queryFn: () => organizations.members(activeOrg!.id),
    enabled: !!activeOrg,
  });

  if (!activeOrg) {
    return (
      <Screen>
        <EmptyState
          icon="people-outline"
          title="No competition selected"
          message="Choose an organisation first."
        />
      </Screen>
    );
  }

  if (!can.manageTournaments) {
    return (
      <Screen>
        <EmptyState
          icon="lock-closed-outline"
          title="Administrators only"
          message="Only an administrator of this competition can change who is on the committee."
        />
      </Screen>
    );
  }

  const invite = async () => {
    const target = email.trim().toLowerCase();
    if (!target.includes('@')) {
      setError('Enter the email address they signed up with.');
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await organizations.addMemberByEmail(activeOrg.id, target, role);
      await queryClient.invalidateQueries({ queryKey: ['org-members', activeOrg.id] });
      setNotice(`${target} added as ${ROLES.find((r) => r.value === role)?.label}.`);
      setEmail('');
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const changeRole = (userId: string, name: string, next: AppRole) => {
    Alert.alert(
      'Change role?',
      `${name} becomes ${ROLES.find((r) => r.value === next)?.label}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change',
          onPress: async () => {
            try {
              await organizations.addMember(activeOrg.id, userId, next);
              await queryClient.invalidateQueries({ queryKey: ['org-members', activeOrg.id] });
            } catch (e) {
              setError(describeError(e));
            }
          },
        },
      ],
    );
  };

  const remove = (userId: string, name: string) => {
    if (userId === user?.id) {
      setError('You cannot remove yourself. Ask another administrator.');
      return;
    }
    Alert.alert('Remove from the committee?', `${name} loses access to this competition.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await organizations.removeMember(activeOrg.id, userId);
            await queryClient.invalidateQueries({ queryKey: ['org-members', activeOrg.id] });
          } catch (e) {
            setError(describeError(e));
          }
        },
      },
    ]);
  };

  const list = members.data ?? [];
  const admins = list.filter((m) => m.role === 'tournament_admin').length;

  return (
    <Screen>
      {error ? <ErrorNotice message={error} /> : null}
      {notice ? <Text style={s.ok}>{notice}</Text> : null}

      <Section title="Add someone">
        <Card style={s.form}>
          <Text style={s.hint}>
            They must have signed up in the app first — you are giving an existing account a role,
            not creating one.
          </Text>

          <Input
            label="THEIR EMAIL"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="scorer@example.com"
          />

          <Text style={s.label}>ROLE</Text>
          <ChipGroup
            value={role}
            onChange={(v) => setRole(v as AppRole)}
            options={ROLES.map((r) => ({ value: r.value, label: r.label }))}
          />
          <Text style={s.roleHint}>{ROLES.find((r) => r.value === role)?.can}</Text>

          <Button title="Add to committee" onPress={invite} loading={busy} />
        </Card>
      </Section>

      <Section title={`Committee (${list.length})`}>
        {members.isLoading ? (
          <Loading />
        ) : list.length === 0 ? (
          <EmptyState icon="people-outline" title="Just you" message="Add people above." />
        ) : (
          <Card style={s.list}>
            {list.map((m, i) => {
              const label = ROLES.find((r) => r.value === m.role)?.label ?? m.role;
              const isLastAdmin = m.role === 'tournament_admin' && admins === 1;
              return (
                <View key={m.id} style={[s.row, i > 0 && s.rowBorder]}>
                  <View style={s.rowText}>
                    <Text style={s.name}>
                      {m.full_name || 'Unnamed'}
                      {m.id === user?.id ? ' (you)' : ''}
                    </Text>
                    <Text style={s.role}>{label}</Text>
                  </View>

                  <View style={s.rowActions}>
                    {!isLastAdmin ? (
                      <Text
                        style={s.action}
                        onPress={() =>
                          changeRole(
                            m.id,
                            m.full_name || 'This person',
                            m.role === 'tournament_admin' ? 'scorer' : 'tournament_admin',
                          )
                        }
                      >
                        {m.role === 'tournament_admin' ? 'Make scorer' : 'Make admin'}
                      </Text>
                    ) : (
                      <Text style={s.protected}>Only admin</Text>
                    )}
                    {!isLastAdmin && m.id !== user?.id ? (
                      <Text
                        style={[s.action, s.danger]}
                        onPress={() => remove(m.id, m.full_name || 'This person')}
                      >
                        Remove
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </Card>
        )}
      </Section>

      <Section title="What each role can do">
        <Card style={s.list}>
          {ROLES.map((r, i) => (
            <View key={r.value} style={[s.roleRow, i > 0 && s.rowBorder]}>
              <Text style={s.roleName}>{r.label}</Text>
              <Text style={s.roleDetail}>{r.can}</Text>
            </View>
          ))}
        </Card>
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  ok: { color: C.green, fontWeight: '800', marginBottom: 14 },
  form: { gap: 4 },
  hint: { color: C.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  label: { color: C.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 8 },
  roleHint: { color: C.muted, fontSize: 12, lineHeight: 17, marginTop: 8, marginBottom: 14 },
  list: { gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  rowBorder: { borderTopWidth: 1, borderTopColor: C.line },
  rowText: { flex: 1, gap: 3 },
  name: { color: C.white, fontWeight: '800', fontSize: 14 },
  role: { color: C.green, fontSize: 12, fontWeight: '700' },
  rowActions: { alignItems: 'flex-end', gap: 6 },
  action: { color: C.green, fontSize: 12, fontWeight: '800' },
  danger: { color: C.red },
  protected: { color: C.muted, fontSize: 11 },
  roleRow: { paddingVertical: 11, gap: 3 },
  roleName: { color: C.white, fontWeight: '800', fontSize: 13 },
  roleDetail: { color: C.muted, fontSize: 12, lineHeight: 17 },
});
