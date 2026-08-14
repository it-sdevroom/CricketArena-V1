/**
 * The scoring engine.
 *
 * An innings is a pure fold over its ordered deliveries. Nothing here mutates
 * shared state or talks to the outside world, so the same code runs on the
 * device while scoring offline, on another device replaying a realtime feed,
 * and in tests.
 *
 * Because state is always re-derived, "undo last ball" is just dropping the
 * final delivery, and a score correction is editing one delivery in the list.
 */

import {
  BOWLER_CREDITED,
  BattingEntry,
  BowlingEntry,
  Delivery,
  FREE_HIT_DISMISSALS,
  InningsEndReason,
  InningsState,
  MatchRules,
  NON_WICKET_DISMISSALS,
  OverSummary,
  Partnership,
} from './types';

export interface InningsConfig {
  battingTeamId: string;
  bowlingTeamId: string;
  rules: MatchRules;
  /** Runs required to win. Only set for the side batting second. */
  target?: number | null;
  /** Overs this innings was reduced to, if rain shortened it. */
  reducedOvers?: number | null;
  /** Set when the innings was ended by something other than the laws. */
  forcedEnd?: InningsEndReason | null;
}

/** Runs charged to the bowler, versus runs that only go to the team total. */
export interface DeliveryBreakdown {
  legal: boolean;
  isWide: boolean;
  isNoBall: boolean;
  runsOffBat: number;
  wideRuns: number;
  noBallRuns: number;
  byes: number;
  legByes: number;
  penalties: number;
  /** Everything added to the batting side's total. */
  totalRuns: number;
  /** Runs that count against the bowler's analysis. */
  bowlerRuns: number;
  /** Runs the batters physically ran or hit, used for strike rotation. */
  crossed: number;
  countsAsFaced: boolean;
}

/** Decompose a delivery into the numbers every other calculation needs. */
export function breakdown(d: Delivery, rules: MatchRules): DeliveryBreakdown {
  const isWide = d.wide != null;
  const isNoBall = d.noBall === true;
  const runsOffBat = d.runsOffBat || 0;
  const wideRuns = isWide ? rules.wideRuns + (d.wide || 0) : 0;
  const noBallRuns = isNoBall ? rules.noBallRuns : 0;
  const byes = d.byes || 0;
  const legByes = d.legByes || 0;
  const penalties = d.penaltyRuns || 0;

  return {
    legal: !isWide && !isNoBall,
    isWide,
    isNoBall,
    runsOffBat,
    wideRuns,
    noBallRuns,
    byes,
    legByes,
    penalties,
    totalRuns: runsOffBat + wideRuns + noBallRuns + byes + legByes + penalties,
    // Byes, leg byes and penalty runs are not charged to the bowler.
    bowlerRuns: runsOffBat + wideRuns + noBallRuns,
    // A wide's automatic penalty is not run by the batters; the extra is.
    crossed: runsOffBat + byes + legByes + (d.wide || 0),
    // A batter is not credited with facing a wide, but does face a no ball.
    countsAsFaced: !isWide,
  };
}

function emptyBatting(playerId: string, position: number): BattingEntry {
  return {
    playerId,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    dots: 0,
    out: false,
    wicket: null,
    fellAt: null,
    battingPosition: position,
  };
}

function emptyBowling(playerId: string): BowlingEntry {
  return {
    playerId,
    legalBalls: 0,
    runsConceded: 0,
    wickets: 0,
    maidens: 0,
    wides: 0,
    noBalls: 0,
    dots: 0,
  };
}

/** Format a ball count as cricket overs, e.g. 75 balls -> "12.3". */
export function formatOvers(legalBalls: number, ballsPerOver = 6): string {
  return `${Math.floor(legalBalls / ballsPerOver)}.${legalBalls % ballsPerOver}`;
}

/** Overs as a decimal number of overs, for run-rate and NRR maths. */
export function oversDecimal(legalBalls: number, ballsPerOver = 6): number {
  return legalBalls / ballsPerOver;
}

/**
 * Fold an ordered delivery list into the full state of an innings.
 *
 * Deliveries are assumed to be in `sequence` order; callers that may hold an
 * out-of-order offline queue should sort first.
 */
