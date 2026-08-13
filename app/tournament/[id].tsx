import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { FollowButton } from '@/components/FollowButton';
import { MatchCard } from '@/components/MatchCard';
import {
  Button,
  Card,
  EmptyState,
  ErrorNotice,
  ListRow,
  Loading,
  Pill,
  Screen,
  Section,
  Segmented,
} from '@/components/UI';
import { C } from '@/constants/theme';
import { matches, stats, tournaments } from '@/src/data/repo';
import { formatOvers } from '@/src/domain/scoring';
import { useAuth } from '@/src/store/auth';
import { describeError } from '@/src/lib/supabase';

type Tab = 'table' | 'fixtures' | 'teams' | 'stats';

export default function TournamentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('table');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tournament = useQuery({
    queryKey: ['tournament', id],
    queryFn: () => tournaments.get(id as string),
    enabled: !!id,
  });

  const table = useQuery({
    queryKey: ['standings', id],
    queryFn: () => tournaments.standings(id as string),
    enabled: !!id,
  });

  const fixtures = useQuery({
    queryKey: ['tournament-matches', id],
    queryFn: () => matches.summaries({ tournamentId: id as string, limit: 100 }),
    enabled: !!id,
  });

  const entrants = useQuery({
    queryKey: ['tournament-teams', id],
    queryFn: () => tournaments.entrants(id as string),
    enabled: !!id,
  });

  if (tournament.isLoading) return <Loading />;
  if (!tournament.data) {
    return (
      <Screen>
        <ErrorNotice message="Tournament not found." onRetry={() => void tournament.refetch()} />
      </Screen>
    );
  }

  const t = tournament.data;
  const hasFixtures = (fixtures.data?.length ?? 0) > 0;

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const count = await tournaments.generateSchedule(t);
      await queryClient.invalidateQueries({ queryKey: ['tournament-matches', id] });
      Alert.alert('Fixtures generated', `${count} matches were created.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const clearFixtures = () => {
    Alert.alert('Delete all fixtures?', 'Scores already recorded will be deleted with them.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await tournaments.deleteSchedule(t.id);
            await queryClient.invalidateQueries({ queryKey: ['tournament-matches', id] });
          } catch (e) {
            setError(describeError(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <Screen refreshing={fixtures.isFetching} onRefresh={() => void fixtures.refetch()}>
      <Card style={s.header}>
        <View style={s.headerTop}>
          <Text style={s.season}>{t.season ?? t.match_format}</Text>
          <Pill text={t.status.toUpperCase()} tone={t.status === 'active' ? 'green' : 'muted'} />
        </View>
        <Text style={s.name}>{t.name}</Text>
        {t.description ? <Text style={s.description}>{t.description}</Text> : null}
        <View style={s.chips}>
          <Pill text={`${t.overs_per_innings ?? '∞'} overs`} tone="muted" />
          <Pill text={`${entrants.data?.length ?? 0} teams`} tone="muted" />
          <Pill text={`${fixtures.data?.length ?? 0} fixtures`} tone="muted" />
        </View>
        <View style={s.followRow}>
          <FollowButton target={{ tournamentId: t.id }} />
        </View>
      </Card>

      {error ? <ErrorNotice message={error} /> : null}

      {can.manageTournaments ? (
        <View style={s.adminActions}>
          {!hasFixtures ? (
            <Button
              title="Generate fixture list"
              icon="git-branch-outline"
              onPress={generate}
              loading={busy}
              disabled={(entrants.data?.length ?? 0) < 2}
            />
          ) : (
            <Button title="Delete all fixtures" secondary icon="trash-outline" onPress={clearFixtures} loading={busy} />
          )}
          <Button
            title="Manage teams & players"
            secondary
            icon="people-outline"
            onPress={() => router.push('/organizer/squads')}
          />
          <Button
            title="Tournament chat"
            secondary
            icon="chatbubbles-outline"
            onPress={() => router.push(`/chat/${t.id}`)}
          />
        </View>
      ) : null}

      <View style={s.tabs}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'table', label: 'Table' },
            { value: 'fixtures', label: 'Fixtures' },
            { value: 'teams', label: 'Teams' },
            { value: 'stats', label: 'Stats' },
          ]}
        />
      </View>

      {tab === 'table' ? (
        table.isLoading ? (
          <Loading />
        ) : table.data?.length ? (
          <Card style={s.table}>
            <View style={s.tableHead}>
              <Text style={[s.headCell, s.teamCol]}>TEAM</Text>
              <Text style={s.headCell}>P</Text>
              <Text style={s.headCell}>W</Text>
              <Text style={s.headCell}>L</Text>
              <Text style={s.headCell}>PTS</Text>
              <Text style={s.headCellWide}>NRR</Text>
            </View>
            {table.data.map((row, index) => (
              <View key={row.team_id} style={s.tableRow}>
                <Text style={s.rank}>{index + 1}</Text>
                <View style={[s.dot, { backgroundColor: row.team_color }]} />
                <Text style={[s.teamName, s.teamCol]} numberOfLines={1}>
                  {row.team_name}
                </Text>
                <Text style={s.cell}>{row.played}</Text>
                <Text style={s.cell}>{row.won}</Text>
                <Text style={s.cell}>{row.lost}</Text>
                <Text style={s.points}>{row.points}</Text>
                <Text style={s.cellWide}>
                  {row.net_run_rate > 0 ? '+' : ''}
                  {Number(row.net_run_rate).toFixed(3)}
                </Text>
              </View>
            ))}
          </Card>
        ) : (
          <EmptyState
            icon="podium-outline"
            title="No results yet"
            message="The points table and net run rate build automatically as matches finish."
          />
        )
      ) : tab === 'fixtures' ? (
        fixtures.data?.length ? (
          fixtures.data.map((match) => <MatchCard key={match.match_id} match={match} />)
        ) : (
          <EmptyState
            icon="calendar-outline"
            title="No fixtures yet"
            message={
              can.manageTournaments
                ? 'Register at least two teams, then generate the fixture list.'
                : 'The organiser has not published the schedule yet.'
            }
          />
        )
      ) : tab === 'teams' ? (
        entrants.data?.length ? (
          <Card>
            {entrants.data.map((team) => (
              <ListRow
                key={team.id}
                title={team.name}
                subtitle={team.group_label ? `Group ${team.group_label}` : team.short_name}
                leadingColor={team.primary_color}
                onPress={() => router.push(`/team/${team.id}`)}
              />
            ))}
          </Card>
        ) : (
          <EmptyState
            icon="people-outline"
            title="No teams registered"
            message="Add teams to this competition from the organiser console."
            actionLabel={can.manageTournaments ? 'Manage teams' : undefined}
            onAction={can.manageTournaments ? () => router.push('/organizer/squads') : undefined}
          />
        )
      ) : (
        <TournamentStats tournamentId={t.id} />
      )}
    </Screen>
  );
}

function TournamentStats({ tournamentId }: { tournamentId: string }) {
  const batting = useQuery({
    queryKey: ['batting-leaders', tournamentId],
    queryFn: () => stats.battingLeaders({ tournamentId, limit: 5 }),
  });
  const bowling = useQuery({
    queryKey: ['bowling-leaders', tournamentId],
    queryFn: () => stats.bowlingLeaders({ tournamentId, limit: 5 }),
  });

  if (batting.isLoading || bowling.isLoading) return <Loading />;

  if (!batting.data?.length && !bowling.data?.length) {
    return <EmptyState icon="bar-chart-outline" title="No figures yet" message="Stats appear once matches are played." />;
  }

  return (
    <>
      <Section title="Most runs">
        <Card>
          {batting.data?.map((row, index) => (
            <ListRow
              key={row.player_id}
              rank={index + 1}
              title={row.full_name}
              subtitle={`${row.innings} inn • SR ${row.strike_rate.toFixed(0)} • HS ${row.high_score}`}
              right={String(row.runs)}
              onPress={() => router.push(`/player/${row.player_id}`)}
            />
          ))}
        </Card>
      </Section>

      <Section title="Most wickets">
        <Card>
          {bowling.data?.map((row, index) => (
            <ListRow
              key={row.player_id}
              rank={index + 1}
              title={row.full_name}
              subtitle={`${formatOvers(row.legal_balls)} ov • econ ${row.economy.toFixed(1)}`}
              right={String(row.wickets)}
              onPress={() => router.push(`/player/${row.player_id}`)}
            />
          ))}
        </Card>
      </Section>
    </>
  );
}

const s = StyleSheet.create({
  header: { gap: 8 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  season: { color: C.green, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  name: { color: C.white, fontWeight: '900', fontSize: 22 },
  description: { color: C.muted, lineHeight: 20, fontSize: 13 },
  chips: { flexDirection: 'row', gap: 7, flexWrap: 'wrap', marginTop: 6 },
  followRow: { flexDirection: 'row', marginTop: 6 },
  adminActions: { gap: 10, marginTop: 14 },
  tabs: { marginTop: 20, marginBottom: 18 },

  table: { paddingHorizontal: 12 },
  tableHead: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingBottom: 9 },
  headCell: { color: C.muted, fontSize: 10, fontWeight: '900', width: 24, textAlign: 'right' },
  headCellWide: { color: C.muted, fontSize: 10, fontWeight: '900', width: 50, textAlign: 'right' },
  teamCol: { flex: 1, textAlign: 'left' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  rank: { color: C.muted, width: 16, fontWeight: '800', fontSize: 11 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  teamName: { color: C.white, fontWeight: '800', fontSize: 13 },
  cell: { color: C.white, width: 24, textAlign: 'right', fontSize: 13 },
  cellWide: { color: C.muted, width: 50, textAlign: 'right', fontSize: 11 },
  points: { color: C.lime, width: 24, textAlign: 'right', fontWeight: '900', fontSize: 13 },
});
