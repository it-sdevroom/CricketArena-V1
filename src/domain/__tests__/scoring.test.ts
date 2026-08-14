import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildInnings,
  chaseSummary,
  currentRunRate,
  decideResult,
  decideSuperOver,
  formatOvers,
  requiredRunRate,
  validateDelivery,
} from '../scoring';
import { Delivery, MatchRules, T20_RULES, superOverRules } from '../types';

const A = 'batter-a';
const B = 'batter-b';
const C = 'batter-c';
const BOWL1 = 'bowler-1';
const BOWL2 = 'bowler-2';

const rules: MatchRules = { ...T20_RULES, playersPerSide: 11 };

let seq = 0;
function ball(partial: Partial<Delivery> = {}): Delivery {
  seq += 1;
  return {
    id: `d${seq}`,
    sequence: seq,
    strikerId: A,
    nonStrikerId: B,
    bowlerId: BOWL1,
    runsOffBat: 0,
    ...partial,
  };
}

function innings(deliveries: Delivery[], target: number | null = null) {
  return buildInnings(deliveries, {
    battingTeamId: 'team-home',
    bowlingTeamId: 'team-away',
    rules,
    target,
  });
}

describe('formatOvers', () => {
  it('renders balls as overs', () => {
    assert.equal(formatOvers(0), '0.0');
    assert.equal(formatOvers(5), '0.5');
    assert.equal(formatOvers(6), '1.0');
    assert.equal(formatOvers(75), '12.3');
  });
});

describe('runs and strike rotation', () => {
  it('credits runs to the striker and rotates on an odd score', () => {
    const s = innings([ball({ runsOffBat: 1 })]);
    assert.equal(s.runs, 1);
    assert.equal(s.legalBalls, 1);
    assert.equal(s.batting.find((x) => x.playerId === A)?.runs, 1);
    // Odd runs cross the batters over.
    assert.equal(s.strikerId, B);
    assert.equal(s.nonStrikerId, A);
  });

  it('keeps strike on an even score', () => {
    const s = innings([ball({ runsOffBat: 2 })]);
    assert.equal(s.strikerId, A);
    assert.equal(s.nonStrikerId, B);
  });

  it('swaps strike at the end of an over', () => {
    const deliveries = Array.from({ length: 6 }, () => ball({ runsOffBat: 0 }));
    const s = innings(deliveries);
    assert.equal(s.legalBalls, 6);
    assert.equal(s.ballsThisOver, 0);
    assert.equal(s.strikerId, B, 'batters change ends at the end of an over');
    assert.equal(s.overs[0].complete, true);
  });

  it('counts boundaries', () => {
    const s = innings([ball({ runsOffBat: 4 }), ball({ runsOffBat: 6 })]);
    const bat = s.batting.find((x) => x.playerId === A);
    assert.equal(bat?.fours, 1);
    assert.equal(bat?.sixes, 1);
    assert.equal(bat?.runs, 10);
    assert.equal(bat?.balls, 2);
  });
});

describe('extras', () => {
  it('adds a wide without counting a ball or a delivery faced', () => {
    const s = innings([ball({ wide: 0 })]);
    assert.equal(s.runs, 1);
    assert.equal(s.legalBalls, 0);
    assert.equal(s.extras.wides, 1);
    assert.equal(s.batting.find((x) => x.playerId === A)?.balls, 0);
    assert.equal(s.bowling[0].runsConceded, 1);
  });

  it('adds runs run on a wide to the wide total', () => {
    const s = innings([ball({ wide: 2 })]);
    assert.equal(s.runs, 3);
    assert.equal(s.extras.wides, 3);
    // Two runs were physically run, so the batters end up where they started.
    assert.equal(s.strikerId, A);
  });

  it('counts a no ball as faced but not as a legal delivery', () => {
    const s = innings([ball({ noBall: true, runsOffBat: 4 })]);
    assert.equal(s.runs, 5);
    assert.equal(s.legalBalls, 0);
    assert.equal(s.extras.noBalls, 1);
    assert.equal(s.batting.find((x) => x.playerId === A)?.runs, 4);
    assert.equal(s.batting.find((x) => x.playerId === A)?.balls, 1);
    assert.equal(s.bowling[0].runsConceded, 5);
  });

  it('does not charge byes or leg byes to the bowler', () => {
    const s = innings([ball({ byes: 4 }), ball({ legByes: 2 })]);
    assert.equal(s.runs, 6);
    assert.equal(s.extras.byes, 4);
    assert.equal(s.extras.legByes, 2);
    assert.equal(s.bowling[0].runsConceded, 0, 'byes are the keeper’s problem, not the bowler’s');
    assert.equal(s.batting.find((x) => x.playerId === A)?.runs, 0);
    assert.equal(s.batting.find((x) => x.playerId === A)?.balls, 2);
  });

  it('adds penalty runs to the total only', () => {
    const s = innings([ball({ penaltyRuns: 5 })]);
    assert.equal(s.runs, 5);
    assert.equal(s.extras.penalties, 5);
    assert.equal(s.bowling[0].runsConceded, 0);
  });
});

