import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { MatchCard } from '@/components/MatchCard';
import { FollowButton } from '@/components/FollowButton';
import { Button, Card, EmptyState, ListRow, Loading, Screen, Section } from '@/components/UI';
import { C } from '@/constants/theme';
import { follows } from '@/src/data/repo';
import { useAuth } from '@/src/store/auth';

/**
 * The fan page: everything the signed-in user follows, and the fixtures that
 * matter to them. A fan who follows nothing gets a nudge rather than an empty
 * screen.
 */
export default function Following() {
  const { user } = useAuth();

  const teams = useQuery({
    queryKey: ['following-teams', user?.id],
    queryFn: () => follows.teams(user!.id),
    enabled: !!user,
  });
  const tournaments = useQuery({
    queryKey: ['following-tournaments', user?.id],
    queryFn: () => follows.tournaments(user!.id),
    enabled: !!user,
  });
  const players = useQuery({
    queryKey: ['following-players', user?.id],
    queryFn: () => follows.players(user!.id),
    enabled: !!user,
  });
  const feed = useQuery({
    queryKey: ['following-feed', user?.id],
    queryFn: () => follows.feed(user!.id, 25),
    enabled: !!user,
  });

  if (!user) {
    return (
      <Screen>
        <EmptyState
          icon="heart-outline"
          title="Follow your teams"
          message="Sign in to follow teams, competitions and players. Their fixtures, live scores and results then land on this page."
          actionLabel="Sign in"
          onAction={() => router.push('/(auth)/sign-in')}
        />
      </Screen>
    );
  }

  const loading = teams.isLoading || feed.isLoading;
  const followsNothing =
    !teams.data?.length && !tournaments.data?.length && !players.data?.length;

  const refresh = () => {
    void teams.refetch();
    void tournaments.refetch();
    void players.refetch();
    void feed.refetch();
  };

  if (loading) return <Loading />;

  if (followsNothing) {
    return (
      <Screen>
        <EmptyState
          icon="heart-outline"
          title="You are not following anything yet"
          message="Open a team or a competition and tap Follow. Their matches will then show up here, and you can find them without searching."
          actionLabel="Browse tournaments"
          onAction={() => router.push('/(tabs)/tournaments')}
        />
        <Button
          title="Register as a player"
          secondary
          icon="person-add-outline"
          onPress={() => router.push('/join-team')}
          style={s.spaced}
        />
      </Screen>
    );
  }

  const live = feed.data?.filter((m) => ['live', 'toss', 'innings_break'].includes(m.status)) ?? [];
  const upcoming = feed.data?.filter((m) => m.status === 'scheduled') ?? [];
  const results = (feed.data?.filter((m) => m.status === 'completed') ?? [])
    .slice()
    .reverse()
    .slice(0, 5);

  return (
    <Screen refreshing={feed.isFetching} onRefresh={refresh}>
      {live.length ? (
        <Section title="Live now">
          {live.map((match) => (
            <MatchCard key={match.match_id} match={match} />
          ))}
        </Section>
      ) : null}

      {upcoming.length ? (
        <Section title="Next up">
          {upcoming.slice(0, 5).map((match) => (
            <MatchCard key={match.match_id} match={match} />
          ))}
        </Section>
      ) : null}

      {results.length ? (
        <Section title="Recent results">
          {results.map((match) => (
            <MatchCard key={match.match_id} match={match} />
          ))}
        </Section>
      ) : null}

      {!live.length && !upcoming.length && !results.length ? (
        <Card style={s.quiet}>
          <Ionicons name="calendar-outline" size={22} color={C.muted} />
          <Text style={s.quietText}>
            No fixtures yet for the teams you follow. They will appear as soon as the organiser
            publishes a schedule.
          </Text>
        </Card>
      ) : null}

      {teams.data?.length ? (
        <Section title={`Teams (${teams.data.length})`}>
          <Card>
            {teams.data.map((team) => (
              <View key={team.id} style={s.row}>
                <View style={s.flex}>
                  <ListRow
                    title={team.name}
                    subtitle={team.short_name}
                    leadingColor={team.primary_color}
                    onPress={() => router.push(`/team/${team.id}`)}
                  />
                </View>
                <FollowButton target={{ teamId: team.id }} compact />
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      {tournaments.data?.length ? (
        <Section title={`Competitions (${tournaments.data.length})`}>
          <Card>
            {tournaments.data.map((tournament) => (
              <View key={tournament.id} style={s.row}>
                <View style={s.flex}>
                  <ListRow
                    title={tournament.name}
                    subtitle={`${tournament.match_format} • ${tournament.status}`}
                    onPress={() => router.push(`/tournament/${tournament.id}`)}
                  />
                </View>
                <FollowButton target={{ tournamentId: tournament.id }} compact />
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      {players.data?.length ? (
        <Section title={`Players (${players.data.length})`}>
          <Card>
            {players.data.map((player) => (
              <View key={player.id} style={s.row}>
                <View style={s.flex}>
                  <ListRow
                    title={player.full_name}
                    subtitle={player.role.replace(/_/g, ' ')}
                    onPress={() => router.push(`/player/${player.id}`)}
                  />
                </View>
                <FollowButton target={{ playerId: player.id }} compact />
              </View>
            ))}
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  spaced: { marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  quiet: { alignItems: 'center', gap: 10, paddingVertical: 26 },
  quietText: { color: C.muted, textAlign: 'center', lineHeight: 20, fontSize: 13 },
});