export function buildInnings(deliveries: Delivery[], config: InningsConfig): InningsState {
  const { rules } = config;
  const maxOvers = config.reducedOvers ?? rules.oversPerInnings;

  const batting = new Map<string, BattingEntry>();
  const bowling = new Map<string, BowlingEntry>();
  const overs: OverSummary[] = [];
  const partnerships: Partnership[] = [];

  let runs = 0;
  let wickets = 0;
  let legalBalls = 0;
  let wides = 0;
  let noBalls = 0;
  let byes = 0;
  let legByes = 0;
  let penalties = 0;
  let freeHit = false;

  // Derived crease occupancy for the *next* delivery.
  let striker: string | null = null;
  let nonStriker: string | null = null;
  let currentBowler: string | null = null;

  // Partnership accumulator for the pair currently batting.
  let standRuns = 0;
  let standBalls = 0;
  let standA: string | null = null;
  let standB: string | null = null;

  const touchBatter = (playerId: string): BattingEntry => {
    let entry = batting.get(playerId);
    if (!entry) {
      entry = emptyBatting(playerId, batting.size + 1);
      batting.set(playerId, entry);
    }
    return entry;
  };

  const touchBowler = (playerId: string): BowlingEntry => {
    let entry = bowling.get(playerId);
    if (!entry) {
      entry = emptyBowling(playerId);
      bowling.set(playerId, entry);
    }
    return entry;
  };

  const closeStand = (forWicket: number, unbroken: boolean) => {
    if (standA && standB) {
      partnerships.push({
        batterAId: standA,
        batterBId: standB,
        runs: standRuns,
        balls: standBalls,
        forWicket,
        unbroken,
      });
    }
    standRuns = 0;
    standBalls = 0;
  };

  for (const d of deliveries) {
    const b = breakdown(d, rules);

    // The scorer recorded who was actually on strike; trust that for crediting
    // so a mid-innings correction cannot silently reassign earlier runs.
    const strikerEntry = touchBatter(d.strikerId);
    touchBatter(d.nonStrikerId);
    const bowlerEntry = touchBowler(d.bowlerId);

    // A new pair at the crease starts a new partnership.
    if (standA === null || standB === null) {
      standA = d.strikerId;
      standB = d.nonStrikerId;
    }

    // --- team totals -------------------------------------------------------
    runs += b.totalRuns;
    wides += b.wideRuns;
    noBalls += b.noBallRuns;
    byes += b.byes;
    legByes += b.legByes;
    penalties += b.penalties;

    // --- batter ------------------------------------------------------------
    strikerEntry.runs += b.runsOffBat;
    if (b.countsAsFaced) strikerEntry.balls += 1;
    if (b.runsOffBat === 4) strikerEntry.fours += 1;
    if (b.runsOffBat === 6) strikerEntry.sixes += 1;
    if (b.legal && b.runsOffBat === 0 && b.byes === 0 && b.legByes === 0) {
      strikerEntry.dots += 1;
    }

    // --- bowler ------------------------------------------------------------
    if (b.legal) bowlerEntry.legalBalls += 1;
    bowlerEntry.runsConceded += b.bowlerRuns;
    bowlerEntry.wides += b.wideRuns;
    if (b.isNoBall) bowlerEntry.noBalls += 1;
    if (b.legal && b.bowlerRuns === 0) bowlerEntry.dots += 1;

    // --- partnership -------------------------------------------------------
    standRuns += b.totalRuns;
    if (b.legal) standBalls += 1;

    if (b.legal) legalBalls += 1;

    // --- over grouping -----------------------------------------------------
    const overNumber = b.legal
      ? Math.floor((legalBalls - 1) / rules.ballsPerOver)
      : Math.floor(legalBalls / rules.ballsPerOver);
    let over = overs[overNumber];
    if (!over) {
      over = { overNumber, bowlerId: d.bowlerId, runs: 0, wickets: 0, deliveries: [], complete: false };
      overs[overNumber] = over;
    }
    over.runs += b.totalRuns;
    over.deliveries.push(d);

    // --- wicket ------------------------------------------------------------
    if (d.wicket) {
      const isRealWicket = !NON_WICKET_DISMISSALS.has(d.wicket.kind);
      const outEntry = touchBatter(d.wicket.playerOutId);
      outEntry.out = isRealWicket;
      outEntry.wicket = d.wicket;

      if (isRealWicket) {
        wickets += 1;
        over.wickets += 1;
        outEntry.fellAt = {
          runs,
          wickets,
          over: formatOvers(legalBalls, rules.ballsPerOver),
        };
        if (BOWLER_CREDITED.has(d.wicket.kind)) {
          bowlerEntry.wickets += 1;
        }
        closeStand(wickets, false);
      } else {
        // Retired not out: the pair changes but no wicket falls.
        closeStand(wickets + 1, true);
      }

      // The departing batter's slot is vacant until the next delivery names
      // their replacement.
      if (d.wicket.playerOutId === d.strikerId) {
        striker = null;
        nonStriker = d.nonStrikerId;
        standA = null;
        standB = d.nonStrikerId;
      } else {
        striker = d.strikerId;
        nonStriker = null;
        standA = d.strikerId;
        standB = null;
      }
    } else {
      striker = d.strikerId;
      nonStriker = d.nonStrikerId;
    }

    // --- strike rotation ---------------------------------------------------
    if (b.crossed % 2 === 1 && striker && nonStriker) {
      const swap = striker;
      striker = nonStriker;
      nonStriker = swap;
    }

    // --- end of over -------------------------------------------------------
    if (b.legal && legalBalls % rules.ballsPerOver === 0) {
      over.complete = true;
      const runsInOverForBowler = over.deliveries.reduce(
        (sum, x) => sum + breakdown(x, rules).bowlerRuns,
        0,
      );
      if (runsInOverForBowler === 0) bowlerEntry.maidens += 1;
      if (striker && nonStriker) {
        const swap = striker;
        striker = nonStriker;
        nonStriker = swap;
      }
      currentBowler = null;
    } else {
      currentBowler = d.bowlerId;
    }

    // --- free hit ----------------------------------------------------------
    if (b.isNoBall && rules.freeHitAfterNoBall) {
      freeHit = true;
    } else if (b.legal) {
      freeHit = false;
    }
  }

  // The pair still together at the end forms an unbroken partnership.
  if (standA && standB && (standRuns > 0 || standBalls > 0)) {
    closeStand(wickets + 1, true);
  }

  const ballsThisOver = legalBalls % rules.ballsPerOver;
  const target = config.target ?? null;

  let closed = false;
  let endReason: InningsEndReason | null = null;

  if (config.forcedEnd) {
    closed = true;
    endReason = config.forcedEnd;
  } else if (target != null && runs >= target) {
    closed = true;
    endReason = 'target_reached';
  } else if (wickets >= rules.playersPerSide - 1) {
    closed = true;
    endReason = 'all_out';
  } else if (maxOvers != null && legalBalls >= maxOvers * rules.ballsPerOver) {
    closed = true;
    endReason = 'overs_complete';
  }

  const battingList = [...batting.values()].sort((a, z) => a.battingPosition - z.battingPosition);
  const bowlingList = [...bowling.values()];

  return {
    battingTeamId: config.battingTeamId,
    bowlingTeamId: config.bowlingTeamId,
    runs,
    wickets,
    legalBalls,
    extras: {
      wides,
      noBalls,
      byes,
      legByes,
      penalties,
      total: wides + noBalls + byes + legByes + penalties,
    },
    strikerId: striker,
    nonStrikerId: nonStriker,
    bowlerId: currentBowler,
    freeHit,
    batting: battingList,
    bowling: bowlingList,
    partnerships,
    overs: overs.filter(Boolean),
    ballsThisOver,
    closed,
    endReason,
    target,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  code: string;
  message: string;
}

/**
 * Check a delivery against the laws and the match rules before it is recorded.
 *
 * The scoring console calls this so an impossible ball is rejected at the point
 * of entry rather than corrupting the innings and needing a correction later.
 */
export function validateDelivery(
  d: Delivery,
  state: InningsState,
  rules: MatchRules,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (state.closed) {
    issues.push({ code: 'innings_closed', message: 'This innings has already ended.' });
  }
  if (d.strikerId === d.nonStrikerId) {
    issues.push({ code: 'same_batter', message: 'Striker and non-striker must be different players.' });
  }
  if (d.runsOffBat < 0) {
    issues.push({ code: 'negative_runs', message: 'Runs off the bat cannot be negative.' });
  }
  if (d.wide != null && d.runsOffBat > 0) {
    issues.push({ code: 'runs_off_wide', message: 'A wide cannot also score runs off the bat.' });
  }
  if (d.wide != null && (d.byes || d.legByes)) {
    issues.push({
      code: 'byes_on_wide',
      message: 'Runs run after a wide are scored as wides, not byes or leg byes.',
    });
  }
  if (!rules.countByesOnNoBall && d.noBall && (d.byes || d.legByes)) {
    issues.push({
      code: 'byes_on_no_ball',
      message: 'This competition does not record byes off a no ball.',
    });
  }
  if (d.legByes && d.runsOffBat > 0) {
    issues.push({
      code: 'leg_byes_with_bat',
      message: 'Leg byes cannot be combined with runs off the bat.',
    });
  }

  if (d.wicket) {
    if (state.freeHit && !FREE_HIT_DISMISSALS.has(d.wicket.kind)) {
      issues.push({
        code: 'free_hit_dismissal',
        message: 'On a free hit a batter can only be run out or dismissed for obstruction.',
      });
    }
    if (d.wide != null && (d.wicket.kind === 'bowled' || d.wicket.kind === 'caught' || d.wicket.kind === 'lbw')) {
      issues.push({
        code: 'impossible_wide_dismissal',
        message: 'A batter cannot be bowled, caught or lbw off a wide.',
      });
    }
    if (d.noBall && BOWLER_CREDITED.has(d.wicket.kind) && d.wicket.kind !== 'stumped') {
      issues.push({
        code: 'impossible_no_ball_dismissal',
        message: 'Only a run out or obstruction can dismiss a batter off a no ball.',
      });
    }
    const onField = d.wicket.playerOutId === d.strikerId || d.wicket.playerOutId === d.nonStrikerId;
    if (!onField) {
      issues.push({ code: 'batter_not_at_crease', message: 'The dismissed batter is not at the crease.' });
    }
    const needsFielder = d.wicket.kind === 'caught' || d.wicket.kind === 'stumped' || d.wicket.kind === 'run_out';
    if (needsFielder && !d.wicket.fielderId) {
      issues.push({ code: 'fielder_required', message: 'Select the fielder credited with this dismissal.' });
    }
  }

  if (rules.maxOversPerBowler != null) {
    const bowler = state.bowling.find((x) => x.playerId === d.bowlerId);
    if (bowler) {
      const completed = Math.floor(bowler.legalBalls / rules.ballsPerOver);
      const midOver = bowler.legalBalls % rules.ballsPerOver !== 0;
      if (completed >= rules.maxOversPerBowler && !midOver) {
        issues.push({
          code: 'bowler_quota',
          message: `A bowler may bowl at most ${rules.maxOversPerBowler} overs in this format.`,
        });
      }
    }
  }

  // A bowler may not bowl consecutive overs.
  const lastComplete = [...state.overs].reverse().find((o) => o.complete);
  if (lastComplete && state.ballsThisOver === 0 && lastComplete.bowlerId === d.bowlerId) {
    issues.push({
      code: 'consecutive_overs',
      message: 'A bowler cannot bowl two overs in a row.',
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Live match figures
// ---------------------------------------------------------------------------

export function currentRunRate(state: InningsState, rules: MatchRules): number {
  const overs = oversDecimal(state.legalBalls, rules.ballsPerOver);
  return overs > 0 ? state.runs / overs : 0;
}

export function requiredRunRate(
  state: InningsState,
  rules: MatchRules,
  maxOvers: number | null,
): number | null {
  if (state.target == null || maxOvers == null) return null;
  const ballsLeft = maxOvers * rules.ballsPerOver - state.legalBalls;
  if (ballsLeft <= 0) return null;
  const runsNeeded = state.target - state.runs;
  return runsNeeded / oversDecimal(ballsLeft, rules.ballsPerOver);
}

export function projectedScore(
  state: InningsState,
  rules: MatchRules,
  maxOvers: number | null,
): number | null {
  if (maxOvers == null || state.legalBalls === 0) return null;
  return Math.round(currentRunRate(state, rules) * maxOvers);
}

/** A one-line chase status, e.g. "Needs 42 off 24 balls". */
export function chaseSummary(
  state: InningsState,
  rules: MatchRules,
  maxOvers: number | null,
): string | null {
  if (state.target == null) return null;
  const runsNeeded = state.target - state.runs;
  if (runsNeeded <= 0) return 'Target reached';
  const ballsLeft = maxOvers != null ? maxOvers * rules.ballsPerOver - state.legalBalls : null;
  const wicketsLeft = rules.playersPerSide - 1 - state.wickets;
  if (ballsLeft == null) return `Needs ${runsNeeded} runs with ${wicketsLeft} wickets in hand`;
  if (ballsLeft <= 0) return 'Innings complete';
  return `Needs ${runsNeeded} off ${ballsLeft} ball${ballsLeft === 1 ? '' : 's'}`;
}

/** Decide the result once both innings are closed. */
export function decideResult(
  first: InningsState,
  second: InningsState,
  rules: MatchRules,
  maxOvers: number | null,
): MatchResultInput {
  const firstRuns = first.runs;
  const secondRuns = second.runs;

  if (secondRuns > firstRuns) {
    const wicketsLeft = rules.playersPerSide - 1 - second.wickets;
    const ballsRemaining =
      maxOvers != null ? maxOvers * rules.ballsPerOver - second.legalBalls : undefined;
    return {
      kind: 'win',
      winnerTeamId: second.battingTeamId,
      byWickets: wicketsLeft,
      ballsRemaining,
    };
  }
  if (firstRuns > secondRuns) {
    return {
      kind: 'win',
      winnerTeamId: first.battingTeamId,
      byRuns: firstRuns - secondRuns,
    };
  }
  return { kind: 'tie', winnerTeamId: null };
}

/**
 * Decide a super over.
 *
 * The side scoring more in their over wins the match. If the super over is
 * itself tied, the laws now call for another one rather than counting
 * boundaries, so this reports a tie and the caller starts the next.
 */
export function decideSuperOver(
  first: InningsState,
  second: InningsState,
): MatchResultInput & { needsAnotherSuperOver: boolean } {
  if (second.runs > first.runs) {
    return {
      kind: 'win',
      winnerTeamId: second.battingTeamId,
      byWickets: 2 - second.wickets,
      needsAnotherSuperOver: false,
    };
  }
  if (first.runs > second.runs) {
    return {
      kind: 'win',
      winnerTeamId: first.battingTeamId,
      byRuns: first.runs - second.runs,
      needsAnotherSuperOver: false,
    };
  }
  return { kind: 'tie', winnerTeamId: null, needsAnotherSuperOver: true };
}

export interface MatchResultInput {
  kind: 'win' | 'tie' | 'draw' | 'no_result' | 'abandoned' | 'walkover';
  winnerTeamId: string | null;
  byRuns?: number;
  byWickets?: number;
  ballsRemaining?: number;
}

/** Render a result into the usual cricket phrasing. */
export function describeResult(
  result: MatchResultInput,
  teamName: (id: string) => string,
): string {
  switch (result.kind) {
    case 'win': {
      const name = result.winnerTeamId ? teamName(result.winnerTeamId) : 'Unknown';
      if (result.byRuns != null) {
        return `${name} won by ${result.byRuns} run${result.byRuns === 1 ? '' : 's'}`;
      }
      if (result.byWickets != null) {
        const tail =
          result.ballsRemaining != null && result.ballsRemaining > 0
            ? ` with ${result.ballsRemaining} ball${result.ballsRemaining === 1 ? '' : 's'} remaining`
            : '';
        return `${name} won by ${result.byWickets} wicket${result.byWickets === 1 ? '' : 's'}${tail}`;
      }
      return `${name} won`;
    }
    case 'tie':
      return 'Match tied';
    case 'draw':
      return 'Match drawn';
    case 'walkover': {
      const name = result.winnerTeamId ? teamName(result.winnerTeamId) : 'Unknown';
      return `${name} won by walkover`;
    }
    case 'abandoned':
      return 'Match abandoned';
    default:
      return 'No result';
  }
}
