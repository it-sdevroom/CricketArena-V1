/**
 * Core cricket domain types.
 *
 * These types are intentionally free of any framework, database or network
 * concerns. Everything the app knows about the state of a match is derived by
 * folding an ordered list of `Delivery` records through the reducer in
 * `scoring.ts`. That makes undo, correction and offline replay trivial: change
 * the event list, re-derive the state.
 */

/** How a batter's innings ended. */
export type DismissalKind =
  | 'bowled'
  | 'caught'
  | 'caught_behind'
  | 'caught_and_bowled'
  | 'lbw'
  | 'stumped'
  | 'hit_wicket'
  | 'run_out'
  | 'obstructing_the_field'
  | 'hit_ball_twice'
  | 'timed_out'
  | 'retired_out'
  | 'retired_not_out';

/** Dismissals the bowler gets credit for in their figures. */
export const BOWLER_CREDITED: ReadonlySet<DismissalKind> = new Set<DismissalKind>([
  'bowled',
  'caught',
  'caught_behind',
  'caught_and_bowled',
  'lbw',
  'stumped',
  'hit_wicket',
]);

/** Dismissals still possible while a free hit is in effect. */
export const FREE_HIT_DISMISSALS: ReadonlySet<DismissalKind> = new Set<DismissalKind>([
  'run_out',
  'obstructing_the_field',
  'hit_ball_twice',
]);

/** A batter leaving the crease without being dismissed does not count as a wicket. */
export const NON_WICKET_DISMISSALS: ReadonlySet<DismissalKind> = new Set<DismissalKind>([
  'retired_not_out',
]);

export interface Wicket {
  kind: DismissalKind;
  /** Player who left the field. For a run out this may be the non-striker. */
  playerOutId: string;
  /** Fielder credited with the catch, run out or stumping. */
  fielderId?: string | null;
}

/**
 * One delivery as recorded by the scorer.
 *
 * `runsOffBat` are runs credited to the striker. Extras are recorded
 * separately so that bowler figures and the extras breakdown stay correct:
 *
 *  - `wide`      additional runs run while the ball was called wide (the
 *                automatic penalty from `MatchRules.wideRuns` is added on top)
 *  - `noBall`    the delivery was a no ball (penalty from `MatchRules.noBallRuns`)
 *  - `byes`      runs that beat bat and pad
 *  - `legByes`   runs off the batter's body
 *  - `penaltyRuns` 5-run penalties and similar, awarded to the batting side
 */
export interface Delivery {
  id: string;
  /** Monotonic order within the innings. Assigned by the server on sync. */
  sequence: number;
  strikerId: string;
  nonStrikerId: string;
  bowlerId: string;
  runsOffBat: number;
  wide?: number | null;
  noBall?: boolean | null;
  byes?: number | null;
  legByes?: number | null;
  penaltyRuns?: number | null;
  wicket?: Wicket | null;
  /** Set when the delivery was bowled under a free hit. Derived, stored for audit. */
  freeHit?: boolean | null;
  /** Client-generated key so a retried offline sync cannot double-count. */
  idempotencyKey?: string;
  createdAt?: string;
}

export interface MatchRules {
  /** Overs per innings. `null` for unlimited (multi-day) cricket. */
  oversPerInnings: number | null;
  ballsPerOver: number;
  /** Runs automatically awarded for a wide. */
  wideRuns: number;
  /** Runs automatically awarded for a no ball. */
  noBallRuns: number;
  /** Whether a no ball is followed by a free hit. */
  freeHitAfterNoBall: boolean;
  /** Players per side. Used to decide when a side is all out. */
  playersPerSide: number;
  /** Maximum overs a single bowler may bowl. `null` for no limit. */
  maxOversPerBowler: number | null;
  /** Whether byes and leg byes are counted off a no ball as separate extras. */
  countByesOnNoBall: boolean;
}

export const T20_RULES: MatchRules = {
  oversPerInnings: 20,
  ballsPerOver: 6,
  wideRuns: 1,
  noBallRuns: 1,
  freeHitAfterNoBall: true,
  playersPerSide: 11,
  maxOversPerBowler: 4,
  countByesOnNoBall: true,
};

export const ODI_RULES: MatchRules = {
  ...T20_RULES,
  oversPerInnings: 50,
  maxOversPerBowler: 10,
};

export const T10_RULES: MatchRules = {
  ...T20_RULES,
  oversPerInnings: 10,
  maxOversPerBowler: 2,
};

export const TAPE_BALL_RULES: MatchRules = {
  ...T20_RULES,
  oversPerInnings: 16,
  maxOversPerBowler: null,
  freeHitAfterNoBall: false,
};

export const TEST_RULES: MatchRules = {
  oversPerInnings: null,
  ballsPerOver: 6,
  wideRuns: 1,
  noBallRuns: 1,
  freeHitAfterNoBall: false,
  playersPerSide: 11,
  maxOversPerBowler: null,
  countByesOnNoBall: true,
};

export const RULE_PRESETS: Record<string, MatchRules> = {
  T10: T10_RULES,
  T20: T20_RULES,
  ODI: ODI_RULES,
  TEST: TEST_RULES,
  TAPE_BALL: TAPE_BALL_RULES,
};

export type MatchFormat = keyof typeof RULE_PRESETS;

/** Running figures for one batter. */
export interface BattingEntry {
  playerId: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dots: number;
  out: boolean;
  wicket: Wicket | null;
  /** Team score when this batter was dismissed, for the fall-of-wickets list. */
  fellAt: { runs: number; wickets: number; over: string } | null;
  battingPosition: number;
}

/** Running figures for one bowler. */
export interface BowlingEntry {
  playerId: string;
  legalBalls: number;
  runsConceded: number;
  wickets: number;
  maidens: number;
  wides: number;
  noBalls: number;
  dots: number;
}

export interface Partnership {
  batterAId: string;
  batterBId: string;
  runs: number;
  balls: number;
  /** Wicket number this partnership was for (1 = opening stand). */
  forWicket: number;
  unbroken: boolean;
}

export interface OverSummary {
  overNumber: number;
  bowlerId: string;
  runs: number;
  wickets: number;
  deliveries: Delivery[];
  complete: boolean;
}

export type InningsEndReason =
  | 'all_out'
  | 'overs_complete'
  | 'target_reached'
  | 'declared'
  | 'forfeited'
  | 'abandoned';

/** The complete derived state of one innings. */
export interface InningsState {
  battingTeamId: string;
  bowlingTeamId: string;
  runs: number;
  wickets: number;
  legalBalls: number;
  extras: {
    wides: number;
    noBalls: number;
    byes: number;
    legByes: number;
    penalties: number;
    total: number;
  };
  strikerId: string | null;
  nonStrikerId: string | null;
  bowlerId: string | null;
  freeHit: boolean;
  batting: BattingEntry[];
  bowling: BowlingEntry[];
  partnerships: Partnership[];
  overs: OverSummary[];
  /** Balls remaining in the current over. */
  ballsThisOver: number;
  closed: boolean;
  endReason: InningsEndReason | null;
  /** Runs needed to win. Only set for the innings batting second. */
  target: number | null;
}

export interface MatchResult {
  kind: 'win' | 'tie' | 'draw' | 'no_result' | 'abandoned' | 'walkover';
  winnerTeamId: string | null;
  /** e.g. "Riyadh Falcons won by 24 runs" */
  summary: string;
  /** Margin in runs, when the side batting first won. */
  byRuns?: number;
  /** Margin in wickets, when the side batting second won. */
  byWickets?: number;
  ballsRemaining?: number;
}
