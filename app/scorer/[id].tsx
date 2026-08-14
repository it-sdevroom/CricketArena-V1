import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BallChip, Button, Card, ChipGroup, ErrorNotice, Loading, Pill, Screen } from '@/components/UI';
import { C } from '@/constants/theme';
import { DISMISSAL_OPTIONS, deliveryLabel } from '@/src/data/mappers';
import { newIdempotencyKey } from '@/src/data/queue';
import { matches, scoring, teams } from '@/src/data/repo';
import { chaseSummary, currentRunRate, formatOvers, requiredRunRate, validateDelivery } from '@/src/domain/scoring';
import type { Delivery, DismissalKind } from '@/src/domain/types';
import { useAuth } from '@/src/store/auth';
import { useLiveMatch, useNameLookup } from '@/src/store/useMatch';
import { describeError } from '@/src/lib/supabase';

type ExtraMode = 'none' | 'wide' | 'no_ball' | 'bye' | 'leg_bye';

export default function ScoringConsole() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const live = useLiveMatch(id);
  const nameOf = useNameLookup(live.squads);

  // Team names, for writing the result line ("Falcons won by 6 runs").
  const teamNames = useQuery({
    queryKey: ['match-teams', live.match?.home_team_id, live.match?.away_team_id],
    enabled: !!live.match?.home_team_id && !!live.match?.away_team_id,
    queryFn: async () => {
      const [home, away] = await Promise.all([
        teams.get(live.match!.home_team_id!),
        teams.get(live.match!.away_team_id!),
      ]);
      return { [home!.id]: home!.name, [away!.id]: away!.name } as Record<string, string>;
    },
  });
  const teamName = (teamId: string) => teamNames.data?.[teamId] ?? 'The winning side';

  const [extraMode, setExtraMode] = useState<ExtraMode>('none');
  const [wicketOpen, setWicketOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The crease is derived from the balls already bowled, but after a wicket or
  // at the start of an innings the scorer has to name who is in.
  const [strikerOverride, setStrikerOverride] = useState<string | null>(null);
  const [nonStrikerOverride, setNonStrikerOverride] = useState<string | null>(null);
  const [bowlerOverride, setBowlerOverride] = useState<string | null>(null);

  const state = live.currentState;
  const innings = live.currentInnings;
  const match = live.match;
  const rules = live.rules;

  const striker = strikerOverride ?? state?.strikerId ?? null;
  const nonStriker = nonStrikerOverride ?? state?.nonStrikerId ?? null;
  const newOver = (state?.ballsThisOver ?? 0) === 0;
  const bowler = bowlerOverride ?? (newOver ? null : state?.bowlerId ?? null);

  // Clear a manual pick once the derived state agrees, so the override cannot
  // shadow what actually happened on the next ball.
  useEffect(() => {
    if (state?.strikerId && strikerOverride && state.strikerId === strikerOverride) {
      setStrikerOverride(null);
    }
    if (state?.nonStrikerId && nonStrikerOverride && state.nonStrikerId === nonStrikerOverride) {
      setNonStrikerOverride(null);
    }
  }, [state?.strikerId, state?.nonStrikerId, strikerOverride, nonStrikerOverride]);

  useEffect(() => {
    if (!newOver) setBowlerOverride(null);
  }, [newOver]);

  const battingSquad = useMemo(
    () => live.squads.filter((x) => x.team_id === innings?.batting_team_id),
    [live.squads, innings?.batting_team_id],
  );
  const bowlingSquad = useMemo(
    () => live.squads.filter((x) => x.team_id === innings?.bowling_team_id),
    [live.squads, innings?.bowling_team_id],
  );

  const dismissed = useMemo(
    () => new Set((state?.batting ?? []).filter((b) => b.out).map((b) => b.playerId)),
    [state?.batting],
  );

  if (live.loading) return <Loading label="Loading match…" />;
  if (!match || !rules) {
    return (
      <Screen>
        <ErrorNotice message="This match could not be loaded." onRetry={live.refetch} />
      </Screen>
    );
  }

  // ------------------------------------------------------------------ innings
  if (!innings || !state) {
    return <StartInnings match={match} onStarted={live.refetch} />;
  }

  const maxOvers = innings.reduced_overs ?? match.overs_per_innings;
  const readyToScore = !!striker && !!nonStriker && !!bowler && !state.closed;

  // -------------------------------------------------------------- record ball
  const record = async (partial: Partial<Delivery>) => {
    if (!readyToScore || !striker || !nonStriker || !bowler) return;
    setError(null);

    const delivery: Delivery = {
      id: '',
      sequence: 0,
      strikerId: striker,
      nonStrikerId: nonStriker,
      bowlerId: bowler,
      runsOffBat: 0,
      freeHit: state.freeHit,
      idempotencyKey: newIdempotencyKey(),
      ...partial,
    };

    const issues = validateDelivery(delivery, state, rules);
    if (issues.length) {
      setError(issues.map((i) => i.message).join('\n'));
      return;
    }

    setBusy(true);
    try {
      await scoring.recordDelivery(delivery, innings.id, match);
      setExtraMode('none');
      setWicketOpen(false);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const runs = (n: number) => {
    switch (extraMode) {
      case 'wide':
        return record({ wide: n });
      case 'no_ball':
        return record({ noBall: true, runsOffBat: n });
      case 'bye':
        return record({ byes: n });
      case 'leg_bye':
        return record({ legByes: n });
      default:
        return record({ runsOffBat: n });
    }
  };

  const undo = () => {
    Alert.alert('Undo the last ball?', 'The delivery is removed and the correction is logged.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Undo',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await scoring.undoLastDelivery(innings.id, match.id, user?.id ?? '');
            await queryClient.invalidateQueries({ queryKey: ['match-deliveries', match.id] });
            live.refetch();
          } catch (e) {
            setError(describeError(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  /**
   * Close this innings and move the match on.
   *
   * The branching is all cricket, not plumbing: the first innings sets a
   * target, the second decides the match unless the scores are level, and a
   * level score starts a super over — which can itself tie, and then needs
   * another one.
   */
  const endInnings = () => {
    const isSuperOver = !!innings.is_super_over;
    const isFirstOfPair = isSuperOver
      ? innings.innings_number % 2 === 1
      : innings.innings_number === 1;

    Alert.alert('End this innings?', 'You can still correct deliveries afterwards.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End innings',
        onPress: async () => {
          setBusy(true);
          try {
            await scoring.closeInnings(innings.id, state.endReason ?? 'declared');

            if (isFirstOfPair) {
              // Set the chase.
              await scoring.startInnings({
                matchId: match.id,
                inningsNumber: innings.innings_number + 1,
                battingTeamId: innings.bowling_team_id,
                bowlingTeamId: innings.batting_team_id,
                target: state.runs + 1,
                isSuperOver,
                superOverNumber: innings.super_over_number,
              });
              await matches.update(match.id, { status: 'live' });
              live.refetch();
              return;
            }

            // Second innings of the pair: the target came from the first, so
            // the first innings total is one less than it.
            const firstTotal = (innings.target ?? state.runs + 1) - 1;
            const chased = state.runs;

            if (chased === firstTotal) {
              // Level scores. Offer a super over rather than settling for a tie.
              const nextSuperOver = (innings.super_over_number ?? 0) + 1;
              setBusy(false);
              Alert.alert(
                isSuperOver ? 'Super over tied' : 'Scores level',
                isSuperOver
                  ? 'The super over finished level. The laws call for another one.'
                  : 'Both sides finished on the same score. Play a super over, or record it as a tie.',
                [
                  {
                    text: 'Record a tie',
                    style: 'cancel',
                    onPress: async () => {
                      setBusy(true);
                      try {
                        await scoring.finishMatch({
                          matchId: match.id,
                          kind: 'tie',
                          summary: 'Match tied',
                          decidedBySuperOver: isSuperOver,
                        });
                        live.refetch();
                      } catch (e) {
                        setError(describeError(e));
                      } finally {
                        setBusy(false);
                      }
                    },
                  },
                  {
                    text: `Play super over ${nextSuperOver}`,
                    onPress: async () => {
                      setBusy(true);
                      try {
                        // The side that batted second in the tied innings bats
                        // first in the super over.
                        await scoring.startInnings({
                          matchId: match.id,
                          inningsNumber: innings.innings_number + 1,
                          battingTeamId: innings.batting_team_id,
                          bowlingTeamId: innings.bowling_team_id,
                          isSuperOver: true,
                          superOverNumber: nextSuperOver,
                        });
                        await matches.update(match.id, { status: 'live' });
                        live.refetch();
                      } catch (e) {
                        setError(describeError(e));
                      } finally {
                        setBusy(false);
                      }
                    },
                  },
                ],
              );
              return;
            }

            const chasingWon = chased > firstTotal;
            const winnerTeamId = chasingWon ? innings.batting_team_id : innings.bowling_team_id;
            const wicketsLeft = rules.playersPerSide - 1 - state.wickets;

            await scoring.finishMatch({
              matchId: match.id,
              kind: 'win',
              winnerTeamId,
              summary: chasingWon
                ? `${teamName(winnerTeamId)} won by ${wicketsLeft} wicket${wicketsLeft === 1 ? '' : 's'}`
                : `${teamName(winnerTeamId)} won by ${firstTotal - chased} run${firstTotal - chased === 1 ? '' : 's'}`,
              marginRuns: chasingWon ? null : firstTotal - chased,
              marginWickets: chasingWon ? wicketsLeft : null,
              decidedBySuperOver: isSuperOver,
            });
            live.refetch();
          } catch (e) {
            setError(describeError(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const thisOver = state.overs[state.overs.length - 1]?.deliveries ?? [];
  const rrr = requiredRunRate(state, rules, maxOvers);

  return (
    <ScrollView style={s.page} contentContainerStyle={s.pageContent}>
      {/* --------------------------------------------------------- scoreboard */}
      <View style={s.topRow}>
        <Pill text={state.closed ? 'INNINGS CLOSED' : '● LIVE'} tone={state.closed ? 'muted' : 'red'} />
        <View style={s.syncRow}>
          <Ionicons
            name={live.pendingCount > 0 ? 'cloud-upload-outline' : 'checkmark-circle-outline'}
            size={14}
            color={live.pendingCount > 0 ? C.amber : C.green}
          />
          <Text style={[s.syncText, live.pendingCount > 0 && { color: C.amber }]}>
            {live.pendingCount > 0 ? `${live.pendingCount} to sync` : 'Synced'}
          </Text>
        </View>
      </View>

      <Card style={s.scoreCard}>
        <Text style={s.inningsLabel}>
          INNINGS {innings.innings_number} • {formatOvers(state.legalBalls, rules.ballsPerOver)}
          {maxOvers ? ` / ${maxOvers}` : ''} OVERS
        </Text>
        <Text style={s.score}>
          {state.runs}
          <Text style={s.slash}>/</Text>
          {state.wickets}
        </Text>
        <Text style={s.rates}>
          CRR {currentRunRate(state, rules).toFixed(2)}
          {rrr != null ? ` • RRR ${rrr.toFixed(2)}` : ''}
        </Text>
        {state.target != null ? (
          <Text style={s.chase}>{chaseSummary(state, rules, maxOvers)}</Text>
        ) : null}

        {state.freeHit ? (
          <View style={s.freeHit}>
            <Ionicons name="flash" size={13} color={C.amber} />
            <Text style={s.freeHitText}>FREE HIT — only a run out can dismiss</Text>
          </View>
        ) : null}

        <View style={s.overStrip}>
          {thisOver.length ? (
            thisOver.slice(-8).map((d, i) => (
              <BallChip
                key={d.id || i}
                label={deliveryLabel(d)}
                tone={d.wicket ? 'red' : d.runsOffBat >= 4 ? 'lime' : undefined}
              />
            ))
          ) : (
            <Text style={s.muted}>New over</Text>
          )}
        </View>
      </Card>

      {/* ------------------------------------------------------------- crease */}
      <Card style={s.creaseCard}>
        <View style={s.batterRow}>
          <View style={s.flex}>
            <Text style={s.batterName}>{striker ? `${nameOf(striker)} *` : 'Select the striker'}</Text>
            <Text style={s.batterFigures}>{battingFigures(state, striker)}</Text>
          </View>
          <Pressable
            onPress={() => {
              if (!striker || !nonStriker) return;
              setStrikerOverride(nonStriker);
              setNonStrikerOverride(striker);
            }}
            style={s.swap}
            hitSlop={8}
            accessibilityLabel="Swap the batters"
          >
            <Ionicons name="swap-horizontal" size={18} color={C.green} />
          </Pressable>
        </View>
        <View style={s.batterRow}>
          <View style={s.flex}>
            <Text style={s.batterNameDim}>{nonStriker ? nameOf(nonStriker) : 'Select the non-striker'}</Text>
            <Text style={s.batterFigures}>{battingFigures(state, nonStriker)}</Text>
          </View>
        </View>
        <View style={s.bowlerRow}>
          <Ionicons name="baseball-outline" size={15} color={C.muted} />
          <Text style={s.bowlerText}>
            {bowler ? `${nameOf(bowler)} — ${bowlingFigures(state, bowler, rules.ballsPerOver)}` : 'Select a bowler'}
          </Text>
        </View>
      </Card>

      {error ? <ErrorNotice message={error} /> : null}

      {/* ------------------------------------------------------- who is in/on */}
      {!striker || !nonStriker ? (
        <Card style={s.pickCard}>
          <Text style={s.pickTitle}>{!striker ? 'Who is on strike?' : 'Who is at the other end?'}</Text>
          <ChipGroup
            value={null}
            onChange={(playerId) => (!striker ? setStrikerOverride(playerId) : setNonStrikerOverride(playerId))}
            options={battingSquad
              .filter((x) => !dismissed.has(x.player_id))
              .filter((x) => x.player_id !== striker && x.player_id !== nonStriker)
              .map((x) => ({
                value: x.player_id,
                label: x.player.display_name || x.player.full_name,
                sublabel: `#${x.batting_order ?? '—'}`,
              }))}
          />
        </Card>
      ) : !bowler ? (
        <Card style={s.pickCard}>
          <Text style={s.pickTitle}>Who is bowling this over?</Text>
          <ChipGroup
            value={null}
            onChange={setBowlerOverride}
            tone="blue"
            options={bowlingSquad.map((x) => {
              const figures = state.bowling.find((b) => b.playerId === x.player_id);
              const overs = figures ? Math.floor(figures.legalBalls / rules.ballsPerOver) : 0;
              const atQuota = rules.maxOversPerBowler != null && overs >= rules.maxOversPerBowler;
              const lastOver = [...state.overs].reverse().find((o) => o.complete);
              return {
                value: x.player_id,
                label: x.player.display_name || x.player.full_name,
                sublabel: figures
                  ? `${formatOvers(figures.legalBalls, rules.ballsPerOver)}-${figures.maidens}-${figures.runsConceded}-${figures.wickets}`
                  : 'Yet to bowl',
                disabled: atQuota || lastOver?.bowlerId === x.player_id,
              };
            })}
          />
        </Card>
      ) : null}

      {/* --------------------------------------------------------- scoring pad */}
      {state.closed ? (
        <Card style={s.closedCard}>
          <Text style={s.closedTitle}>Innings closed</Text>
          <Text style={s.closedText}>
            {state.endReason === 'all_out'
              ? 'All out.'
              : state.endReason === 'target_reached'
                ? 'Target reached.'
                : state.endReason === 'overs_complete'
                  ? 'Overs complete.'
                  : 'This innings has ended.'}
          </Text>
          <Button
            title={innings.innings_number === 1 ? 'Start the second innings' : 'Finish the match'}
            onPress={endInnings}
            loading={busy}
          />
        </Card>
      ) : (
        <>
          <Text style={s.sectionTitle}>
            {extraMode === 'none'
              ? 'Runs off the bat'
              : extraMode === 'wide'
                ? 'Extra runs run on the wide'
                : extraMode === 'no_ball'
                  ? 'Runs off the bat on the no ball'
                  : extraMode === 'bye'
                    ? 'Byes'
                    : 'Leg byes'}
          </Text>
          <View style={s.pad}>
            {(extraMode === 'wide' ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 6]).map((n) => (
              <Pressable
                key={n}
                disabled={!readyToScore || busy}
                onPress={() => void runs(n)}
                style={({ pressed }) => [
                  s.runButton,
                  (!readyToScore || busy) && s.disabled,
                  pressed && s.pressed,
                  n >= 4 && s.boundaryButton,
                ]}
              >
                <Text style={[s.runText, n >= 4 && s.boundaryText]}>{n}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={s.sectionTitle}>Extras</Text>
          <View style={s.extras}>
            {(
              [
                ['wide', 'Wide'],
                ['no_ball', 'No ball'],
                ['bye', 'Bye'],
                ['leg_bye', 'Leg bye'],
              ] as [ExtraMode, string][]
            ).map(([mode, label]) => (
              <Pressable
                key={mode}
                disabled={!readyToScore}
                onPress={() => setExtraMode(extraMode === mode ? 'none' : mode)}
                style={({ pressed }) => [
                  s.extraButton,
                  extraMode === mode && s.extraActive,
                  !readyToScore && s.disabled,
                  pressed && s.pressed,
                ]}
              >
                <Text style={[s.extraText, extraMode === mode && s.extraTextActive]}>{label}</Text>
              </Pressable>
            ))}
            <Pressable
              disabled={!readyToScore || busy}
              onPress={() => void record({ penaltyRuns: 5 })}
              style={({ pressed }) => [s.extraButton, (!readyToScore || busy) && s.disabled, pressed && s.pressed]}
            >
              <Text style={s.extraText}>+5 penalty</Text>
            </Pressable>
          </View>

          {extraMode !== 'none' ? (
            <Text style={s.extraHint}>
              {extraMode === 'wide'
                ? 'Tap 0 for a plain wide. The automatic penalty run is added for you.'
                : extraMode === 'no_ball'
                  ? 'Tap the runs the batter hit. The no-ball penalty is added for you.'
                  : 'Tap how many were run.'}
            </Text>
          ) : null}

          <Pressable
            disabled={!readyToScore || busy}
            onPress={() => setWicketOpen((open) => !open)}
            style={({ pressed }) => [s.wicketButton, (!readyToScore || busy) && s.disabled, pressed && s.pressed]}
          >
            <Ionicons name="close-circle" size={19} color={C.red} />
            <Text style={s.wicketText}>WICKET</Text>
          </Pressable>

          {wicketOpen ? (
            <WicketPanel
              striker={striker}
              nonStriker={nonStriker}
              nameOf={nameOf}
              freeHit={state.freeHit}
              fielders={bowlingSquad.map((x) => ({
                id: x.player_id,
                name: x.player.display_name || x.player.full_name,
              }))}
              onCancel={() => setWicketOpen(false)}
              onConfirm={(wicket, runsOffBat) => void record({ wicket, runsOffBat })}
            />
          ) : null}

          <View style={s.actions}>
            <Button
              title="Undo last ball"
              secondary
              icon="arrow-undo-outline"
              onPress={undo}
              disabled={state.legalBalls === 0 && thisOver.length === 0}
            />
            <Button title="End innings" secondary icon="flag-outline" onPress={endInnings} />
            <Button
              title="Back to match centre"
              secondary
              icon="stats-chart-outline"
              onPress={() => router.replace(`/match/${match.id}`)}
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------

function battingFigures(state: ReturnType<typeof useLiveMatch>['currentState'], playerId: string | null) {
  if (!state || !playerId) return '—';
  const entry = state.batting.find((b) => b.playerId === playerId);
  if (!entry) return '0 (0)';
  return `${entry.runs} (${entry.balls}) • ${entry.fours}×4 ${entry.sixes}×6`;
}

function bowlingFigures(
  state: ReturnType<typeof useLiveMatch>['currentState'],
  playerId: string,
  ballsPerOver: number,
) {
  const entry = state?.bowling.find((b) => b.playerId === playerId);
  if (!entry) return '0.0-0-0-0';
  return `${formatOvers(entry.legalBalls, ballsPerOver)}-${entry.maidens}-${entry.runsConceded}-${entry.wickets}`;
}

function WicketPanel({
  striker,
  nonStriker,
  nameOf,
  freeHit,
  fielders,
  onCancel,
  onConfirm,
}: {
  striker: string | null;
  nonStriker: string | null;
  nameOf: (id: string | null) => string;
  freeHit: boolean;
  fielders: { id: string; name: string }[];
  onCancel: () => void;
  onConfirm: (wicket: NonNullable<Delivery['wicket']>, runsOffBat: number) => void;
}) {
  const [kind, setKind] = useState<DismissalKind | null>(null);
  const [playerOut, setPlayerOut] = useState<string | null>(striker);
  const [fielder, setFielder] = useState<string | null>(null);
  const [runsOffBat, setRunsOffBat] = useState(0);

  const option = DISMISSAL_OPTIONS.find((o) => o.kind === kind);
  const needsFielder = option?.needsFielder ?? false;
  const available = freeHit
    ? DISMISSAL_OPTIONS.filter((o) =>
        ['run_out', 'obstructing_the_field', 'hit_ball_twice'].includes(o.kind),
      )
    : DISMISSAL_OPTIONS;

  const ready = !!kind && !!playerOut && (!needsFielder || !!fielder);

  return (
    <Card style={s.wicketPanel}>
      <Text style={s.pickTitle}>How were they out?</Text>
      <ChipGroup
        tone="red"
        value={kind}
        onChange={(next) => setKind(next as DismissalKind)}
        options={available.map((o) => ({ value: o.kind, label: o.label }))}
      />

      <Text style={s.pickLabel}>Batter out</Text>
      <ChipGroup
        tone="red"
        value={playerOut}
        onChange={setPlayerOut}
        options={[striker, nonStriker]
          .filter((x): x is string => !!x)
          .map((id) => ({ value: id, label: nameOf(id), sublabel: id === striker ? 'striker' : 'non-striker' }))}
      />

      {needsFielder ? (
        <>
          <Text style={s.pickLabel}>Fielder</Text>
          <ChipGroup
            tone="blue"
            value={fielder}
            onChange={setFielder}
            options={fielders.map((f) => ({ value: f.id, label: f.name }))}
          />
        </>
      ) : null}

      {kind === 'run_out' ? (
        <>
          <Text style={s.pickLabel}>Runs completed before the run out</Text>
          <ChipGroup
            value={String(runsOffBat)}
            onChange={(v) => setRunsOffBat(Number(v))}
            options={[0, 1, 2, 3].map((n) => ({ value: String(n), label: String(n) }))}
          />
        </>
      ) : null}

      <View style={s.wicketActions}>
        <Button title="Cancel" secondary onPress={onCancel} style={s.flex} />
        <Button
          title="Record wicket"
          danger
          disabled={!ready}
          onPress={() =>
            onConfirm(
              { kind: kind as DismissalKind, playerOutId: playerOut as string, fielderId: fielder },
              kind === 'run_out' ? runsOffBat : 0,
            )
          }
          style={s.flex}
        />
      </View>
    </Card>
  );
}

/** Shown when the match has no innings yet: pick who bats first. */
function StartInnings({
  match,
  onStarted,
}: {
  match: NonNullable<ReturnType<typeof useLiveMatch>['match']>;
  onStarted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async (battingTeamId: string, bowlingTeamId: string) => {
    setBusy(true);
    setError(null);
    try {
      await scoring.startInnings({
        matchId: match.id,
        inningsNumber: 1,
        battingTeamId,
        bowlingTeamId,
      });
      await matches.update(match.id, { status: 'live' });
      onStarted();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const home = match.home_team_id;
  const away = match.away_team_id;

  return (
    <Screen>
      <Text style={s.startTitle}>Start the match</Text>
      <Text style={s.startLead}>
        Name both playing elevens from the match centre first, then choose who bats.
      </Text>
      {error ? <ErrorNotice message={error} /> : null}
      {home && away ? (
        <View style={s.startActions}>
          <Button title="Home team bats first" loading={busy} onPress={() => void start(home, away)} />
          <Button title="Away team bats first" secondary loading={busy} onPress={() => void start(away, home)} />
        </View>
      ) : (
        <ErrorNotice message="Both teams must be set on this fixture before it can be scored." />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  pageContent: { padding: 18, paddingBottom: 60 },
  flex: { flex: 1 },
  muted: { color: C.muted },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.35 },

  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  syncText: { color: C.green, fontSize: 12, fontWeight: '700' },

  scoreCard: { alignItems: 'center', marginTop: 14, gap: 4 },
  inningsLabel: { color: C.green, fontWeight: '900', fontSize: 11, letterSpacing: 0.8 },
  score: { color: C.white, fontWeight: '900', fontSize: 54, marginTop: 4 },
  slash: { color: C.muted, fontWeight: '400' },
  rates: { color: C.muted, fontSize: 13 },
  chase: { color: C.amber, fontWeight: '800', marginTop: 4 },
  freeHit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: `${C.amber}1F`,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
  },
  freeHitText: { color: C.amber, fontWeight: '900', fontSize: 11 },
  overStrip: { flexDirection: 'row', gap: 7, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' },

  creaseCard: { marginTop: 12, gap: 12 },
  batterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  batterName: { color: C.white, fontWeight: '900' },
  batterNameDim: { color: C.muted, fontWeight: '800' },
  batterFigures: { color: C.muted, fontSize: 12, marginTop: 3 },
  swap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: C.card2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bowlerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 12,
  },
  bowlerText: { color: C.white, fontSize: 13, fontWeight: '700', flex: 1 },

  pickCard: { marginTop: 12, gap: 12 },
  pickTitle: { color: C.white, fontWeight: '900', fontSize: 15 },
  pickLabel: { color: C.muted, fontWeight: '800', fontSize: 11, letterSpacing: 0.6, marginTop: 14, marginBottom: 8 },

  sectionTitle: { color: C.white, fontWeight: '900', fontSize: 15, marginTop: 22, marginBottom: 11 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  runButton: {
    width: '31.5%',
    height: 64,
    borderRadius: 18,
    backgroundColor: C.card2,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: C.line,
    borderWidth: 1,
  },
  boundaryButton: { borderColor: C.green },
  runText: { color: C.white, fontSize: 24, fontWeight: '900' },
  boundaryText: { color: C.lime },

  extras: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  extraButton: {
    paddingHorizontal: 16,
    minHeight: 48,
    borderRadius: 15,
    borderColor: C.line,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.card,
  },
  extraActive: { borderColor: C.green, backgroundColor: `${C.green}1F` },
  extraText: { color: C.white, fontWeight: '800', fontSize: 13 },
  extraTextActive: { color: C.green },
  extraHint: { color: C.muted, fontSize: 12, marginTop: 10, lineHeight: 18 },

  wicketButton: {
    marginTop: 20,
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.red,
    backgroundColor: `${C.red}14`,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  wicketText: { color: C.red, fontWeight: '900', letterSpacing: 1 },
  wicketPanel: { marginTop: 12, gap: 10 },
  wicketActions: { flexDirection: 'row', gap: 10, marginTop: 18 },

  closedCard: { marginTop: 20, gap: 10 },
  closedTitle: { color: C.white, fontWeight: '900', fontSize: 17 },
  closedText: { color: C.muted, lineHeight: 20, marginBottom: 6 },

  actions: { gap: 10, marginTop: 26 },

  startTitle: { color: C.white, fontSize: 24, fontWeight: '900', marginBottom: 8 },
  startLead: { color: C.muted, lineHeight: 21, marginBottom: 24 },
  startActions: { gap: 10 },
});
