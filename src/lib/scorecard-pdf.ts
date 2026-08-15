/**
 * Export a full scorecard as a PDF and hand it to the share sheet.
 *
 * Organisers want to drop a scorecard into a WhatsApp group the moment a match
 * ends, so the output is a single page that reads like a printed card rather
 * than a screenshot of the app: light background, black text, no dark theme
 * that would drink a printer's ink.
 *
 * On the web there is no share sheet and no file system, so the same HTML goes
 * to a print dialogue instead — from which the browser can "save as PDF".
 */

import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { formatOvers } from '@/src/domain/scoring';
import type { InningsState, MatchRules } from '@/src/domain/types';

export interface ScorecardInput {
  matchLabel: string;
  tournamentName?: string | null;
  venueName?: string | null;
  playedOn?: string | null;
  resultSummary?: string | null;
  rules: MatchRules;
  innings: InningsState[];
  teamName: (id: string) => string;
  playerName: (id: string) => string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** How a batter's dismissal is written on a printed card. */
function dismissalText(
  entry: InningsState['batting'][number],
  playerName: (id: string) => string,
  bowlerFor: (playerId: string) => string | null,
): string {
  if (!entry.wicket) return 'not out';

  const w = entry.wicket;
  const fielder = w.fielderId ? playerName(w.fielderId) : null;
  const bowler = bowlerFor(entry.playerId);

  switch (w.kind) {
    case 'bowled':
      return `b ${bowler ?? ''}`.trim();
    case 'lbw':
      return `lbw b ${bowler ?? ''}`.trim();
    case 'caught':
    case 'caught_behind':
      return `c ${fielder ?? '?'} b ${bowler ?? ''}`.trim();
    case 'caught_and_bowled':
      return `c & b ${bowler ?? ''}`.trim();
    case 'stumped':
      return `st ${fielder ?? '?'} b ${bowler ?? ''}`.trim();
    case 'hit_wicket':
      return `hit wicket b ${bowler ?? ''}`.trim();
    case 'run_out':
      return `run out (${fielder ?? '?'})`;
    case 'retired_not_out':
      return 'retired not out';
    case 'retired_out':
      return 'retired out';
    default:
      return w.kind.replace(/_/g, ' ');
  }
}

function inningsHtml(
  state: InningsState,
  input: ScorecardInput,
  index: number,
): string {
  const { rules, teamName, playerName } = input;

  // Who dismissed whom: the delivery that took each wicket names the bowler.
  const bowlerByVictim = new Map<string, string>();
  for (const over of state.overs) {
    for (const d of over.deliveries) {
      if (d.wicket) bowlerByVictim.set(d.wicket.playerOutId, playerName(d.bowlerId));
    }
  }

  const batting = state.batting
    .filter((b) => b.balls > 0 || b.out)
    .map((b) => {
      const how = dismissalText(b, playerName, (id) => bowlerByVictim.get(id) ?? null);
      const sr = b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(1) : '—';
      return `<tr>
        <td class="name">${escapeHtml(playerName(b.playerId))}${b.out ? '' : ' <span class="no">*</span>'}</td>
        <td class="how">${escapeHtml(how)}</td>
        <td class="n b">${b.runs}</td>
        <td class="n">${b.balls}</td>
        <td class="n">${b.fours}</td>
        <td class="n">${b.sixes}</td>
        <td class="n">${sr}</td>
      </tr>`;
    })
    .join('');

  const bowling = state.bowling
    .filter((b) => b.legalBalls > 0)
    .map((b) => {
      const overs = formatOvers(b.legalBalls, rules.ballsPerOver);
      const econ = b.legalBalls > 0 ? (b.runsConceded / (b.legalBalls / rules.ballsPerOver)).toFixed(2) : '—';
      return `<tr>
        <td class="name">${escapeHtml(playerName(b.playerId))}</td>
        <td class="n">${overs}</td>
        <td class="n">${b.maidens}</td>
        <td class="n">${b.runsConceded}</td>
        <td class="n b">${b.wickets}</td>
        <td class="n">${econ}</td>
      </tr>`;
    })
    .join('');

  const fow = state.batting
    .filter((b) => b.fellAt)
    .sort((a, z) => (a.fellAt!.wickets - z.fellAt!.wickets))
    .map((b) => `${b.fellAt!.wickets}-${b.fellAt!.runs} (${escapeHtml(playerName(b.playerId))}, ${b.fellAt!.over})`)
    .join(' &nbsp;·&nbsp; ');

  const e = state.extras;

  return `
  <section class="innings">
    <h2>${escapeHtml(teamName(state.battingTeamId))}
      <span class="total">${state.runs}/${state.wickets}</span>
      <span class="ov">(${formatOvers(state.legalBalls, rules.ballsPerOver)} ov)</span>
    </h2>

    <table class="card">
      <thead><tr><th>Batter</th><th></th><th class="n">R</th><th class="n">B</th><th class="n">4s</th><th class="n">6s</th><th class="n">SR</th></tr></thead>
      <tbody>${batting}</tbody>
    </table>

    <p class="extras">
      <strong>Extras</strong> ${e.total}
      (b ${e.byes}, lb ${e.legByes}, w ${e.wides}, nb ${e.noBalls}${e.penalties ? `, pen ${e.penalties}` : ''})
    </p>

    ${fow ? `<p class="fow"><strong>Fall of wickets</strong> ${fow}</p>` : ''}

    <table class="card">
      <thead><tr><th>Bowler</th><th class="n">O</th><th class="n">M</th><th class="n">R</th><th class="n">W</th><th class="n">Econ</th></tr></thead>
      <tbody>${bowling}</tbody>
    </table>
  </section>`;
}

export function buildScorecardHtml(input: ScorecardInput): string {
  const header = [input.tournamentName, input.venueName, input.playedOn]
    .filter(Boolean)
    .map((x) => escapeHtml(String(x)))
    .join(' &nbsp;·&nbsp; ');

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @page { margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color: #10201b; margin: 0; font-size: 12px; }
  header { border-bottom: 3px solid #0E2822; padding-bottom: 10px; margin-bottom: 18px; }
  h1 { margin: 0 0 4px; font-size: 20px; letter-spacing: -0.2px; }
  .meta { color: #5c716a; font-size: 11px; }
  .result { margin-top: 8px; font-weight: 700; color: #12805a; font-size: 13px; }
  .innings { margin-bottom: 26px; page-break-inside: avoid; }
  h2 { font-size: 14px; margin: 0 0 8px; padding-bottom: 5px; border-bottom: 1px solid #d8e2de; }
  h2 .total { float: right; font-size: 15px; }
  h2 .ov { float: right; font-weight: 400; color: #5c716a; margin-left: 8px; font-size: 11px; }
  table.card { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  table.card th { text-align: left; font-size: 9px; text-transform: uppercase;
                  letter-spacing: 0.7px; color: #5c716a; border-bottom: 1px solid #d8e2de;
                  padding: 4px 5px; }
  table.card td { padding: 4px 5px; border-bottom: 1px solid #eef3f1; }
  td.n, th.n { text-align: right; width: 42px; }
  td.b { font-weight: 700; }
  td.name { font-weight: 600; white-space: nowrap; }
  td.how { color: #5c716a; font-size: 11px; }
  .no { color: #12805a; font-weight: 700; }
  .extras, .fow { margin: 4px 0 10px; font-size: 11px; color: #3d504a; }
  footer { margin-top: 22px; padding-top: 8px; border-top: 1px solid #d8e2de;
           color: #8a9c96; font-size: 9px; text-align: center; }
</style></head>
<body>
  <header>
    <h1>${escapeHtml(input.matchLabel)}</h1>
    ${header ? `<div class="meta">${header}</div>` : ''}
    ${input.resultSummary ? `<div class="result">${escapeHtml(input.resultSummary)}</div>` : ''}
  </header>
  ${input.innings.map((s, i) => inningsHtml(s, input, i)).join('')}
  <footer>Generated by Cricket Arena</footer>
</body></html>`;
}

/**
 * Produce the PDF and offer it to the user.
 * Returns the file URI on native, or null on web where the browser's own print
 * dialogue handles it.
 */
export async function shareScorecard(input: ScorecardInput): Promise<string | null> {
  const html = buildScorecardHtml(input);

  if (Platform.OS === 'web') {
    // No file system to share from; the print dialogue offers "Save as PDF".
    await Print.printAsync({ html });
    return null;
  }

  const { uri } = await Print.printToFileAsync({ html, base64: false });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Share scorecard',
      UTI: 'com.adobe.pdf',
    });
  }

  return uri;
}