describe('free hit', () => {
  it('is set by a no ball and cleared by the next legal delivery', () => {
    const afterNoBall = innings([ball({ noBall: true })]);
    assert.equal(afterNoBall.freeHit, true);

    const afterLegal = innings([ball({ noBall: true }), ball({ runsOffBat: 0 })]);
    assert.equal(afterLegal.freeHit, false);
  });

  it('survives a wide, because the free hit lasts until a legal ball', () => {
    const s = innings([ball({ noBall: true }), ball({ wide: 0 })]);
    assert.equal(s.freeHit, true);
  });
});

describe('wickets', () => {
  it('credits the bowler for a bowled dismissal', () => {
    const s = innings([ball({ wicket: { kind: 'bowled', playerOutId: A } })]);
    assert.equal(s.wickets, 1);
    assert.equal(s.bowling[0].wickets, 1);
    assert.equal(s.batting.find((x) => x.playerId === A)?.out, true);
    assert.equal(s.strikerId, null, 'the incoming batter is not known yet');
  });

  it('does not credit the bowler for a run out', () => {
    const s = innings([ball({ runsOffBat: 1, wicket: { kind: 'run_out', playerOutId: B, fielderId: 'f1' } })]);
    assert.equal(s.wickets, 1);
    assert.equal(s.bowling[0].wickets, 0);
  });

  it('records the fall of wicket score', () => {
    const s = innings([
      ball({ runsOffBat: 4 }),
      ball({ runsOffBat: 2 }),
      ball({ wicket: { kind: 'lbw', playerOutId: A } }),
    ]);
    const bat = s.batting.find((x) => x.playerId === A);
    assert.deepEqual(bat?.fellAt, { runs: 6, wickets: 1, over: '0.3' });
  });

  it('treats retired not out as a change of batter, not a wicket', () => {
    const s = innings([ball({ wicket: { kind: 'retired_not_out', playerOutId: A } })]);
    assert.equal(s.wickets, 0);
    assert.equal(s.batting.find((x) => x.playerId === A)?.out, false);
  });

  it('closes the innings when the side is all out', () => {
    const deliveries: Delivery[] = [];
    for (let i = 0; i < 10; i++) {
      deliveries.push(ball({ wicket: { kind: 'bowled', playerOutId: A } }));
    }
    const s = innings(deliveries);
    assert.equal(s.wickets, 10);
    assert.equal(s.closed, true);
    assert.equal(s.endReason, 'all_out');
  });
});

describe('bowling figures', () => {
  it('counts a maiden when no runs are charged to the bowler', () => {
    const deliveries = Array.from({ length: 6 }, () => ball({ runsOffBat: 0 }));
    const s = innings(deliveries);
    assert.equal(s.bowling[0].maidens, 1);
    assert.equal(s.bowling[0].legalBalls, 6);
  });

  it('does not count a maiden when a leg bye is conceded but keeps the bowler clean', () => {
    const deliveries = Array.from({ length: 5 }, () => ball({ runsOffBat: 0 }));
    deliveries.push(ball({ legByes: 1 }));
    const s = innings(deliveries);
    assert.equal(s.bowling[0].runsConceded, 0);
    assert.equal(s.bowling[0].maidens, 1, 'leg byes do not deny the bowler a maiden');
    assert.equal(s.runs, 1);
  });

  it('splits figures between bowlers', () => {
    const first = Array.from({ length: 6 }, () => ball({ runsOffBat: 1, bowlerId: BOWL1 }));
    const second = Array.from({ length: 6 }, () => ball({ runsOffBat: 2, bowlerId: BOWL2 }));
    const s = innings([...first, ...second]);
    const b1 = s.bowling.find((x) => x.playerId === BOWL1);
    const b2 = s.bowling.find((x) => x.playerId === BOWL2);
    assert.equal(b1?.runsConceded, 6);
    assert.equal(b2?.runsConceded, 12);
    assert.equal(b1?.legalBalls, 6);
    assert.equal(b2?.legalBalls, 6);
  });
});

