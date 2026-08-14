import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCommentary, describeDelivery, groupByOver } from '../commentary';
import { Delivery, T20_RULES } from '../types';

const NAMES: Record<string, string> = {
  bat1: 'Hussain',
  bat2: 'Rahman',
  bowl1: 'Khan',
  field1: 'Malik',
};
const nameOf = (id: string) => NAMES[id] ?? id;
const rules = T20_RULES;

let n = 0;
function ball(partial: Partial<Delivery> = {}): Delivery {
  n += 1;
  return {
    id: `d${n}`,
    sequence: n,
    strikerId: 'bat1',
    nonStrikerId: 'bat2',
    bowlerId: 'bowl1',
    runsOffBat: 0,
    ...partial,
  };
}

const line = (d: Delivery, before = 0) => describeDelivery(d, rules, nameOf, before);

describe('commentary phrasing', () => {
  it('reads bowler to batter', () => {
    assert.equal(line(ball({ runsOffBat: 1 })).text, 'Khan to Hussain, 1 run');
  });

  it('says no run rather than 0 runs', () => {
    assert.equal(line(ball()).text, 'Khan to Hussain, no run');
  });

  it('shouts boundaries', () => {
    assert.equal(line(ball({ runsOffBat: 4 })).text, 'Khan to Hussain, FOUR');
    assert.equal(line(ball({ runsOffBat: 4 })).tone, 'boundary');
    assert.equal(line(ball({ runsOffBat: 6 })).text, 'Khan to Hussain, SIX');
    assert.equal(line(ball({ runsOffBat: 6 })).tone, 'six');
  });

  it('pluralises runs correctly', () => {
    assert.match(line(ball({ runsOffBat: 2 })).text, /2 runs$/);
    assert.match(line(ball({ runsOffBat: 1 })).text, /1 run$/);
  });

  it('describes a plain wide and a wide that was run', () => {
    assert.equal(line(ball({ wide: 0 })).text, 'Khan to Hussain, wide');
    // One penalty plus two run = three.
    assert.equal(line(ball({ wide: 2 })).text, 'Khan to Hussain, wide, 3 runs');
    assert.equal(line(ball({ wide: 0 })).tone, 'extra');
  });

  it('describes a no ball with runs off the bat', () => {
    assert.equal(line(ball({ noBall: true, runsOffBat: 4 })).text, 'Khan to Hussain, no ball, 4 runs');
  });

  it('distinguishes byes from leg byes', () => {
    assert.equal(line(ball({ byes: 1 })).text, 'Khan to Hussain, 1 bye');
    assert.equal(line(ball({ byes: 2 })).text, 'Khan to Hussain, 2 byes');
    assert.equal(line(ball({ legByes: 1 })).text, 'Khan to Hussain, 1 leg bye');
    assert.equal(line(ball({ legByes: 3 })).text, 'Khan to Hussain, 3 leg byes');
  });

  it('names the bowler for a bowled dismissal', () => {
    const l = line(ball({ wicket: { kind: 'bowled', playerOutId: 'bat1' } }));
    assert.equal(l.text, 'Khan to Hussain, OUT! Hussain bowled b Khan');
    assert.equal(l.tone, 'wicket');
    assert.equal(l.isWicket, true);
  });

  it('names the fielder for a catch', () => {
    const l = line(ball({ wicket: { kind: 'caught', playerOutId: 'bat1', fielderId: 'field1' } }));
    assert.equal(l.text, 'Khan to Hussain, OUT! Hussain caught Malik b Khan');
  });

  it('keeps the runs on a run out and does not credit the bowler', () => {
    const l = line(
      ball({ runsOffBat: 1, wicket: { kind: 'run_out', playerOutId: 'bat2', fielderId: 'field1' } }),
    );
    assert.equal(l.text, 'Khan to Hussain, 1 run — OUT! Rahman run out (Malik)');
    assert.equal(l.isWicket, true);
  });

  it('treats retiring not out as not a wicket', () => {
    const l = line(ball({ wicket: { kind: 'retired_not_out', playerOutId: 'bat1' } }));
    assert.equal(l.isWicket, false);
    assert.match(l.text, /retires not out$/);
  });

  it('flags a free hit', () => {
    assert.match(line(ball({ runsOffBat: 2, freeHit: true })).text, /\(free hit\)$/);
  });
});

describe('over markers', () => {
  it('numbers balls within the over', () => {
    assert.equal(line(ball(), 0).over, '0.1');
    assert.equal(line(ball(), 5).over, '0.6');
    assert.equal(line(ball(), 6).over, '1.1');
    assert.equal(line(ball(), 81).over, '13.4');
  });

  it('gives a wide the number of the ball it will be re-bowled as', () => {
    const feed = buildCommentary([ball({ wide: 0 }), ball({ runsOffBat: 1 })], rules, nameOf);
    // Newest first: the legal ball, then the wide, both marked 0.1.
    assert.equal(feed[1].over, '0.1');
    assert.equal(feed[0].over, '0.1');
  });
});

describe('feed', () => {
  it('returns the most recent ball first', () => {
    const feed = buildCommentary(
      [ball({ runsOffBat: 1 }), ball({ runsOffBat: 4 }), ball({ runsOffBat: 6 })],
      rules,
      nameOf,
    );
    assert.equal(feed.length, 3);
    assert.match(feed[0].text, /SIX/);
    assert.match(feed[2].text, /1 run/);
  });

  it('advances the over marker only on legal deliveries', () => {
    const feed = buildCommentary(
      [ball({ runsOffBat: 1 }), ball({ wide: 0 }), ball({ runsOffBat: 1 })],
      rules,
      nameOf,
    );
    const oldestFirst = [...feed].reverse();
    assert.deepEqual(oldestFirst.map((l) => l.over), ['0.1', '0.2', '0.2']);
  });

  it('groups into overs with running totals, newest over first', () => {
    const deliveries = [
      ...Array.from({ length: 6 }, () => ball({ runsOffBat: 1 })),
      ball({ runsOffBat: 4 }),
      ball({ wicket: { kind: 'bowled', playerOutId: 'bat1' } }),
    ];
    const overs = groupByOver(buildCommentary(deliveries, rules, nameOf));
    assert.equal(overs.length, 2);
    assert.equal(overs[0].overNumber, 1);
    assert.equal(overs[0].runs, 4);
    assert.equal(overs[0].wickets, 1);
    assert.equal(overs[1].overNumber, 0);
    assert.equal(overs[1].runs, 6);
  });
});
