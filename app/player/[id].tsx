import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { FollowButton } from '@/components/FollowButton';
import { Card, EmptyState, ErrorNotice, Loading, Pill, Screen, Section, StatTile } from '@/components/UI';
import { C } from '@/constants/theme';
import { players, stats } from '@/src/data/repo';
import { formatOvers } from '@/src/domain/scoring';

export default function PlayerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const player = useQuery({ queryKey: ['player', id], queryFn: () => players.get(id as string), enabled: !!id });
  const batting = useQuery({
    queryKey: ['player-batting', id],
    queryFn: () => stats.playerBatting(id as string),
    enabled: !!id,
  });
  const bowling = useQuery({
    queryKey: ['player-bowling', id],
    queryFn: () => stats.playerBowling(id as string),
    enabled: !!id,
  });

  if (player.isLoading) return <Loading />;
  if (!player.data) {
    return (
      <Screen>
        <ErrorNotice message="Player not found." onRetry={() => void player.refetch()} />
      </Screen>
    );
  }

  const p = player.data;

  // A player's figures are stored per tournament, so a career total is the sum.
  const bat = (batting.data ?? []).reduce(
    (acc, row) => ({
      innings: acc.innings + row.innings,
      runs: acc.runs + row.runs,
      balls: acc.balls + row.balls,
      fours: acc.fours + row.fours,
      sixes: acc.sixes + row.sixes,
      notOuts: acc.notOuts + row.not_outs,
      fifties: acc.fifties + row.fifties,
      hundreds: acc.hundreds + row.hundreds,
      highScore: Math.max(acc.highScore, row.high_score),
    }),
    { innings: 0, runs: 0, balls: 0, fours: 0, sixes: 0, notOuts: 0, fifties: 0, hundreds: 0, highScore: 0 },
  );

  const bowl = (bowling.data ?? []).reduce(
    (acc, row) => ({
      innings: acc.innings + row.innings,
      balls: acc.balls + row.legal_balls,
      runs: acc.runs + row.runs_conceded,
      wickets: acc.wickets + row.wickets,
      maidens: acc.maidens + row.maidens,
      best: Math.max(acc.best, row.best_wickets),
    }),
    { innings: 0, balls: 0, runs: 0, wickets: 0, maidens: 0, best: 0 },
  );

  const dismissals = bat.innings - bat.notOuts;
  const average = dismissals > 0 ? (bat.runs / dismissals).toFixed(2) : '—';
  const strikeRate = bat.balls > 0 ? ((bat.runs / bat.balls) * 100).toFixed(1) : '—';
  const economy = bowl.balls > 0 ? (bowl.runs / (bowl.balls / 6)).toFixed(2) : '—';
  const bowlAverage = bowl.wickets > 0 ? (bowl.runs / bowl.wickets).toFixed(2) : '—';

  const hasPlayed = bat.innings > 0 || bowl.innings > 0;

  return (
    <Screen>
      <Card style={s.header}>
        <View style={s.avatar}>
          <Text style={s.initials}>{p.full_name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <Text style={s.name}>{p.display_name || p.full_name}</Text>
        <View style={s.chips}>
          <Pill text={p.role.replace(/_/g, ' ').toUpperCase()} tone="green" />
          <Pill text={p.batting_style === 'left_hand' ? 'LEFT HAND BAT' : 'RIGHT HAND BAT'} tone="muted" />
          {p.bowling_style !== 'none' ? (
            <Pill text={p.bowling_style.replace(/_/g, ' ').toUpperCase()} tone="blue" />
          ) : null}
        </View>
        <FollowButton target={{ playerId: p.id }} />
      </Card>

      {!hasPlayed ? (
        <EmptyState
          icon="stats-chart-outline"
          title="No figures yet"
          message="Career statistics build automatically from every ball this player faces or bowls."
        />
      ) : (
        <>
          {bat.innings > 0 ? (
            <Section title="Batting">
              <View style={s.tiles}>
                <StatTile value={String(bat.runs)} label="Runs" />
                <StatTile value={average} label="Average" />
                <StatTile value={strikeRate} label="Strike rate" />
                <StatTile value={String(bat.highScore)} label="High score" />
              </View>
              <Card style={s.detail}>
                <Row label="Innings" value={String(bat.innings)} />
                <Row label="Not outs" value={String(bat.notOuts)} />
                <Row label="Balls faced" value={String(bat.balls)} />
                <Row label="Fours / sixes" value={`${bat.fours} / ${bat.sixes}`} />
                <Row label="Fifties / hundreds" value={`${bat.fifties} / ${bat.hundreds}`} />
              </Card>
            </Section>
          ) : null}

          {bowl.innings > 0 ? (
            <Section title="Bowling">
              <View style={s.tiles}>
                <StatTile value={String(bowl.wickets)} label="Wickets" />
                <StatTile value={economy} label="Economy" />
                <StatTile value={bowlAverage} label="Average" />
                <StatTile value={`${bowl.best}`} label="Best (wkts)" />
              </View>
              <Card style={s.detail}>
                <Row label="Innings bowled" value={String(bowl.innings)} />
                <Row label="Overs" value={formatOvers(bowl.balls)} />
                <Row label="Runs conceded" value={String(bowl.runs)} />
                <Row label="Maidens" value={String(bowl.maidens)} />
              </Card>
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  header: { alignItems: 'center', gap: 12 },
  avatar: {
    width: 66,
    height: 66,
    borderRadius: 24,
    backgroundColor: C.card2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { color: C.lime, fontWeight: '900', fontSize: 25 },
  name: { color: C.white, fontWeight: '900', fontSize: 21, textAlign: 'center' },
  chips: { flexDirection: 'row', gap: 7, flexWrap: 'wrap', justifyContent: 'center' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  detail: { marginTop: 10, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { color: C.muted, fontSize: 13 },
  rowValue: { color: C.white, fontSize: 13, fontWeight: '800' },
});