describe('innings closure', () => {
  it('closes when the overs run out', () => {
    const short = { ...rules, oversPerInnings: 1 };
    const deliveries = Array.from({ length: 6 }, () => ball({ runsOffBat: 1 }));
    const s = buildInnings(deliveries, {
      battingTeamId: 'h',
      bowlingTeamId: 'a',
      rules: short,
    });
    assert.equal(s.closed, true);
    assert.equal(s.endReason, 'overs_complete');
  });

  it('closes when the target is reached', () => {
    const s = innings([ball({ runsOffBat: 6 }), ball({ runsOffBat: 6 })], 11);
    assert.equal(s.runs, 12);
    assert.equal(s.closed, true);
    assert.equal(s.endReason, 'target_reached');
  });
});

describe('live figures', () => {
  it('computes run rate and required rate', () => {
    const deliveries = Array.from({ length: 12 }, () => ball({ runsOffBat: 1 }));
    const s = innings(deliveries, 101);
    assert.equal(currentRunRate(s, rules), 6);
    const rrr = requiredRunRate(s, rules, 20);
    assert.ok(rrr && rrr > 0);
    assert.equal(chaseSummary(s, rules, 20), 'Needs 89 off 108 balls');
  });
});

describe('validation', () => {
  const base = innings([]);

  it('rejects the same player at both ends', () => {
    const issues = validateDelivery(ball({ nonStrikerId: A }), base, rules);
    assert.ok(issues.some((i) => i.code === 'same_batter'));
  });

  it('rejects runs off the bat on a wide', () => {
    const issues = validateDelivery(ball({ wide: 0, runsOffBat: 2 }), base, rules);
    assert.ok(issues.some((i) => i.code === 'runs_off_wide'));
  });

  it('rejects being bowled off a wide', () => {
    const issues = validateDelivery(
      ball({ wide: 0, wicket: { kind: 'bowled', playerOutId: A } }),
      base,
      rules,
    );
    assert.ok(issues.some((i) => i.code === 'impossible_wide_dismissal'));
  });

  it('only allows a run out on a free hit', () => {
    const state = innings([ball({ noBall: true })]);
    const bowled = validateDelivery(ball({ wicket: { kind: 'bowled', playerOutId: A } }), state, rules);
    assert.ok(bowled.some((i) => i.code === 'free_hit_dismissal'));

    const runOut = validateDelivery(
      ball({ wicket: { kind: 'run_out', playerOutId: A, fielderId: 'f1' } }),
      state,
      rules,
    );
    assert.ok(!runOut.some((i) => i.code === 'free_hit_dismissal'));
  });

  it('enforces the per-bowler over quota', () => {
    const deliveries: Delivery[] = [];
    for (let over = 0; over < 4; over++) {
      for (let i = 0; i < 6; i++) deliveries.push(ball({ bowlerId: BOWL1 }));
      // A different bowler at the other end so the quota is the only issue.
      for (let i = 0; i < 6; i++) deliveries.push(ball({ bowlerId: BOWL2 }));
    }
    const state = innings(deliveries);
    const issues = validateDelivery(ball({ bowlerId: BOWL1 }), state, rules);
    assert.ok(issues.some((i) => i.code === 'bowler_quota'));
  });

  it('blocks a bowler from bowling consecutive overs', () => {
    const deliveries = Array.from({ length: 6 }, () => ball({ bowlerId: BOWL1 }));
    const state = innings(deliveries);
    const issues = validateDelivery(ball({ bowlerId: BOWL1 }), state, rules);
    assert.ok(issues.some((i) => i.code === 'consecutive_overs'));
  });

  it('requires a fielder for a catch', () => {
    const issues = validateDelivery(ball({ wicket: { kind: 'caught', playerOutId: A } }), base, rules);
    assert.ok(issues.some((i) => i.code === 'fielder_required'));
  });
});

