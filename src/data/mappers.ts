/**
 * Translation between database rows and the domain model.
 *
 * The one non-obvious conversion is extras. The database stores `wide_runs` and
 * `no_ball_runs` as absolute totals so its generated columns can add up a score
 * without knowing the competition's playing conditions. The domain model
 * instead stores `wide` as "additional runs the batters ran", because that is
 * what strike rotation depends on. Everything crossing this boundary needs the
 * match rules to convert.
 */

import type { Delivery, MatchRules } from '@/src/domain/types';
import { RULE_PRESETS, T20_RULES } from '@/src/domain/types';

import type { DeliveryRow, MatchRow, TournamentRow } from './types';

/** Playing conditions for a match, falling back to the T20 defaults. */
export function rulesFromMatch(match: MatchRow): MatchRules {
  return {
    oversPerInnings: match.overs_per_innings,
    ballsPerOver: match.balls_per_over || 6,
    wideRuns: match.wide_runs ?? 1,
    noBallRuns: match.no_ball_runs ?? 1,
    freeHitAfterNoBall: match.free_hit_after_no_ball ?? true,
    playersPerSide: match.players_per_side || 11,
    maxOversPerBowler: match.max_overs_per_bowler,
    countByesOnNoBall: true,
  };
}

export function rulesFromTournament(tournament: TournamentRow): MatchRules {
  return {
    oversPerInnings: tournament.overs_per_innings,
    ballsPerOver: tournament.balls_per_over || 6,
    wideRuns: tournament.wide_runs ?? 1,
    noBallRuns: tournament.no_ball_runs ?? 1,
    freeHitAfterNoBall: tournament.free_hit_after_no_ball ?? true,
    playersPerSide: tournament.players_per_side || 11,
    maxOversPerBowler: tournament.max_overs_per_bowler,
    countByesOnNoBall: true,
  };
}

export function rulesForFormat(format: string): MatchRules {
  return RULE_PRESETS[format] ?? T20_RULES;
}

/** Database row -> domain delivery. */
export function toDelivery(row: DeliveryRow, rules: MatchRules): Delivery {
  return {
    id: row.id,
    sequence: row.sequence,
    strikerId: row.striker_id,
    nonStrikerId: row.non_striker_id,
    bowlerId: row.bowler_id,
    runsOffBat: row.runs_off_bat,
    // Absolute total minus the automatic penalty leaves the runs actually run.
    wide: row.wide_runs != null ? Math.max(0, row.wide_runs - rules.wideRuns) : null,
    noBall: row.no_ball_runs != null,
    byes: row.byes,
    legByes: row.leg_byes,
    penaltyRuns: row.penalty_runs,
    wicket: row.wicket_kind
      ? {
          kind: row.wicket_kind,
          playerOutId: row.player_out_id as string,
          fielderId: row.fielder_id,
        }
      : null,
    freeHit: row.free_hit,
    shot: row.shot,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  };
}

export interface DeliveryInsert {
  innings_id: string;
  match_id: string;
  striker_id: string;
  non_striker_id: string;
  bowler_id: string;
  runs_off_bat: number;
  wide_runs: number | null;
  no_ball_runs: number | null;
  byes: number;
  leg_byes: number;
  penalty_runs: number;
  wicket_kind: string | null;
  player_out_id: string | null;
  fielder_id: string | null;
  free_hit: boolean;
  shot: string | null;
  idempotency_key: string;
}

/** Domain delivery -> insert payload. */
export function toDeliveryInsert(
  delivery: Delivery,
  inningsId: string,
  matchId: string,
  rules: MatchRules,
): DeliveryInsert {
  return {
    innings_id: inningsId,
    match_id: matchId,
    striker_id: delivery.strikerId,
    non_striker_id: delivery.nonStrikerId,
    bowler_id: delivery.bowlerId,
    runs_off_bat: delivery.runsOffBat || 0,
    wide_runs: delivery.wide != null ? rules.wideRuns + delivery.wide : null,
    no_ball_runs: delivery.noBall ? rules.noBallRuns : null,
    byes: delivery.byes || 0,
    leg_byes: delivery.legByes || 0,
    penalty_runs: delivery.penaltyRuns || 0,
    wicket_kind: delivery.wicket?.kind ?? null,
    player_out_id: delivery.wicket?.playerOutId ?? null,
    fielder_id: delivery.wicket?.fielderId ?? null,
    free_hit: delivery.freeHit ?? false,
    shot: delivery.shot ?? null,
    idempotency_key: delivery.idempotencyKey as string,
  };
}

/** Short label for a ball, as shown on the this-over strip: "4", "W", "wd2". */
export function deliveryLabel(delivery: Delivery): string {
  if (delivery.wicket && delivery.wicket.kind !== 'retired_not_out') return 'W';
  if (delivery.wide != null) return delivery.wide > 0 ? `wd${delivery.wide + 1}` : 'wd';
  if (delivery.noBall) return delivery.runsOffBat > 0 ? `nb${delivery.runsOffBat}` : 'nb';
  if (delivery.byes) return `${delivery.byes}b`;
  if (delivery.legByes) return `${delivery.legByes}lb`;
  return String(delivery.runsOffBat);
}

/** How a dismissal reads on a scorecard. */
export function dismissalText(
  kind: string,
  bowlerName?: string | null,
  fielderName?: string | null,
): string {
  switch (kind) {
    case 'bowled':
      return `b ${bowlerName ?? ''}`.trim();
    case 'lbw':
      return `lbw b ${bowlerName ?? ''}`.trim();
    case 'caught':
      return `c ${fielderName ?? '?'} b ${bowlerName ?? ''}`.trim();
    case 'caught_behind':
      return `c †${fielderName ?? '?'} b ${bowlerName ?? ''}`.trim();
    case 'caught_and_bowled':
      return `c & b ${bowlerName ?? ''}`.trim();
    case 'stumped':
      return `st †${fielderName ?? '?'} b ${bowlerName ?? ''}`.trim();
    case 'hit_wicket':
      return `hit wicket b ${bowlerName ?? ''}`.trim();
    case 'run_out':
      return `run out (${fielderName ?? '?'})`;
    case 'obstructing_the_field':
      return 'obstructing the field';
    case 'hit_ball_twice':
      return 'hit the ball twice';
    case 'timed_out':
      return 'timed out';
    case 'retired_out':
      return 'retired out';
    case 'retired_not_out':
      return 'retired not out';
    default:
      return 'not out';
  }
}

export const DISMISSAL_OPTIONS: { kind: string; label: string; needsFielder: boolean }[] = [
  { kind: 'bowled', label: 'Bowled', needsFielder: false },
  { kind: 'caught', label: 'Caught', needsFielder: true },
  { kind: 'caught_behind', label: 'Caught behind', needsFielder: true },
  { kind: 'caught_and_bowled', label: 'Caught & bowled', needsFielder: false },
  { kind: 'lbw', label: 'LBW', needsFielder: false },
  { kind: 'run_out', label: 'Run out', needsFielder: true },
  { kind: 'stumped', label: 'Stumped', needsFielder: true },
  { kind: 'hit_wicket', label: 'Hit wicket', needsFielder: false },
  { kind: 'obstructing_the_field', label: 'Obstructing the field', needsFielder: false },
  { kind: 'hit_ball_twice', label: 'Hit the ball twice', needsFielder: false },
  { kind: 'timed_out', label: 'Timed out', needsFielder: false },
  { kind: 'retired_out', label: 'Retired out', needsFielder: false },
  { kind: 'retired_not_out', label: 'Retired not out', needsFielder: false },
];
