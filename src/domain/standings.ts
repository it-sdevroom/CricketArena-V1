/**
 * Points tables and net run rate.
 *
 * NRR follows the ICC definition: runs scored per over faced minus runs
 * conceded per over bowled, across the whole competition. The subtlety that
 * catches most implementations out is that a side bowled out is charged its
 * *full quota* of overs, not the overs it actually faced — otherwise being
 * dismissed cheaply would flatter your run rate.
 */

export interface PointsRules {
  win: number;
  loss: number;
  tie: number;
  noResult: number;
  /** Award a bonus point to a side winning with a large enough margin. */
  bonusPointEnabled: boolean;
  /** Run-rate ratio above which a bonus point is awarded (e.g. 1.25). */
  bonusPointRunRateRatio: number;
}

export const DEFAULT_POINTS: PointsRules = {
  win: 2,
  loss: 0,
  tie: 1,
  noResult: 1,
  bonusPointEnabled: false,
  bonusPointRunRateRatio: 1.25,
};

/** One side's contribution from a single completed match. */
export interface TeamMatchRecord {
  teamId: string;
  opponentId: string;
  outcome: 'win' | 'loss' | 'tie' | 'no_result' | 'walkover_win' | 'walkover_loss';
  runsScored: number;
  ballsFaced: number;
  /** True when the side was bowled out, which forces the full quota of overs. */
  allOut: boolean;
  runsConceded: number;
  ballsBowled: number;
  /** True when the opposition was bowled out. */
  opponentAllOut: boolean;
  /** Full overs allotted for the innings, used when a side is all out. */
  maxOvers: number | null;
  ballsPerOver: number;
}

export interface StandingsRow {
  teamId: string;
  played: number;
  won: number;
  lost: number;
  tied: number;
  noResult: number;
  points: number;
  bonusPoints: number;
  runsScored: number;
  oversFaced: number;
  runsConceded: number;
  oversBowled: number;
  netRunRate: number;
  /** Recent form, most recent first: 'W' | 'L' | 'T' | 'N'. */
  form: string[];
}

function chargedOvers(
  ballsUsed: number,
  allOut: boolean,
  maxOvers: number | null,
  ballsPerOver: number,
): number {
  if (allOut && maxOvers != null) return maxOvers;
  return ballsUsed / ballsPerOver;
}

/**
 * Build a points table from every completed match record.
 *
 * `records` should contain two entries per match, one from each side's view.
 */
export function buildStandings(
  records: TeamMatchRecord[],
  rules: PointsRules = DEFAULT_POINTS,
): StandingsRow[] {
  const rows = new Map<string, StandingsRow>();

  const touch = (teamId: string): StandingsRow => {
    let row = rows.get(teamId);
    if (!row) {
      row = {
        teamId,
        played: 0,
        won: 0,
        lost: 0,
        tied: 0,
        noResult: 0,
        points: 0,
        bonusPoints: 0,
        runsScored: 0,
        oversFaced: 0,
        runsConceded: 0,
        oversBowled: 0,
        netRunRate: 0,
        form: [],
      };
      rows.set(teamId, row);
    }
    return row;
  };

  for (const r of records) {
    const row = touch(r.teamId);
    row.played += 1;

    switch (r.outcome) {
      case 'win':
      case 'walkover_win':
        row.won += 1;
        row.points += rules.win;
        row.form.unshift('W');
        break;
      case 'loss':
      case 'walkover_loss':
        row.lost += 1;
        row.points += rules.loss;
        row.form.unshift('L');
        break;
      case 'tie':
        row.tied += 1;
        row.points += rules.tie;
        row.form.unshift('T');
        break;
      default:
        row.noResult += 1;
        row.points += rules.noResult;
        row.form.unshift('N');
        break;
    }

    // A walkover carries points but must not distort run rate.
    if (r.outcome === 'walkover_win' || r.outcome === 'walkover_loss' || r.outcome === 'no_result') {
      continue;
    }

    const faced = chargedOvers(r.ballsFaced, r.allOut, r.maxOvers, r.ballsPerOver);
    const bowled = chargedOvers(r.ballsBowled, r.opponentAllOut, r.maxOvers, r.ballsPerOver);

    row.runsScored += r.runsScored;
    row.oversFaced += faced;
    row.runsConceded += r.runsConceded;
    row.oversBowled += bowled;

    if (rules.bonusPointEnabled && r.outcome === 'win' && faced > 0 && bowled > 0) {
      const ourRate = r.runsScored / faced;
      const theirRate = r.runsConceded / bowled;
      if (theirRate > 0 && ourRate / theirRate >= rules.bonusPointRunRateRatio) {
        row.bonusPoints += 1;
        row.points += 1;
      }
    }
  }

  const list = [...rows.values()];
  for (const row of list) {
    const scoredRate = row.oversFaced > 0 ? row.runsScored / row.oversFaced : 0;
    const concededRate = row.oversBowled > 0 ? row.runsConceded / row.oversBowled : 0;
    row.netRunRate = Number((scoredRate - concededRate).toFixed(3));
    row.form = row.form.slice(0, 5);
  }

  return sortStandings(list, records);
}

