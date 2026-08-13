import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, EmptyState, ErrorNotice, Input, Loading, Pill, Screen, Section } from '@/components/UI';
import { C } from '@/constants/theme';
import { matches, organizations, tournaments } from '@/src/data/repo';
import { useAuth } from '@/src/store/auth';
import { describeError } from '@/src/lib/supabase';

/**
 * Everything an organiser needs in one place. If the signed-in user does not
 * belong to an organisation yet, the screen turns into a one-field form that
 * creates one and makes them its administrator.
 */
export default function OrganizerConsole() {
  const { user, activeOrg, memberships, can, refresh } = useAuth();
  const queryClient = useQueryClient();

  const leagues = useQuery({
    queryKey: ['tournaments', activeOrg?.id],
    queryFn: () => tournaments.list(activeOrg?.id),
    enabled: !!activeOrg,
  });

  const live = useQuery({
    queryKey: ['org-live', activeOrg?.id],
    queryFn: () => matches.summaries({ organizationId: activeOrg?.id, status: ['live', 'toss', 'innings_break'] }),
    enabled: !!activeOrg,
  });

  if (!user) {
    return (
      <Screen>
        <EmptyState
          icon="lock-closed-outline"
          title="Sign in to organise"
          message="Running a competition needs an account so we know who recorded each decision."
          actionLabel="Sign in"
          onAction={() => router.push('/(auth)/sign-in')}
        />
      </Screen>
    );
  }

  if (memberships.length === 0) {
    return <CreateOrganization onCreated={refresh} userId={user.id} />;
  }

  return (
    <Screen refreshing={leagues.isFetching} onRefresh={() => void leagues.refetch()}>
      <Card style={s.orgCard}>
        <Text style={s.orgLabel}>ACTING IN</Text>
        <Text style={s.orgName}>{activeOrg?.name}</Text>
        <Pill text={(activeOrg?.role ?? 'fan').replace(/_/g, ' ').toUpperCase()} tone="green" />
      </Card>

      {!can.manageTournaments ? (
        <Card style={s.notice}>
          <Text style={s.noticeText}>
            You are a {activeOrg?.role?.replace(/_/g, ' ')} in this organisation. Creating and
            configuring competitions needs the tournament admin role.
          </Text>
        </Card>
      ) : null}

      {live.data?.length ? (
        <Section title="Live right now">
          {live.data.map((match) => (
            <Pressable key={match.match_id} onPress={() => router.push(`/scorer/${match.match_id}`)}>
              <Card style={s.liveRow}>
                <View style={s.flex}>
                  <Text style={s.liveTeams} numberOfLines={1}>
                    {match.home_team_short} v {match.away_team_short}
                  </Text>
                  <Text style={s.liveMeta}>{match.label ?? 'Match'}</Text>
                </View>
                <Ionicons name="baseball-outline" size={19} color={C.green} />
              </Card>
            </Pressable>
          ))}
        </Section>
      ) : null}

      <Section title="Competitions" action={can.manageTournaments ? 'New' : undefined} onAction={() => router.push('/organizer/new-tournament')}>
        {leagues.isLoading ? (
          <Loading />
        ) : leagues.data?.length ? (
          leagues.data.map((t) => (
            <Pressable key={t.id} onPress={() => router.push(`/tournament/${t.id}`)}>
              <Card style={s.leagueRow}>
                <View style={s.flex}>
                  <Text style={s.leagueName} numberOfLines={1}>
                    {t.name}
                  </Text>
                  <Text style={s.leagueMeta}>
                    {t.match_format} • {t.format.replace(/_/g, ' ')} • {t.status}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={C.muted} />
              </Card>
            </Pressable>
          ))
        ) : (
          <EmptyState
            icon="trophy-outline"
            title="No competitions yet"
            message="Create one, register your teams, then generate the whole fixture list in a tap."
            actionLabel={can.manageTournaments ? 'Create a tournament' : undefined}
            onAction={() => router.push('/organizer/new-tournament')}
          />
        )}
      </Section>

      <Section title="Set-up">
        <Button
          title="Teams & players"
          secondary
          icon="people-outline"
          onPress={() => router.push('/organizer/squads')}
          style={s.spaced}
        />
      </Section>
    </Screen>
  );
}

function CreateOrganization({ onCreated, userId }: { onCreated: () => void; userId: string }) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await organizations.create({ name: name.trim(), slug, city: city.trim() || undefined }, userId);
      onCreated();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Text style={s.title}>Create your organisation</Text>
      <Text style={s.lead}>
        An organisation owns your teams, players and competitions. Whoever creates it becomes its
        administrator — that is you.
      </Text>

      {error ? <ErrorNotice message={error} /> : null}

      <Input
        label="ORGANISATION NAME"
        value={name}
        onChangeText={setName}
        placeholder="Riyadh Cricket Board"
        hint={slug ? `Web address: /${slug}` : undefined}
      />
      <Input label="CITY (OPTIONAL)" value={city} onChangeText={setCity} placeholder="Riyadh" />

      <Button title="Create organisation" onPress={create} loading={busy} disabled={slug.length < 3} />
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  spaced: { marginTop: 4 },
  title: { color: C.white, fontSize: 25, fontWeight: '900' },
  lead: { color: C.muted, lineHeight: 21, marginTop: 8, marginBottom: 24 },

  orgCard: { gap: 8, alignItems: 'flex-start' },
  orgLabel: { color: C.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  orgName: { color: C.white, fontWeight: '900', fontSize: 19 },

  notice: { marginTop: 12, backgroundColor: C.card2 },
  noticeText: { color: C.muted, fontSize: 12, lineHeight: 18 },

  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, borderColor: `${C.green}55` },
  liveTeams: { color: C.white, fontWeight: '900' },
  liveMeta: { color: C.muted, fontSize: 12, marginTop: 3 },

  leagueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  leagueName: { color: C.white, fontWeight: '800' },
  leagueMeta: { color: C.muted, fontSize: 12, marginTop: 3, textTransform: 'capitalize' },
});
