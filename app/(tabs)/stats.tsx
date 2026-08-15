import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, ErrorNotice, ListRow, Loading, Screen, Segmented } from '@/components/UI';
import { C } from '@/constants/theme';
import { stats, tournaments } from '@/src/data/repo';
import { formatOvers } from '@/src/domain/scoring';
import { describeError } from '@/src/lib/supabase';

type Board = 'batting' | 'bowling';

export default function Stats() {
  const [board, setBoard] = useState<Board>('batting');
  const [tournamentId, setTournamentId] = useState<string | null>(null);

  const leagues = useQuery({ queryKey: ['tournaments'], queryFn: () => tournaments.list() });

  const batting = useQuery({
    queryKey: ['batting-leaders', tournamentId],
    queryFn: () => stats.battingLeaders({ tournamentId: tournamentId ?? undefined, limit: 30 }),
    enabled: board === 'batting',
  });

  const bowling = useQuery({
    queryKey: ['bowling-leaders', tournamentId],
    queryFn: () => stats.bowlingLeaders({ tournamentId: tournamentId ?? undefined, limit: 30 }),
    enabled: board === 'bowling',
  });

  const active = board === 'batting' ? batting : bowling;

  return (
    <Screen safeTop refreshing={active.isFetching} onRefresh={() => void active.refetch()}>
      <Text style={s.title}>Statistics</Text>

      <Segmented
        value={board}
        onChange={setBoard}
        options={[
          { value: 'batting', label: 'Most runs' },
          { value: 'bowling', label: 'Most wickets' },
        ]}
      />

      {leagues.data && leagues.data.length > 1 ? (
        <View style={s.filterRow}>
          <Segmented
            value={tournamentId ?? 'all'}
            onChange={(next) => setTournamentId(next === 'all' ? null : next)}
            options={[
              { value: 'all', label: 'All' },
              ...leagues.data.slice(0, 2).map((t) => ({ value: t.id, label: t.name.split(' ')[0] })),
            ]}
          />
        </View>
      ) : null}

      {active.error ? (
        <ErrorNotice message={describeError(active.error)} onRetry={() => void active.refetch()} />
      ) : active.isLoading ? (
        <Loading />
      ) : board === 'batting' ? (
        <BattingBoard rows={batting.data ?? []} />
      ) : (
        <BowlingBoard rows={bowling.data ?? []} />
      )}
    </Screen>
  );
}

function BattingBoard({ rows }: { rows: Awaited<ReturnType<typeof stats.battingLeaders>> }) {
  if (!rows.length) {
    return (
      <EmptyState
        icon="bar-chart-outline"
        title="No batting figures yet"
        message="Leaderboards build themselves from every ball scored, so they fill in as soon as a match is played."
      />
    );
  }

  return (
    <Card style={s.board}>
      <View style={s.headerRow}>
        <Text style={[s.headerCell, s.playerCol]}>PLAYER</Text>
        <Text style={s.headerCell}>RUNS</Text>
        <Text style={s.headerCell}>AVG</Text>
        <Text style={s.headerCell}>SR</Text>
      </View>
      {rows.map((row, index) => (
        <View key={`${row.player_id}-${row.tournament_id}`} style={s.dataRow}>
          <Text style={s.rank}>{index + 1}</Text>
          <View style={s.playerCol}>
            <Text style={s.player} numberOfLines={1} onPress={() => router.push(`/player/${row.player_id}`)}>
              {row.full_name}
            </Text>
            <Text style={s.sub}>
              {row.innings} inn • HS {row.high_score} • {row.fours}×4 {row.sixes}×6
            </Text>
          </View>
          <Text style={s.value}>{row.runs}</Text>
          <Text style={s.cell}>{row.average != null ? row.average.toFixed(1) : '—'}</Text>
          <Text style={s.cell}>{row.strike_rate.toFixed(0)}</Text>
        </View>
      ))}
    </Card>
  );
}

function BowlingBoard({ rows }: { rows: Awaited<ReturnType<typeof stats.bowlingLeaders>> }) {
  if (!rows.length) {
    return (
      <EmptyState
        icon="bar-chart-outline"
        title="No bowling figures yet"
        message="Wickets, economy and averages are derived from the ball-by-ball record."
      />
    );
  }

  return (
    <Card style={s.board}>
      <View style={s.headerRow}>
        <Text style={[s.headerCell, s.playerCol]}>PLAYER</Text>
        <Text style={s.headerCell}>WKTS</Text>
        <Text style={s.headerCell}>ECON</Text>
        <Text style={s.headerCell}>AVG</Text>
      </View>
      {rows.map((row, index) => (
        <View key={`${row.player_id}-${row.tournament_id}`} style={s.dataRow}>
          <Text style={s.rank}>{index + 1}</Text>
          <View style={s.playerCol}>
            <Text style={s.player} numberOfLines={1} onPress={() => router.push(`/player/${row.player_id}`)}>
              {row.full_name}
            </Text>
            <Text style={s.sub}>
              {formatOvers(row.legal_balls)} ov • best {row.best_wickets} • {row.maidens} mdn
            </Text>
          </View>
          <Text style={s.value}>{row.wickets}</Text>
          <Text style={s.cell}>{row.economy.toFixed(1)}</Text>
          <Text style={s.cell}>{row.average != null ? row.average.toFixed(1) : '—'}</Text>
        </View>
      ))}
    </Card>
  );
}

const s = StyleSheet.create({
  title: { color: C.white, fontSize: 26, fontWeight: '900', marginTop: 34, marginBottom: 18 },
  filterRow: { marginTop: 10 },
  board: { marginTop: 18, paddingHorizontal: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 10, gap: 6 },
  headerCell: { color: C.muted, fontSize: 10, fontWeight: '900', width: 46, textAlign: 'right', letterSpacing: 0.6 },
  playerCol: { flex: 1, textAlign: 'left' },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  rank: { color: C.muted, width: 20, fontWeight: '800', fontSize: 12 },
  player: { color: C.white, fontWeight: '800' },
  sub: { color: C.muted, fontSize: 11, marginTop: 3 },
  value: { color: C.lime, fontWeight: '900', width: 46, textAlign: 'right' },
  cell: { color: C.white, width: 46, textAlign: 'right', fontSize: 13 },
});