/**
 * Order the table: points, then net run rate, then head-to-head, then wins.
 */
export function sortStandings(rows: StandingsRow[], records: TeamMatchRecord[]): StandingsRow[] {
  const headToHead = (a: string, z: string): number => {
    const meetings = records.filter((r) => r.teamId === a && r.opponentId === z);
    const aWins = meetings.filter((r) => r.outcome === 'win' || r.outcome === 'walkover_win').length;
    const zWins = meetings.filter((r) => r.outcome === 'loss' || r.outcome === 'walkover_loss').length;
    return zWins - aWins;
  };

  return [...rows].sort((a, z) => {
    if (z.points !== a.points) return z.points - a.points;
    if (z.netRunRate !== a.netRunRate) return z.netRunRate - a.netRunRate;
    const h2h = headToHead(a.teamId, z.teamId);
    if (h2h !== 0) return h2h;
    if (z.won !== a.won) return z.won - a.won;
    return a.teamId.localeCompare(z.teamId);
  });
}

/** Format an NRR for display, always signed, e.g. "+1.204". */
export function formatNetRunRate(nrr: number): string {
  const sign = nrr > 0 ? '+' : nrr < 0 ? '−' : '';
  return `${sign}${Math.abs(nrr).toFixed(3)}`;
}

// ---------------------------------------------------------------------------
// Player leaderboards
// ---------------------------------------------------------------------------

export interface BattingAggregate {
  playerId: string;
  innings: number;
  notOuts: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  fifties: number;
  hundreds: number;
  highScore: number;
  highScoreNotOut: boolean;
}

export interface BowlingAggregate {
  playerId: string;
  innings: number;
  legalBalls: number;
  runsConceded: number;
  wickets: number;
  maidens: number;
  bestWickets: number;
  bestRuns: number;
  fourWicketHauls: number;
  fiveWicketHauls: number;
}

export function battingAverage(a: BattingAggregate): number | null {
  const dismissals = a.innings - a.notOuts;
  return dismissals > 0 ? a.runs / dismissals : null;
}

export function strikeRate(a: BattingAggregate): number {
  return a.balls > 0 ? (a.runs / a.balls) * 100 : 0;
}

export function bowlingAverage(a: BowlingAggregate): number | null {
  return a.wickets > 0 ? a.runsConceded / a.wickets : null;
}

export function economyRate(a: BowlingAggregate, ballsPerOver = 6): number {
  const overs = a.legalBalls / ballsPerOver;
  return overs > 0 ? a.runsConceded / overs : 0;
}

export function bowlingStrikeRate(a: BowlingAggregate): number | null {
  return a.wickets > 0 ? a.legalBalls / a.wickets : null;
}

/** Best bowling figures as the conventional "5/23". */
export function formatBest(a: BowlingAggregate): string {
  return a.wickets > 0 || a.bestWickets > 0 ? `${a.bestWickets}/${a.bestRuns}` : '—';
}

/** Highest score as "87*" when not out. */
export function formatHighScore(a: BattingAggregate): string {
  if (a.innings === 0) return '—';
  return `${a.highScore}${a.highScoreNotOut ? '*' : ''}`;
}
