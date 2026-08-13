import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { doubleRoundRobin, generateFixtures, groupStage, knockout, roundRobin } from '../fixtures';
import { DEFAULT_POINTS, TeamMatchRecord, buildStandings, formatNetRunRate } from '../standings';

const teams = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);

describe('round robin', () => {
  it('plays every pair exactly once', () => {
    const ids = teams(6);
    const fixtures = roundRobin(ids);
    assert.equal(fixtures.length, 15, '6 teams -> 15 matches');

    const pairs = new Set(
      fixtures.map((f) => [f.homeTeamId, f.awayTeamId].sort().join('|')),
    );
    assert.equal(pairs.size, 15, 'no pair repeats');
  });

  it('gives every side one match per round', () => {
    const fixtures = roundRobin(teams(8));
    const byRound = new Map<number, string[]>();
    for (const f of fixtures) {
      const list = byRound.get(f.round) ?? [];
      list.push(f.homeTeamId!, f.awayTeamId!);
      byRound.set(f.round, list);
    }
    assert.equal(byRound.size, 7);
    for (const [round, sides] of byRound) {
      assert.equal(new Set(sides).size, sides.length, `round ${round} has no side twice`);
    }
  });

  it('handles an odd number of sides with byes', () => {
    const fixtures = roundRobin(teams(5));
    assert.equal(fixtures.length, 10, '5 teams -> 10 matches');
    // Five rounds, each with one side resting.
    assert.equal(Math.max(...fixtures.map((f) => f.round)), 5);
  });

  it('refuses to build a fixture list for fewer than two sides', () => {
    assert.deepEqual(roundRobin(['solo']), []);
  });
});

describe('double round robin', () => {
  it('doubles the fixture count and reverses home advantage', () => {
    const ids = teams(4);
    const single = roundRobin(ids);
    const double = doubleRoundRobin(ids);
    assert.equal(double.length, single.length * 2);

    const first = double[0];
    const ret = double[single.length];
    assert.equal(ret.homeTeamId, first.awayTeamId);
    assert.equal(ret.awayTeamId, first.homeTeamId);
  });
});

describe('group stage', () => {
  it('splits sides across groups and plays a round robin in each', () => {
    const fixtures = groupStage(teams(8), 2);
    const groups = new Set(fixtures.map((f) => f.group));
    assert.deepEqual([...groups].sort(), ['A', 'B']);
    // Two groups of four -> six matches each.
    assert.equal(fixtures.length, 12);
    assert.ok(fixtures.every((f) => f.stage === 'group'));
  });
});

describe('knockout', () => {
  it('builds a full bracket for a power-of-two field', () => {
    const fixtures = knockout(teams(8));
    assert.equal(fixtures.length, 7, 'quarters + semis + final');
    assert.equal(fixtures.filter((f) => f.stage === 'quarter_final').length, 4);
    assert.equal(fixtures.filter((f) => f.stage === 'semi_final').length, 2);
    assert.equal(fixtures.filter((f) => f.stage === 'final').length, 1);
  });

  it('seeds the top side against the bottom side', () => {
    const fixtures = knockout(teams(4));
    const first = fixtures[0];
    assert.equal(first.homeTeamId, 't1');
    assert.equal(first.awayTeamId, 't4');
  });

  it('gives top seeds a bye when the field is not a power of two', () => {
    const fixtures = knockout(teams(6));
    const round1 = fixtures.filter((f) => f.round === 1);
    // An 8-slot bracket: two matches have an empty side, which is the bye.
    assert.equal(round1.length, 4);
    assert.equal(round1.filter((f) => f.awayTeamId === null).length, 2);
  });

  it('can add a third-place play-off', () => {
    const fixtures = knockout(teams(4), true);
    assert.ok(fixtures.some((f) => f.stage === 'third_place'));
  });
});

describe('generateFixtures', () => {
  it('dispatches on format', () => {
    assert.equal(generateFixtures({ format: 'round_robin', teamIds: teams(4) }).length, 6);
    assert.equal(generateFixtures({ format: 'double_round_robin', teamIds: teams(4) }).length, 12);
    assert.equal(generateFixtures({ format: 'knockout', teamIds: teams(4) }).length, 3);
    assert.equal(generateFixtures({ format: 'custom', teamIds: teams(4) }).length, 0);
  });

  it('adds the play-off ladder after a league', () => {
    const fixtures = generateFixtures({ format: 'league_playoffs', teamIds: teams(4) });
    assert.equal(fixtures.filter((f) => f.stage === 'qualifier').length, 2);
    assert.equal(fixtures.filter((f) => f.stage === 'eliminator').length, 1);
    assert.equal(fixtures.filter((f) => f.stage === 'final').length, 1);
  });
});

// ---------------------------------------------------------------------------

