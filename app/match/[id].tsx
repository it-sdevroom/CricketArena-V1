import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { matchDateLabel } from '@/components/MatchCard';
import {
  BallChip,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorNotice,
  Loading,
  Pill,
  Screen,
  Section,
  Segmented,
} from '@/components/UI';
import { Commentary } from '@/components/Commentary';
import { shareScorecard } from '@/src/lib/scorecard-pdf';
import { C } from '@/constants/theme';
import { deliveryLabel, dismissalText } from '@/src/data/mappers';
import { matches } from '@/src/data/repo';
import { chaseSummary, currentRunRate, formatOvers, requiredRunRate } from '@/src/domain/scoring';
import type { InningsState } from '@/src/domain/types';
import { useAuth } from '@/src/store/auth';
import { useLiveMatch, useNameLookup } from '@/src/store/useMatch';
import { describeError } from '@/src/lib/supabase';
import { XiPicker } from '@/components/XiPicker';

type Tab = 'live' | 'scorecard' | 'info';

export default function MatchCentre() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can, user } = useAuth();
  const [tab, setTab] = useState<Tab>('live');
  const live = useLiveMatch(id);
  const nameOf = useNameLookup(live.squads);

  const summary = useQuery({
    queryKey: ['match-summary', id],
    queryFn: () => matches.summary(id as string),
    enabled: !!id,
  });

  const teamName = (teamId: string | null | undefined) => {
    if (!teamId) return 'TBC';
    const s = summary.data;
    if (s?.home_team_id === teamId) return s.home_team_name ?? 'Home';
    if (s?.away_team_id === teamId) return s.away_team_name ?? 'Away';
    return 'Team';
  };

  const xiSet = useMemo(() => {
    const byTeam = new Set(live.squads.map((x) => x.team_id));
    return byTeam.size >= 2;
  }, [live.squads]);

  if (live.loading) return <Loading label="Loading match…" />;
  if (live.error || !live.match) {
    return (
      <Screen>
        <ErrorNotice message={describeError(live.error) || 'Match not found.'} onRetry={live.refetch} />
      </Screen>
    );
  }

  const match = live.match;
  const rules = live.rules!;
  const isLive = match.status === 'live' || match.status === 'innings_break';
  const canScore = can.score || can.manageTournaments;

  return (
    <Screen refreshing={live.loading} onRefresh={live.refetch}>
      {/* ------------------------------------------------------------ header */}
      <Card style={s.header}>
        <View style={s.headerTop}>
          <Text style={s.stage} numberOfLines={1}>
            {match.label ?? 'Match'}
          </Text>
          {isLive ? (
            <Pill text="● LIVE" tone="red" />
          ) : match.status === 'completed' ? (
            <Pill text="COMPLETED" tone="muted" />
          ) : (
            <Pill text={match.status.replace('_', ' ').toUpperCase()} tone="amber" />
          )}
        </View>

        {live.states.length ? (
          live.states.map((state, index) => (
            <View key={index} style={s.inningsRow}>
              <Text style={s.inningsTeam} numberOfLines={1}>
                {teamName(state.battingTeamId)}
              </Text>
              <Text style={s.inningsScore}>
                {state.runs}/{state.wickets}
              </Text>
              <Text style={s.inningsOvers}>
                ({formatOvers(state.legalBalls, rules.ballsPerOver)})
              </Text>
            </View>
          ))
        ) : (
          <>
            <Text style={s.fixture}>
              {summary.data?.home_team_name ?? 'TBC'} <Text style={s.dim}>vs</Text>{' '}
              {summary.data?.away_team_name ?? 'TBC'}
            </Text>
            <Text style={s.muted}>{matchDateLabel(match.scheduled_at)}</Text>
          </>
        )}

        <Text style={s.resultLine}>
          {match.result_summary ??
            (live.currentState?.target != null
              ? chaseSummary(live.currentState, rules, match.overs_per_innings)
              : summary.data?.venue_name ?? '')}
        </Text>

        {live.pendingCount > 0 ? (
          <View style={s.pendingRow}>
            <Ionicons name="cloud-upload-outline" size={13} color={C.amber} />
            <Text style={s.pendingText}>{live.pendingCount} ball(s) waiting to sync from this device</Text>
          </View>
        ) : null}
      </Card>

      <View style={s.actions}>
        {canScore ? (
          !xiSet ? (
            <XiPicker match={match} onDone={live.refetch} />
          ) : (
            <Button
              title={isLive ? 'Continue scoring' : 'Open scoring console'}
              icon="baseball-outline"
              onPress={() => router.push(`/scorer/${match.id}`)}
            />
          )
        ) : null}

        <Button
          title="Highlights & photos"
          icon="videocam-outline"
          secondary
          onPress={() => router.push(`/highlights/${match.id}`)}
        />

        {canScore && match.status === 'completed' ? (
          <Button
            title="Type up the scorecard"
            icon="create-outline"
            secondary
            onPress={() => router.push(`/organizer/enter-card/${match.id}`)}
          />
        ) : null}

        <Button
          title={canScore ? 'Corrections' : 'Score changes'}
          icon="shield-checkmark-outline"
          secondary
          onPress={() => router.push(`/corrections/${match.id}`)}
        />

        {live.states.length ? (
          <Button
            title="Share scorecard (PDF)"
            icon="document-text-outline"
            secondary
            onPress={() =>
              void shareScorecard({
                matchLabel: `${teamName(match.home_team_id)} v ${teamName(match.away_team_id)}`,
                tournamentName: summary.data?.tournament_id ? match.label : null,
                venueName: summary.data?.venue_name,
                playedOn: match.scheduled_at ? matchDateLabel(match.scheduled_at) : null,
                resultSummary: match.result_summary,
                rules,
                innings: live.states,
                teamName: (id) => teamName(id),
                playerName: (id) => nameOf(id),
              }).catch(() => {})
            }
          />
        ) : null}
      </View>

      <View style={s.tabs}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'live', label: 'Live' },
            { value: 'scorecard', label: 'Scorecard' },
            { value: 'info', label: 'Info' },
          ]}
        />
      </View>

      {tab === 'live' ? (
        <LiveTab live={live} nameOf={nameOf} teamName={teamName} />
      ) : tab === 'scorecard' ? (
        <ScorecardTab live={live} nameOf={nameOf} teamName={teamName} />
      ) : (
        <InfoTab match={match} summary={summary.data} />
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------------------

function LiveTab({
  live,
  nameOf,
  teamName,
}: {
  live: ReturnType<typeof useLiveMatch>;
  nameOf: (id: string | null) => string;
  teamName: (id: string | null | undefined) => string;
}) {
  const state = live.currentState;
  const rules = live.rules!;
  const match = live.match!;

  if (!state) {
    return (
      <EmptyState
        icon="time-outline"
        title="Not started"
        message="Live scores, the current partnership and the ball-by-ball feed appear here once the first ball is bowled."
      />
    );
  }

  const maxOvers = live.currentInnings?.reduced_overs ?? match.overs_per_innings;
  const rrr = requiredRunRate(state, rules, maxOvers);
  const atCrease = state.batting.filter(
    (b) => b.playerId === state.strikerId || b.playerId === state.nonStrikerId,
  );
  const currentBowlers = state.bowling
    .filter((b) => b.legalBalls > 0)
    .sort((a, z) => z.legalBalls - a.legalBalls)
    .slice(0, 2);

  return (
    <>
      <Section title="Match situation">
        <Card style={s.situation}>
          <View style={s.situationRow}>
            <Text style={s.situationLabel}>Run rate</Text>
            <Text style={s.situationValue}>{currentRunRate(state, rules).toFixed(2)}</Text>
          </View>
          {rrr != null ? (
            <View style={s.situationRow}>
              <Text style={s.situationLabel}>Required rate</Text>
              <Text style={s.situationValue}>{rrr.toFixed(2)}</Text>
            </View>
          ) : null}
          <View style={s.situationRow}>
            <Text style={s.situationLabel}>Extras</Text>
            <Text style={s.situationValue}>
              {state.extras.total} (w {state.extras.wides}, nb {state.extras.noBalls}, b{' '}
              {state.extras.byes}, lb {state.extras.legByes})
            </Text>
          </View>
          {state.partnerships.length ? (
            <View style={s.situationRow}>
              <Text style={s.situationLabel}>Partnership</Text>
              <Text style={s.situationValue}>
                {state.partnerships[state.partnerships.length - 1].runs} (
                {state.partnerships[state.partnerships.length - 1].balls})
              </Text>
            </View>
          ) : null}
        </Card>
      </Section>

      {atCrease.length ? (
        <Section title="At the crease">
          <Card>
            {atCrease.map((b, i) => (
              <View key={b.playerId} style={[s.creaseRow, i > 0 && s.creaseRowBorder]}>
                <Text style={s.creaseName} numberOfLines={1}>
                  {nameOf(b.playerId)}
                  {b.playerId === state.strikerId ? ' *' : ''}
                </Text>
                <Text style={s.creaseRuns}>
                  {b.runs} ({b.balls})
                </Text>
                <Text style={s.creaseMeta}>
                  {b.fours}×4 {b.sixes}×6
                </Text>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      {currentBowlers.length ? (
        <Section title="Bowling">
          <Card>
            {currentBowlers.map((b, i) => (
              <View key={b.playerId} style={[s.creaseRow, i > 0 && s.creaseRowBorder]}>
                <Text style={s.creaseName} numberOfLines={1}>
                  {nameOf(b.playerId)}
                </Text>
                <Text style={s.creaseRuns}>
                  {b.wickets}/{b.runsConceded}
                </Text>
                <Text style={s.creaseMeta}>{formatOvers(b.legalBalls, rules.ballsPerOver)} ov</Text>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      <Section title="This over">
        <Card style={s.overCard}>
          {state.overs.slice(-2).reverse().map((over) => (
            <View key={over.overNumber} style={s.overRow}>
              <Text style={s.overNumber}>Ov {over.overNumber + 1}</Text>
              <View style={s.overBalls}>
                {over.deliveries.map((d, i) => (
                  <BallChip
                    key={d.id || i}
                    label={deliveryLabel(d)}
                    tone={d.wicket ? 'red' : d.runsOffBat >= 4 ? 'lime' : undefined}
                  />
                ))}
              </View>
              <Text style={s.overRuns}>{over.runs}</Text>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Commentary">
        <Card>
          <Commentary
            deliveries={state.overs.flatMap((o) => o.deliveries)}
            rules={rules}
            nameOf={(id) => nameOf(id)}
          />
        </Card>
      </Section>
    </>
  );
}

function ScorecardTab({
  live,
  nameOf,
  teamName,
}: {
  live: ReturnType<typeof useLiveMatch>;
  nameOf: (id: string | null) => string;
  teamName: (id: string | null | undefined) => string;
}) {
  const rules = live.rules!;

  if (!live.states.length) {
    return <EmptyState icon="document-text-outline" title="No scorecard yet" message="It builds as the match is scored." />;
  }

  return (
    <>
      {live.states.map((state, index) => (
        <View key={index} style={s.card}>
          <Section title={`${teamName(state.battingTeamId)} — ${state.runs}/${state.wickets}`}>
            <Card style={s.scorecard}>
              <View style={s.cardHeaderRow}>
                <Text style={[s.cardHeaderCell, s.nameCol]}>BATTER</Text>
                <Text style={s.cardHeaderCell}>R</Text>
                <Text style={s.cardHeaderCell}>B</Text>
                <Text style={s.cardHeaderCell}>4s</Text>
                <Text style={s.cardHeaderCell}>6s</Text>
                <Text style={s.cardHeaderCellWide}>SR</Text>
              </View>
              {state.batting.map((b) => (
                <View key={b.playerId} style={s.cardRow}>
                  <View style={s.nameCol}>
                    <Text style={s.batterName} numberOfLines={1}>
                      {nameOf(b.playerId)}
                    </Text>
                    <Text style={s.dismissal} numberOfLines={1}>
                      {b.wicket
                        ? dismissalText(b.wicket.kind, undefined, nameOf(b.wicket.fielderId ?? null))
                        : 'not out'}
                    </Text>
                  </View>
                  <Text style={s.cardCell}>{b.runs}</Text>
                  <Text style={s.cardCell}>{b.balls}</Text>
                  <Text style={s.cardCell}>{b.fours}</Text>
                  <Text style={s.cardCell}>{b.sixes}</Text>
                  <Text style={s.cardCellWide}>
                    {b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(1) : '—'}
                  </Text>
                </View>
              ))}

              <Divider />
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Extras</Text>
                <Text style={s.totalValue}>
                  {state.extras.total} (w {state.extras.wides}, nb {state.extras.noBalls}, b{' '}
                  {state.extras.byes}, lb {state.extras.legByes}, p {state.extras.penalties})
                </Text>
              </View>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Total</Text>
                <Text style={s.totalValueStrong}>
                  {state.runs}/{state.wickets} ({formatOvers(state.legalBalls, rules.ballsPerOver)} ov)
                </Text>
              </View>
            </Card>

            <Card style={s.scorecard}>
              <View style={s.cardHeaderRow}>
                <Text style={[s.cardHeaderCell, s.nameCol]}>BOWLER</Text>
                <Text style={s.cardHeaderCellWide}>O</Text>
                <Text style={s.cardHeaderCell}>M</Text>
                <Text style={s.cardHeaderCell}>R</Text>
                <Text style={s.cardHeaderCell}>W</Text>
                <Text style={s.cardHeaderCellWide}>ECON</Text>
              </View>
              {state.bowling.map((b) => (
                <View key={b.playerId} style={s.cardRow}>
                  <Text style={[s.batterName, s.nameCol]} numberOfLines={1}>
                    {nameOf(b.playerId)}
                  </Text>
                  <Text style={s.cardCellWide}>{formatOvers(b.legalBalls, rules.ballsPerOver)}</Text>
                  <Text style={s.cardCell}>{b.maidens}</Text>
                  <Text style={s.cardCell}>{b.runsConceded}</Text>
                  <Text style={s.cardCell}>{b.wickets}</Text>
                  <Text style={s.cardCellWide}>
                    {b.legalBalls > 0
                      ? (b.runsConceded / (b.legalBalls / rules.ballsPerOver)).toFixed(2)
                      : '—'}
                  </Text>
                </View>
              ))}
            </Card>

            {state.batting.some((b) => b.fellAt) ? (
              <Card style={s.fow}>
                <Text style={s.fowTitle}>Fall of wickets</Text>
                <Text style={s.fowText}>
                  {state.batting
                    .filter((b) => b.fellAt)
                    .sort((a, z) => (a.fellAt!.wickets ?? 0) - (z.fellAt!.wickets ?? 0))
                    .map((b) => `${b.fellAt!.runs}-${b.fellAt!.wickets} (${nameOf(b.playerId)}, ${b.fellAt!.over})`)
                    .join(' • ')}
                </Text>
              </Card>
            ) : null}
          </Section>
        </View>
      ))}
    </>
  );
}

function InfoTab({ match, summary }: { match: any; summary: any }) {
  const rows: [string, string][] = [
    ['Format', `${match.overs_per_innings ?? 'Unlimited'} overs a side`],
    ['Players a side', String(match.players_per_side)],
    ['Max overs per bowler', match.max_overs_per_bowler ? String(match.max_overs_per_bowler) : 'No limit'],
    ['Free hit after a no ball', match.free_hit_after_no_ball ? 'Yes' : 'No'],
    ['Venue', summary?.venue_name ?? 'To be confirmed'],
    ['Scheduled', matchDateLabel(match.scheduled_at)],
    [
      'Toss',
      match.toss_winner_team_id
        ? `${match.toss_winner_team_id === summary?.home_team_id ? summary?.home_team_name : summary?.away_team_name} chose to ${match.toss_decision}`
        : 'Not recorded',
    ],
  ];

  return (
    <Section title="Match details">
      <Card>
        {rows.map(([label, value], i) => (
          <View key={label} style={[s.infoRow, i > 0 && s.creaseRowBorder]}>
            <Text style={s.infoLabel}>{label}</Text>
            <Text style={s.infoValue} numberOfLines={2}>
              {value}
            </Text>
          </View>
        ))}
      </Card>
    </Section>
  );
}

const s = StyleSheet.create({
  muted: { color: C.muted },
  dim: { color: C.muted },
  card: { marginBottom: 4 },

  header: { gap: 8 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  stage: { color: C.green, fontWeight: '900', fontSize: 11, letterSpacing: 0.7, flex: 1 },
  inningsRow: { flexDirection: 'row', alignItems: 'baseline', gap: 9 },
  inningsTeam: { color: C.white, fontWeight: '800', flex: 1 },
  inningsScore: { color: C.white, fontWeight: '900', fontSize: 19 },
  inningsOvers: { color: C.muted, fontSize: 12 },
  fixture: { color: C.white, fontWeight: '900', fontSize: 19, marginTop: 4 },
  resultLine: { color: C.amber, fontWeight: '700', fontSize: 13, marginTop: 4 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  pendingText: { color: C.amber, fontSize: 11 },

  actions: { marginTop: 14 },
  tabs: { marginTop: 20 },

  situation: { gap: 10 },
  situationRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  situationLabel: { color: C.muted, fontSize: 13 },
  situationValue: { color: C.white, fontWeight: '800', fontSize: 13, flexShrink: 1, textAlign: 'right' },

  creaseRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 10 },
  creaseRowBorder: { borderTopWidth: 1, borderTopColor: C.line },
  creaseName: { color: C.white, fontWeight: '800', flex: 1 },
  creaseRuns: { color: C.lime, fontWeight: '900' },
  creaseMeta: { color: C.muted, fontSize: 12, width: 66, textAlign: 'right' },

  overCard: { gap: 14 },
  overRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  overNumber: { color: C.muted, fontSize: 11, fontWeight: '800', width: 44 },
  overBalls: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1 },
  overRuns: { color: C.white, fontWeight: '900' },

  commentaryRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11 },
  commentaryText: { color: C.muted, fontSize: 12, flex: 1, lineHeight: 17 },

  scorecard: { marginBottom: 10, paddingHorizontal: 12 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 9, gap: 4 },
  cardHeaderCell: { color: C.muted, fontSize: 10, fontWeight: '900', width: 28, textAlign: 'right' },
  cardHeaderCellWide: { color: C.muted, fontSize: 10, fontWeight: '900', width: 42, textAlign: 'right' },
  nameCol: { flex: 1, textAlign: 'left' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.line },
  batterName: { color: C.white, fontWeight: '700', fontSize: 13 },
  dismissal: { color: C.muted, fontSize: 11, marginTop: 3 },
  cardCell: { color: C.white, width: 28, textAlign: 'right', fontSize: 13 },
  cardCellWide: { color: C.white, width: 42, textAlign: 'right', fontSize: 13 },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
  totalLabel: { color: C.muted, fontWeight: '800', fontSize: 12 },
  totalValue: { color: C.white, fontSize: 12, flexShrink: 1, textAlign: 'right' },
  totalValueStrong: { color: C.lime, fontWeight: '900', fontSize: 14 },

  fow: { marginBottom: 10 },
  fowTitle: { color: C.muted, fontSize: 11, fontWeight: '900', letterSpacing: 0.6, marginBottom: 7 },
  fowText: { color: C.white, fontSize: 12, lineHeight: 19 },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 12 },
  infoLabel: { color: C.muted, fontSize: 13 },
  infoValue: { color: C.white, fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
});
