/**
 * Fixture generation for every tournament format the app supports.
 *
 * Generators return plain descriptors; persisting them and assigning venues,
 * dates and officials is the caller's job. Knockout rounds after the first are
 * emitted with null sides — they are filled in as earlier rounds resolve.
 */

export type TournamentFormat =
  | 'round_robin'
  | 'double_round_robin'
  | 'groups'
  | 'knockout'
  | 'league_playoffs'
  | 'custom';

export interface GeneratedFixture {
  /** 1-based round or matchday number. */
  round: number;
  /** Ordinal within the whole tournament, used for default scheduling. */
  order: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  /** Group label such as "A", when the format has groups. */
  group: string | null;
  stage: 'group' | 'league' | 'quarter_final' | 'semi_final' | 'final' | 'third_place' | 'eliminator' | 'qualifier';
  label: string;
  /** For knockout rounds, where the two sides come from. */
  feedsFrom?: { home: string | null; away: string | null };
}

const BYE = '__bye__';

/**
 * Single round robin using the circle method: fix one team, rotate the rest.
 * With an odd number of sides a bye is inserted so every round is balanced.
 */
export function roundRobin(teamIds: string[]): GeneratedFixture[] {
  const teams = [...teamIds];
  if (teams.length < 2) return [];
  if (teams.length % 2 === 1) teams.push(BYE);

  const n = teams.length;
  const rounds = n - 1;
  const half = n / 2;
  const fixtures: GeneratedFixture[] = [];
  let order = 1;

  // `rotating` holds every team except the pivot at index 0.
  const rotating = teams.slice(1);

  for (let round = 0; round < rounds; round++) {
    const lineup = [teams[0], ...rotating];
    for (let i = 0; i < half; i++) {
      const home = lineup[i];
      const away = lineup[n - 1 - i];
      if (home === BYE || away === BYE) continue;

      // Alternate home and away each round so no side is always at home.
      const flip = round % 2 === 1 && i === 0;
      fixtures.push({
        round: round + 1,
        order: order++,
        homeTeamId: flip ? away : home,
        awayTeamId: flip ? home : away,
        group: null,
        stage: 'league',
        label: `Round ${round + 1}`,
      });
    }
    rotating.unshift(rotating.pop() as string);
  }

  return fixtures;
}

/** Every pair meets twice, with the return leg reversing home advantage. */
export function doubleRoundRobin(teamIds: string[]): GeneratedFixture[] {
  const first = roundRobin(teamIds);
  const rounds = first.length ? Math.max(...first.map((f) => f.round)) : 0;
  const second = first.map((f, i) => ({
    ...f,
    round: f.round + rounds,
    order: first.length + i + 1,
    homeTeamId: f.awayTeamId,
    awayTeamId: f.homeTeamId,
    label: `Round ${f.round + rounds}`,
  }));
  return [...first, ...second];
}

/**
 * Split the field into groups (snake-seeded so groups are balanced) and play a
 * round robin inside each.
 */
export function groupStage(teamIds: string[], groupCount: number): GeneratedFixture[] {
  if (groupCount < 1) return roundRobin(teamIds);

  const groups: string[][] = Array.from({ length: groupCount }, () => []);
  teamIds.forEach((id, i) => {
    // Snake draft: 0,1,2,2,1,0,0,1,2... keeps seeding fair across groups.
    const cycle = Math.floor(i / groupCount);
    const slot = cycle % 2 === 0 ? i % groupCount : groupCount - 1 - (i % groupCount);
    groups[slot].push(id);
  });

  const fixtures: GeneratedFixture[] = [];
  let order = 1;

  groups.forEach((members, gi) => {
    const label = String.fromCharCode(65 + gi);
    for (const f of roundRobin(members)) {
      fixtures.push({
        ...f,
        order: order++,
        group: label,
        stage: 'group',
        label: `Group ${label} • Round ${f.round}`,
      });
    }
  });

  return fixtures.sort((a, z) => a.round - z.round || a.order - z.order);
}

function knockoutStage(teamsInRound: number, roundIndex: number, totalRounds: number): GeneratedFixture['stage'] {
  const fromEnd = totalRounds - roundIndex;
  if (fromEnd === 1) return 'final';
  if (fromEnd === 2) return 'semi_final';
  if (fromEnd === 3) return 'quarter_final';
  return 'knockout' as GeneratedFixture['stage'];
}

function stageLabel(stage: GeneratedFixture['stage'], round: number): string {
  switch (stage) {
    case 'final':
      return 'Final';
    case 'semi_final':
      return 'Semi-final';
    case 'quarter_final':
      return 'Quarter-final';
    case 'third_place':
      return 'Third-place play-off';
    case 'eliminator':
      return 'Eliminator';
    case 'qualifier':
      return 'Qualifier';
    default:
      return `Round ${round}`;
  }
}

/**
 * Straight knockout bracket. Teams are taken in seeded order; when the field is
 * not a power of two the top seeds receive first-round byes.
 */