describe('result', () => {
  it('reports a win by runs for the side batting first', () => {
    const first = innings(Array.from({ length: 6 }, () => ball({ runsOffBat: 6 })));
    const second = buildInnings(Array.from({ length: 6 }, () => ball({ runsOffBat: 1 })), {
      battingTeamId: 'team-away',
      bowlingTeamId: 'team-home',
      rules,
      target: first.runs + 1,
    });
    const r = decideResult(first, second, rules, 20);
    assert.equal(r.kind, 'win');
    assert.equal(r.winnerTeamId, 'team-home');
    assert.equal(r.byRuns, 30);
  });

  it('reports a win by wickets for the side chasing', () => {
    const first = innings([ball({ runsOffBat: 4 })]);
    const second = buildInnings([ball({ runsOffBat: 6 })], {
      battingTeamId: 'team-away',
      bowlingTeamId: 'team-home',
      rules,
      target: 5,
    });
    const r = decideResult(first, second, rules, 20);
    assert.equal(r.winnerTeamId, 'team-away');
    assert.equal(r.byWickets, 10);
  });

  it('reports a tie on level scores', () => {
    const first = innings([ball({ runsOffBat: 4 })]);
    const second = buildInnings([ball({ runsOffBat: 4 })], {
      battingTeamId: 'team-away',
      bowlingTeamId: 'team-home',
      rules,
      target: 5,
    });
    assert.equal(decideResult(first, second, rules, 20).kind, 'tie');
  });
});

describe('super over', () => {
  const so = superOverRules(rules);

  function superInnings(deliveries: Delivery[], battingTeamId: string, target: number | null = null) {
    return buildInnings(deliveries, {
      battingTeamId,
      bowlingTeamId: battingTeamId === 'team-home' ? 'team-away' : 'team-home',
      rules: so,
      target,
    });
  }

  it('is one over long', () => {
    assert.equal(so.oversPerInnings, 1);
    const s = superInnings(Array.from({ length: 6 }, () => ball({ runsOffBat: 1 })), 'team-home');
    assert.equal(s.closed, true);
    assert.equal(s.endReason, 'overs_complete');
  });

  it('ends after two wickets, not ten', () => {
    const s = superInnings(
      [
        ball({ wicket: { kind: 'bowled', playerOutId: A } }),
        ball({ strikerId: C, wicket: { kind: 'bowled', playerOutId: C } }),
      ],
      'team-home',
    );
    assert.equal(s.wickets, 2);
    assert.equal(s.closed, true);
    assert.equal(s.endReason, 'all_out');
  });

  it('still ends the chase early when the target is passed', () => {
    const s = superInnings([ball({ runsOffBat: 6 }), ball({ runsOffBat: 6 })], 'team-away', 11);
    assert.equal(s.closed, true);
    assert.equal(s.endReason, 'target_reached');
  });

  it('gives the match to whoever scored more', () => {
    const first = superInnings(Array.from({ length: 6 }, () => ball({ runsOffBat: 2 })), 'team-home');
    const second = superInnings(Array.from({ length: 6 }, () => ball({ runsOffBat: 1 })), 'team-away', 13);
    const r = decideSuperOver(first, second);
    assert.equal(r.winnerTeamId, 'team-home');
    assert.equal(r.byRuns, 6);
    assert.equal(r.needsAnotherSuperOver, false);
  });

  it('asks for another super over when that one ties too', () => {
    const first = superInnings([ball({ runsOffBat: 4 })], 'team-home');
    const second = superInnings([ball({ runsOffBat: 4 })], 'team-away', 5);
    const r = decideSuperOver(first, second);
    assert.equal(r.kind, 'tie');
    assert.equal(r.needsAnotherSuperOver, true);
  });

  it('keeps the underlying laws, so a wide is still not a legal ball', () => {
    const s = superInnings([ball({ wide: 0 })], 'team-home');
    assert.equal(s.runs, 1);
    assert.equal(s.legalBalls, 0);
    assert.equal(s.closed, false);
  });
});
