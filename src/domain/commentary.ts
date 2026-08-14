/**
 * Turn a delivery into a line of commentary.
 *
 * Pure, and separate from the rendering, so the phrasing can be tested and so
 * the same text can be reused for a share card or a push notification later.
 *
 * The wording follows how scorers actually read a card aloud: the bowler to
 * the batter, then what happened. We have no shot descriptions — nobody is
 * typing "driven through the covers" while also counting the over — so the
 * text stays factual and lets the numbers carry it.
 */

import { breakdown } from './scoring';
import type { Delivery, DismissalKind, MatchRules } from './types';

export interface CommentaryLine {
  deliveryId: string;
  /** "13.4", or "13.4a" style marker for deliveries that did not count. */
  over: string;
  text: string;
  /** Drives the accent colour in the feed. */
  tone: 'normal' | 'boundary' | 'six' | 'wicket' | 'extra';
  runs: number;
  isWicket: boolean;
}

const DISMISSAL_TEXT: Record<DismissalKind, string> = {
  bowled: 'bowled',
  caught: 'caught',
  caught_behind: 'caught behind',
  caught_and_bowled: 'caught and bowled',
  lbw: 'lbw',
  stumped: 'stumped',
  hit_wicket: 'hit wicket',
  run_out: 'run out',
  obstructing_the_field: 'obstructing the field',
  hit_ball_twice: 'hit the ball twice',
  timed_out: 'timed out',
  retired_out: 'retired out',
  retired_not_out: 'retired not out',
};

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** The scoring part of the line, before any dismissal. */
function outcomeText(d: Delivery, rules: MatchRules): { text: string; tone: CommentaryLine['tone'] } {
  const b = breakdown(d, rules);

  if (b.isWide) {
    const extra = d.wide || 0;
    return {
      text: extra > 0 ? `wide, ${plural(extra + rules.wideRuns, 'run')}` : 'wide',
      tone: 'extra',
    };
  }

  if (b.isNoBall) {
    const parts = ['no ball'];
    if (b.runsOffBat > 0) parts.push(plural(b.runsOffBat, 'run'));
    if (b.byes > 0) parts.push(plural(b.byes, 'bye'));
    if (b.legByes > 0) parts.push(`${b.legByes} leg ${b.legByes === 1 ? 'bye' : 'byes'}`);
    return { text: parts.join(', '), tone: 'extra' };
  }

  if (b.byes > 0) return { text: plural(b.byes, 'bye'), tone: 'extra' };
  if (b.legByes > 0) {
    return { text: `${b.legByes} leg ${b.legByes === 1 ? 'bye' : 'byes'}`, tone: 'extra' };
  }
  if (b.penalties > 0) return { text: `${b.penalties} penalty runs`, tone: 'extra' };

  if (b.runsOffBat === 6) return { text: 'SIX', tone: 'six' };
  if (b.runsOffBat === 4) return { text: 'FOUR', tone: 'boundary' };
  if (b.runsOffBat === 0) return { text: 'no run', tone: 'normal' };
  return { text: plural(b.runsOffBat, 'run'), tone: 'normal' };
}

export interface CommentaryNames {
  (playerId: string): string;
}

/**
 * Build the commentary line for one delivery.
 *
 * `legalBallsBefore` is how many legal deliveries had been bowled beforehand,
 * which is what gives the "13.4" marker — a wide or no ball carries the number
 * of the ball it will be re-bowled as.
 */
export function describeDelivery(
  d: Delivery,
  rules: MatchRules,
  names: CommentaryNames,
  legalBallsBefore: number,
): CommentaryLine {
  const b = breakdown(d, rules);
  const outcome = outcomeText(d, rules);

  const overNumber = Math.floor(legalBallsBefore / rules.ballsPerOver);
  const ballInOver = (legalBallsBefore % rules.ballsPerOver) + 1;
  const over = `${overNumber}.${ballInOver}`;

  const bowler = names(d.bowlerId);
  const striker = names(d.strikerId);

  let text = `${bowler} to ${striker}, ${outcome.text}`;
  let tone = outcome.tone;

  if (d.wicket) {
    const kind = DISMISSAL_TEXT[d.wicket.kind] ?? 'out';
    const who = names(d.wicket.playerOutId);
    const fielder = d.wicket.fielderId ? names(d.wicket.fielderId) : null;

    if (d.wicket.kind === 'retired_not_out') {
      text = `${bowler} to ${striker}, ${outcome.text} — ${who} retires not out`;
    } else if (d.wicket.kind === 'run_out') {
      text = `${bowler} to ${striker}, ${outcome.text} — OUT! ${who} run out${fielder ? ` (${fielder})` : ''}`;
      tone = 'wicket';
    } else if (fielder && (d.wicket.kind === 'caught' || d.wicket.kind === 'stumped')) {
      text = `${bowler} to ${striker}, OUT! ${who} ${kind} ${fielder} b ${bowler}`;
      tone = 'wicket';
    } else {
      text = `${bowler} to ${striker}, OUT! ${who} ${kind} b ${bowler}`;
      tone = 'wicket';
    }
  }

  if (d.freeHit && !d.wicket) {
    text = `${text} (free hit)`;
  }

  return {
    deliveryId: d.id,
    over,
    text,
    tone,
    runs: b.totalRuns,
    isWicket: !!d.wicket && d.wicket.kind !== 'retired_not_out',
  };
}

/**
 * Build the whole feed, newest ball first.
 *
 * Walks forwards to count legal deliveries — the over marker depends on
 * everything before it — then reverses, because a commentary feed reads from
 * the most recent ball.
 */
export function buildCommentary(
  deliveries: Delivery[],
  rules: MatchRules,
  names: CommentaryNames,
): CommentaryLine[] {
  const lines: CommentaryLine[] = [];
  let legal = 0;

  for (const d of deliveries) {
    lines.push(describeDelivery(d, rules, names, legal));
    if (breakdown(d, rules).legal) legal += 1;
  }

  return lines.reverse();
}

/** Group a feed into overs, so the UI can print an "end of over" summary. */
export interface CommentaryOver {
  overNumber: number;
  lines: CommentaryLine[];
  runs: number;
  wickets: number;
}

export function groupByOver(lines: CommentaryLine[]): CommentaryOver[] {
  const groups = new Map<number, CommentaryOver>();

  for (const line of lines) {
    const overNumber = Number(line.over.split('.')[0]);
    let group = groups.get(overNumber);
    if (!group) {
      group = { overNumber, lines: [], runs: 0, wickets: 0 };
      groups.set(overNumber, group);
    }
    group.lines.push(line);
    group.runs += line.runs;
    if (line.isWicket) group.wickets += 1;
  }

  return [...groups.values()].sort((a, z) => z.overNumber - a.overNumber);
}