export function knockout(teamIds: string[], includeThirdPlace = false): GeneratedFixture[] {
  const count = teamIds.length;
  if (count < 2) return [];

  const bracketSize = 2 ** Math.ceil(Math.log2(count));
  const totalRounds = Math.log2(bracketSize);

  // Standard seeding: 1 plays the lowest seed, 2 plays the next lowest, etc.
  const seeded: (string | null)[] = [];
  for (let i = 0; i < bracketSize / 2; i++) {
    seeded.push(teamIds[i] ?? null);
    seeded.push(teamIds[bracketSize - 1 - i] ?? null);
  }

  const fixtures: GeneratedFixture[] = [];
  let order = 1;

  // Round 1 from the seeded list.
  const firstRoundMatches = bracketSize / 2;
  const stage1 = knockoutStage(bracketSize, 0, totalRounds);
  for (let i = 0; i < firstRoundMatches; i++) {
    fixtures.push({
      round: 1,
      order: order++,
      homeTeamId: seeded[i * 2],
      awayTeamId: seeded[i * 2 + 1],
      group: null,
      stage: stage1,
      label: `${stageLabel(stage1, 1)} ${firstRoundMatches > 1 ? i + 1 : ''}`.trim(),
    });
  }

  // Later rounds are placeholders fed by the winners of the previous round.
  let matchesInRound = firstRoundMatches / 2;
  for (let round = 2; round <= totalRounds; round++) {
    const stage = knockoutStage(matchesInRound * 2, round - 1, totalRounds);
    for (let i = 0; i < matchesInRound; i++) {
      fixtures.push({
        round,
        order: order++,
        homeTeamId: null,
        awayTeamId: null,
        group: null,
        stage,
        label: `${stageLabel(stage, round)} ${matchesInRound > 1 ? i + 1 : ''}`.trim(),
        feedsFrom: {
          home: `winner:R${round - 1}M${i * 2 + 1}`,
          away: `winner:R${round - 1}M${i * 2 + 2}`,
        },
      });
    }
    matchesInRound /= 2;
  }

  if (includeThirdPlace && totalRounds >= 2) {
    fixtures.push({
      round: totalRounds,
      order: order++,
      homeTeamId: null,
      awayTeamId: null,
      group: null,
      stage: 'third_place',
      label: 'Third-place play-off',
      feedsFrom: { home: `loser:R${totalRounds - 1}M1`, away: `loser:R${totalRounds - 1}M2` },
    });
  }

  return fixtures;
}

/**
 * League followed by the IPL-style play-off ladder:
 * Qualifier 1 (1v2), Eliminator (3v4), Qualifier 2, Final.
 */
export function leaguePlusPlayoffs(teamIds: string[]): GeneratedFixture[] {
  const league = roundRobin(teamIds);
  const lastRound = league.length ? Math.max(...league.map((f) => f.round)) : 0;
  let order = league.length + 1;

  const playoffs: GeneratedFixture[] = [
    {
      round: lastRound + 1,
      order: order++,
      homeTeamId: null,
      awayTeamId: null,
      group: null,
      stage: 'qualifier',
      label: 'Qualifier 1',
      feedsFrom: { home: 'standings:1', away: 'standings:2' },
    },
    {
      round: lastRound + 1,
      order: order++,
      homeTeamId: null,
      awayTeamId: null,
      group: null,
      stage: 'eliminator',
      label: 'Eliminator',
      feedsFrom: { home: 'standings:3', away: 'standings:4' },
    },
    {
      round: lastRound + 2,
      order: order++,
      homeTeamId: null,
      awayTeamId: null,
      group: null,
      stage: 'qualifier',
      label: 'Qualifier 2',
      feedsFrom: { home: 'loser:qualifier_1', away: 'winner:eliminator' },
    },
    {
      round: lastRound + 3,
      order: order++,
      homeTeamId: null,
      awayTeamId: null,
      group: null,
      stage: 'final',
      label: 'Final',
      feedsFrom: { home: 'winner:qualifier_1', away: 'winner:qualifier_2' },
    },
  ];

  return [...league, ...playoffs];
}

export interface GenerateOptions {
  format: TournamentFormat;
  teamIds: string[];
  groupCount?: number;
  includeThirdPlace?: boolean;
}

export function generateFixtures(options: GenerateOptions): GeneratedFixture[] {
  switch (options.format) {
    case 'round_robin':
      return roundRobin(options.teamIds);
    case 'double_round_robin':
      return doubleRoundRobin(options.teamIds);
    case 'groups':
      return groupStage(options.teamIds, options.groupCount ?? 2);
    case 'knockout':
      return knockout(options.teamIds, options.includeThirdPlace ?? false);
    case 'league_playoffs':
      return leaguePlusPlayoffs(options.teamIds);
    default:
      return [];
  }
}

/**
 * Spread fixtures over calendar days from a start date.
 * Every fixture in the same round is played on the same day by default.
 */
export function scheduleFixtures(
  fixtures: GeneratedFixture[],
  startDate: Date,
  daysBetweenRounds = 7,
): (GeneratedFixture & { scheduledAt: string })[] {
  return fixtures.map((f) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + (f.round - 1) * daysBetweenRounds);
    return { ...f, scheduledAt: date.toISOString() };
  });
}
