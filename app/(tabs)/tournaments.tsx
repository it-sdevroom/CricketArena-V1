import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, EmptyState, ErrorNotice, Loading, Pill, Screen } from '@/components/UI';
import { C } from '@/constants/theme';
import { tournaments } from '@/src/data/repo';
import type { TournamentRow } from '@/src/data/types';
import { useAuth } from '@/src/store/auth';
import { describeError } from '@/src/lib/supabase';

const FORMAT_LABEL: Record<string, string> = {
  round_robin: 'Round robin',
  double_round_robin: 'Double round robin',
  groups: 'Group stage',
  knockout: 'Knockout',
  league_playoffs: 'League + play-offs',
  custom: 'Custom',
};

const STATUS_TONE: Record<string, 'green' | 'amber' | 'muted' | 'blue'> = {
  active: 'green',
  registration: 'amber',
  draft: 'muted',
  completed: 'blue',
  archived: 'muted',
};

export default function Tournaments() {
  const { can } = useAuth();
  const query = useQuery({ queryKey: ['tournaments'], queryFn: () => tournaments.list() });

  return (
    <Screen safeTop refreshing={query.isFetching} onRefresh={() => void query.refetch()}>
      <View style={s.head}>
        <Text style={s.title}>Tournaments</Text>
        {can.manageTournaments ? (
          <Pressable
            onPress={() => router.push('/organizer/new-tournament')}
            style={s.addButton}
            hitSlop={6}
            accessibilityLabel="Create a tournament"
          >
            <Ionicons name="add" size={22} color="#052117" />
          </Pressable>
        ) : null}
      </View>

      {query.error ? (
        <ErrorNotice message={describeError(query.error)} onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <Loading />
      ) : query.data?.length ? (
        query.data.map((tournament) => <TournamentCard key={tournament.id} tournament={tournament} />)
      ) : (
        <EmptyState
          icon="trophy-outline"
          title="No tournaments yet"
          message={
            can.manageTournaments
              ? 'Create your first competition, register the teams, then generate the fixture list in one tap.'
              : 'Once an organiser publishes a competition it will show up here.'
          }
          actionLabel={can.manageTournaments ? 'Create a tournament' : undefined}
          onAction={can.manageTournaments ? () => router.push('/organizer/new-tournament') : undefined}
        />
      )}
    </Screen>
  );
}

function TournamentCard({ tournament }: { tournament: TournamentRow }) {
  const dates =
    tournament.start_date && tournament.end_date
      ? `${new Date(tournament.start_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${new Date(
          tournament.end_date,
        ).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
      : 'Dates to be confirmed';

  return (
    <Pressable
      onPress={() => router.push(`/tournament/${tournament.id}`)}
      style={({ pressed }) => pressed && s.pressed}
    >
      <Card style={s.card}>
        <View style={s.cardHead}>
          <Text style={s.season}>{tournament.season ?? tournament.match_format}</Text>
          <Pill
            text={tournament.status.replace('_', ' ').toUpperCase()}
            tone={STATUS_TONE[tournament.status] ?? 'muted'}
          />
        </View>

        <Text style={s.name}>{tournament.name}</Text>
        {tournament.description ? (
          <Text style={s.description} numberOfLines={2}>
            {tournament.description}
          </Text>
        ) : null}

        <View style={s.meta}>
          <View style={s.metaItem}>
            <Ionicons name="git-branch-outline" size={13} color={C.muted} />
            <Text style={s.metaText}>{FORMAT_LABEL[tournament.format] ?? tournament.format}</Text>
          </View>
          <View style={s.metaItem}>
            <Ionicons name="timer-outline" size={13} color={C.muted} />
            <Text style={s.metaText}>
              {tournament.overs_per_innings ? `${tournament.overs_per_innings} overs` : 'Unlimited'}
            </Text>
          </View>
          <View style={s.metaItem}>
            <Ionicons name="calendar-outline" size={13} color={C.muted} />
            <Text style={s.metaText}>{dates}</Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 34, marginBottom: 18 },
  title: { color: C.white, fontSize: 26, fontWeight: '900' },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { marginBottom: 12, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  season: { color: C.green, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  name: { color: C.white, fontWeight: '900', fontSize: 19 },
  description: { color: C.muted, lineHeight: 19, fontSize: 13 },
  meta: { gap: 7, marginTop: 6 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  metaText: { color: C.muted, fontSize: 12 },
  pressed: { opacity: 0.8 },
});