function record(partial: Partial<TeamMatchRecord> & { teamId: string; opponentId: string }): TeamMatchRecord {
  return {
    outcome: 'win',
    runsScored: 160,
    ballsFaced: 120,
    allOut: false,
    runsConceded: 140,
    ballsBowled: 120,
    opponentAllOut: false,
    maxOvers: 20,
    ballsPerOver: 6,
    ...partial,
  };
}

describe('standings', () => {
  it('awards points by outcome', () => {
    const rows = buildStandings([
      record({ teamId: 'a', opponentId: 'b', outcome: 'win' }),
      record({ teamId: 'b', opponentId: 'a', outcome: 'loss', runsScored: 140, runsConceded: 160 }),
      record({ teamId: 'c', opponentId: 'd', outcome: 'tie' }),
      record({ teamId: 'd', opponentId: 'c', outcome: 'tie' }),
    ]);
    const byId = Object.fromEntries(rows.map((r) => [r.teamId, r]));
    assert.equal(byId.a.points, 2);
    assert.equal(byId.b.points, 0);
    assert.equal(byId.c.points, 1);
    assert.equal(byId.a.won, 1);
    assert.equal(byId.b.lost, 1);
  });

  it('computes net run rate from runs and overs', () => {
    const rows = buildStandings([
      record({ teamId: 'a', opponentId: 'b', runsScored: 180, ballsFaced: 120, runsConceded: 150, ballsBowled: 120 }),
    ]);
    // 180/20 - 150/20 = 9 - 7.5 = 1.5
    assert.equal(rows[0].netRunRate, 1.5);
  });

  it('charges a side bowled out with its full quota of overs', () => {
    const bowledOut = buildStandings([
      record({
        teamId: 'a',
        opponentId: 'b',
        runsScored: 100,
        ballsFaced: 60,
        allOut: true,
        runsConceded: 101,
        ballsBowled: 120,
        outcome: 'loss',
      }),
    ]);
    // Scored 100 but charged the full 20 overs, not the 10 actually faced.
    // 100/20 - 101/20 = -0.05
    assert.equal(bowledOut[0].netRunRate, -0.05);
    assert.equal(bowledOut[0].oversFaced, 20);
  });

  it('excludes a no result from run rate but still awards a point', () => {
    const rows = buildStandings([record({ teamId: 'a', opponentId: 'b', outcome: 'no_result' })]);
    assert.equal(rows[0].points, DEFAULT_POINTS.noResult);
    assert.equal(rows[0].oversFaced, 0);
    assert.equal(rows[0].netRunRate, 0);
  });

  it('sorts on points, then net run rate', () => {
    const rows = buildStandings([
      record({ teamId: 'a', opponentId: 'x', outcome: 'win', runsScored: 150, runsConceded: 149 }),
      record({ teamId: 'b', opponentId: 'y', outcome: 'win', runsScored: 200, runsConceded: 100 }),
      record({ teamId: 'c', opponentId: 'z', outcome: 'loss', runsScored: 100, runsConceded: 200 }),
    ]);
    assert.deepEqual(rows.map((r) => r.teamId), ['b', 'a', 'c']);
  });

  it('breaks a points and NRR tie on head-to-head', () => {
    const rows = buildStandings([
      record({ teamId: 'a', opponentId: 'b', outcome: 'win', runsScored: 150, runsConceded: 140 }),
      record({ teamId: 'b', opponentId: 'a', outcome: 'loss', runsScored: 140, runsConceded: 150 }),
      record({ teamId: 'a', opponentId: 'c', outcome: 'loss', runsScored: 140, runsConceded: 150 }),
      record({ teamId: 'b', opponentId: 'c', outcome: 'win', runsScored: 150, runsConceded: 140 }),
    ]);
    const a = rows.find((r) => r.teamId === 'a')!;
    const b = rows.find((r) => r.teamId === 'b')!;
    assert.equal(a.points, b.points);
    assert.ok(rows.indexOf(a) < rows.indexOf(b), 'a beat b, so a is placed above');
  });

  it('awards a bonus point for a dominant win when enabled', () => {
    const rows = buildStandings(
      [record({ teamId: 'a', opponentId: 'b', outcome: 'win', runsScored: 200, runsConceded: 120 })],
      { ...DEFAULT_POINTS, bonusPointEnabled: true },
    );
    assert.equal(rows[0].bonusPoints, 1);
    assert.equal(rows[0].points, 3);
  });

  it('tracks recent form newest first', () => {
    const rows = buildStandings([
      record({ teamId: 'a', opponentId: 'b', outcome: 'win' }),
      record({ teamId: 'a', opponentId: 'c', outcome: 'loss', runsScored: 100, runsConceded: 200 }),
    ]);
    assert.deepEqual(rows[0].form, ['L', 'W']);
  });
});

describe('formatNetRunRate', () => {
  it('always shows a sign', () => {
    assert.equal(formatNetRunRate(1.2), '+1.200');
    assert.equal(formatNetRunRate(-0.5), '−0.500');
    assert.equal(formatNetRunRate(0), '0.000');
  });
});
