import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MatchCard } from '@/components/MatchCard';
import {
  Button,
  Card,
  EmptyState,
  ErrorNotice,
  Loading,
  Pill,
  Screen,
  Section,
  StatTile,
} from '@/components/UI';
import { SkeletonList, SkeletonMatchCard } from '@/components/Skeleton';
import { C } from '@/constants/theme';
import { matches, tournaments } from '@/src/data/repo';
import { useAuth } from '@/src/store/auth';
import { describeError } from '@/src/lib/supabase';

export default function Home() {
  const { profile, activeOrg, can } = useAuth();

  const live = useQuery({ queryKey: ['home-live'], queryFn: () => matches.live(5) });
  const upcoming = useQuery({ queryKey: ['home-upcoming'], queryFn: () => matches.upcoming(3) });
  const recent = useQuery({ queryKey: ['home-recent'], queryFn: () => matches.recent(3) });
  const leagues = useQuery({ queryKey: ['home-tournaments'], queryFn: () => tournaments.listPublic() });

  const loading = live.isLoading || upcoming.isLoading || leagues.isLoading;
  const error = live.error ?? upcoming.error ?? leagues.error;

  const refresh = () => {
    void live.refetch();
    void upcoming.refetch();
    void recent.refetch();
    void leagues.refetch();
  };

  const activeLeague = leagues.data?.find((t) => t.status === 'active') ?? leagues.data?.[0];

  // Organisers get their tools first; everyone else gets the two things a fan
  // or a club cricketer actually opens the app for.
  const quickActions: { icon: keyof typeof Ionicons.glyphMap; label: string; href: string }[] = [
    ...(can.manageTournaments
      ? ([{ icon: 'add-circle', label: 'New tournament', href: '/organizer/new-tournament' }] as const)
      : []),
    ...(can.manageTournaments
      ? ([{ icon: 'checkmark-done', label: 'Registrations', href: '/organizer/approvals' }] as const)
      : []),
    ...(!can.manageTournaments
      ? ([{ icon: 'person-add', label: 'Play for a team', href: '/join-team' }] as const)
      : []),
    { icon: 'heart', label: 'Following', href: '/following' },
    { icon: 'calendar', label: 'Fixtures', href: '/(tabs)/matches' },
    { icon: 'stats-chart', label: 'Leaderboards', href: '/(tabs)/stats' },
  ];

  return (
    <Screen safeTop refreshing={live.isFetching} onRefresh={refresh}>
      <View style={s.top}>
        <View style={s.flex}>
          <Text style={s.eyebrow}>MATCHDAY CONTROL</Text>
          <Text style={s.name} numberOfLines={1}>
            {profile?.full_name ? `Hello, ${profile.full_name.split(' ')[0]}` : 'Cricket Arena'}
          </Text>
          {activeOrg ? (
            <Text style={s.org} numberOfLines={1}>
              {activeOrg.name}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={() => router.push('/notifications')} style={s.avatar} hitSlop={6}>
          <Ionicons name="notifications-outline" color={C.lime} size={21} />
        </Pressable>
      </View>

      {error ? <ErrorNotice message={describeError(error)} onRetry={refresh} /> : null}

      <View style={s.metrics}>
        <StatTile value={String(leagues.data?.length ?? 0)} label="Tournaments" />
        <StatTile value={String(live.data?.length ?? 0)} label="Live now" />
        <StatTile value={String(upcoming.data?.length ?? 0)} label="Upcoming" />
        <StatTile value={String(recent.data?.length ?? 0)} label="Recent results" />
      </View>

      <Section title="Live now" action={live.data?.length ? 'All matches' : undefined} onAction={() => router.push('/(tabs)/matches')}>
        {loading ? (
          <Loading />
        ) : live.data?.length ? (
          live.data.map((match) => <MatchCard key={match.match_id} match={match} />)
        ) : (
          <EmptyState
            icon="radio-outline"
            title="No match in progress"
            message="Live scores appear here the moment a scorer starts a match."
          />
        )}
      </Section>

      <Section title="Quick actions">
        <View style={s.grid}>
          {quickActions.map((action) => (
            <Pressable
              key={action.label}
              onPress={() => router.push(action.href as never)}
              style={({ pressed }) => [s.quickWrap, pressed && s.pressed]}
            >
              <Card style={s.quick}>
                <Ionicons name={action.icon} color={C.green} size={23} />
                <Text style={s.quickText}>{action.label}</Text>
              </Card>
            </Pressable>
          ))}
        </View>
      </Section>

      {activeLeague ? (
        <Section title="Points table" action="Full table" onAction={() => router.push(`/tournament/${activeLeague.id}`)}>
          <StandingsPreview tournamentId={activeLeague.id} />
        </Section>
      ) : null}

      <Section title="Next up" action="Fixtures" onAction={() => router.push('/(tabs)/matches')}>
        {upcoming.data?.length ? (
          upcoming.data.map((match) => <MatchCard key={match.match_id} match={match} />)
        ) : (
          <EmptyState
            icon="calendar-outline"
            title="No fixtures scheduled"
            message={
              can.manageTournaments
                ? 'Create a tournament, add your teams, then generate the fixture list.'
                : 'Fixtures appear here once the organiser publishes the schedule.'
            }
            actionLabel={can.manageTournaments ? 'Create a tournament' : undefined}
            onAction={can.manageTournaments ? () => router.push('/organizer/new-tournament') : undefined}
          />
        )}
      </Section>

      {recent.data?.length ? (
        <Section title="Recent results">
          {recent.data.map((match) => (
            <MatchCard key={match.match_id} match={match} />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

function StandingsPreview({ tournamentId }: { tournamentId: string }) {
  const table = useQuery({
    queryKey: ['standings', tournamentId],
    queryFn: () => tournaments.standings(tournamentId),
  });

  if (table.isLoading) return <Loading />;
  if (!table.data?.length) {
    return (
      <EmptyState
        icon="podium-outline"
        title="No results yet"
        message="The table fills in as matches are completed."
      />
    );
  }

  return (
    <Card>
      {table.data.slice(0, 4).map((row, index) => (
        <View key={row.team_id} style={[s.tableRow, index === 0 && s.tableRowFirst]}>
          <Text style={s.rank}>{index + 1}</Text>
          <View style={[s.dot, { backgroundColor: row.team_color }]} />
          <Text style={s.tname} numberOfLines={1}>
            {row.team_name}
          </Text>
          <Text style={s.record}>
            {row.won}-{row.lost}
          </Text>
          <Text style={s.points}>{row.points} pts</Text>
        </View>
      ))}
    </Card>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12 },
  eyebrow: { color: C.green, fontWeight: '900', fontSize: 11, letterSpacing: 1.5 },
  name: { color: C.white, fontWeight: '900', fontSize: 22, marginTop: 2 },
  org: { color: C.muted, fontSize: 12, marginTop: 3 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: C.card2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickWrap: { width: '48%' },
  quick: { alignItems: 'center', gap: 8, paddingVertical: 20 },
  quickText: { color: C.white, fontWeight: '800', fontSize: 13, textAlign: 'center' },
  pressed: { opacity: 0.8 },
  tableRow: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  tableRowFirst: { borderTopWidth: 0 },
  rank: { color: C.muted, width: 18, fontWeight: '800' },
  dot: { width: 9, height: 9, borderRadius: 5 },
  tname: { color: C.white, fontWeight: '800', flex: 1 },
  record: { color: C.muted, fontSize: 12 },
  points: { color: C.lime, fontWeight: '900', width: 58, textAlign: 'right' },
});
