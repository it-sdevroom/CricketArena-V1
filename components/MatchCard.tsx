/**
 * The match card used on the home dashboard, the fixtures list and inside a
 * tournament. It adapts to the state of the game: a fixture shows the date, a
 * live game shows the score and the chase, a finished game shows the result.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Pill } from '@/components/UI';
import { C } from '@/constants/theme';
import type { MatchSummaryRow } from '@/src/data/types';
import { formatOvers } from '@/src/domain/scoring';

function scoreLine(runs: number | null, wickets: number | null, balls: number | null, ballsPerOver: number) {
  if (runs == null) return null;
  const overs = formatOvers(balls ?? 0, ballsPerOver);
  return `${runs}/${wickets ?? 0} (${overs})`;
}

export function matchDateLabel(iso: string | null): string {
  if (!iso) return 'Date to be confirmed';
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today, ${time}`;
  return `${date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}

export function MatchCard({ match }: { match: MatchSummaryRow }) {
  const live = match.status === 'live' || match.status === 'innings_break' || match.status === 'toss';
  const done = match.status === 'completed' || match.status === 'walkover';
  const bpo = match.balls_per_over || 6;

  const first = scoreLine(
    match.first_innings_runs,
    match.first_innings_wickets,
    match.first_innings_balls,
    bpo,
  );
  const second = scoreLine(
    match.second_innings_runs,
    match.second_innings_wickets,
    match.second_innings_balls,
    bpo,
  );

  // Which side batted first decides which score sits on which row.
  const homeBattedFirst = match.first_innings_team_id === match.home_team_id;
  const homeScore = homeBattedFirst ? first : second;
  const awayScore = homeBattedFirst ? second : first;

  const winnerIsHome = match.winner_team_id === match.home_team_id;
  const winnerIsAway = match.winner_team_id === match.away_team_id;

  return (
    <Pressable
      onPress={() => router.push(`/match/${match.match_id}`)}
      style={({ pressed }) => pressed && s.pressed}
    >
      <Card style={s.card}>
        <View style={s.head}>
          <Text style={s.stage} numberOfLines={1}>
            {match.label ?? 'Match'}
            {match.venue_name ? ` • ${match.venue_name}` : ''}
          </Text>
          {live ? (
            <Pill text="● LIVE" tone="red" />
          ) : done ? (
            <Pill text="RESULT" tone="muted" />
          ) : (
            <Text style={s.overs}>{match.overs_per_innings ?? '—'} ov</Text>
          )}
        </View>

        <View style={s.side}>
          <View style={[s.dot, { backgroundColor: match.home_team_color ?? C.green }]} />
          <Text style={[s.team, winnerIsAway && s.dim]} numberOfLines={1}>
            {match.home_team_name ?? 'To be decided'}
          </Text>
          <Text style={[s.score, winnerIsHome && s.winner]}>{homeScore ?? ''}</Text>
        </View>

        <View style={s.side}>
          <View style={[s.dot, { backgroundColor: match.away_team_color ?? C.blue }]} />
          <Text style={[s.team, winnerIsHome && s.dim]} numberOfLines={1}>
            {match.away_team_name ?? 'To be decided'}
          </Text>
          <Text style={[s.score, winnerIsAway && s.winner]}>{awayScore ?? ''}</Text>
        </View>

        <View style={s.foot}>
          <Ionicons
            name={live ? 'radio-outline' : done ? 'checkmark-circle-outline' : 'calendar-outline'}
            size={14}
            color={live ? C.red : C.muted}
          />
          <Text style={[s.footText, live && s.liveText]} numberOfLines={1}>
            {done
              ? match.result_summary ?? 'Result pending'
              : live
                ? chaseText(match)
                : matchDateLabel(match.scheduled_at)}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

function chaseText(match: MatchSummaryRow): string {
  if (match.status === 'toss') return 'Toss in progress';
  if (match.status === 'innings_break') return 'Innings break';
  if (match.chase_target != null && match.second_innings_runs != null) {
    const needed = match.chase_target - match.second_innings_runs;
    const ballsLeft =
      match.overs_per_innings != null
        ? match.overs_per_innings * (match.balls_per_over || 6) - (match.second_innings_balls ?? 0)
        : null;
    if (needed <= 0) return 'Target reached';
    return ballsLeft != null
      ? `Needs ${needed} off ${ballsLeft} balls`
      : `Needs ${needed} runs`;
  }
  return 'In progress';
}

const s = StyleSheet.create({
  card: { marginBottom: 10, gap: 10 },
  pressed: { opacity: 0.8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  stage: { color: C.green, fontWeight: '900', fontSize: 11, letterSpacing: 0.6, flex: 1 },
  overs: { color: C.muted, fontSize: 12 },
  side: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  team: { color: C.white, fontWeight: '800', flex: 1 },
  dim: { color: C.muted },
  score: { color: C.white, fontWeight: '900', fontVariant: ['tabular-nums'] },
  winner: { color: C.lime },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 10,
  },
  footText: { color: C.muted, fontSize: 12, flex: 1 },
  liveText: { color: C.amber, fontWeight: '700' },
});
