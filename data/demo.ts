export type Team = {
  id: string;
  name: string;
  short: string;
  color: string;
  played: number;
  won: number;
  lost: number;
  nrr: string;
  pts: number;
};

export type Player = {
  id: string;
  name: string;
  team: string;
  role: 'BAT' | 'BOWL' | 'AR' | 'WK';
  runs: number;
  wickets: number;
  strikeRate: number;
  economy: string;
  credits: number;
};

export type Fixture = {
  id: string;
  stage: string;
  a: string;
  b: string;
  date: string;
  venue: string;
  live: boolean;
  status: string;
};

export const teams: Team[] = [
  {id: 'falcons', name: 'Riyadh Falcons', short: 'RF', color: '#20D78A', played: 5, won: 4, lost: 1, nrr: '+1.42', pts: 8},
  {id: 'warriors', name: 'Desert Warriors', short: 'DW', color: '#FFBF47', played: 5, won: 3, lost: 2, nrr: '+0.66', pts: 6},
  {id: 'stars', name: 'Jeddah Stars', short: 'JS', color: '#6E8BFF', played: 5, won: 2, lost: 3, nrr: '-0.11', pts: 4},
  {id: 'kings', name: 'Dammam Kings', short: 'DK', color: '#FF5D67', played: 5, won: 1, lost: 4, nrr: '-1.08', pts: 2},
];

export const players: Player[] = [
  {id: 'p1', name: 'A. Rahman', team: 'RF', role: 'BAT', runs: 284, wickets: 0, strikeRate: 154.3, economy: '-', credits: 10},
  {id: 'p2', name: 'M. Khan', team: 'DW', role: 'AR', runs: 241, wickets: 9, strikeRate: 139.6, economy: '7.12', credits: 10},
  {id: 'p3', name: 'S. Ali', team: 'JS', role: 'BOWL', runs: 58, wickets: 14, strikeRate: 91.1, economy: '6.34', credits: 9},
  {id: 'p4', name: 'N. Ahmed', team: 'DK', role: 'WK', runs: 198, wickets: 0, strikeRate: 132.9, economy: '-', credits: 9},
  {id: 'p5', name: 'Z. Iqbal', team: 'RF', role: 'BOWL', runs: 45, wickets: 12, strikeRate: 84.9, economy: '6.88', credits: 8},
  {id: 'p6', name: 'R. Malik', team: 'DW', role: 'BAT', runs: 189, wickets: 1, strikeRate: 128.4, economy: '8.90', credits: 8},
  {id: 'p7', name: 'H. Noor', team: 'JS', role: 'AR', runs: 155, wickets: 7, strikeRate: 121.2, economy: '7.40', credits: 8},
  {id: 'p8', name: 'F. Sami', team: 'DK', role: 'BOWL', runs: 32, wickets: 10, strikeRate: 71.1, economy: '7.05', credits: 7},
];

export const fixtures: Fixture[] = [
  {id: 'm1', stage: 'RPL - Match 12', a: 'RF', b: 'DW', date: 'Today - 7:30 PM', venue: 'Al Yamamah Ground', live: true, status: 'RF 142/4 after 14.3 overs'},
  {id: 'm2', stage: 'RPL - Match 13', a: 'JS', b: 'DK', date: 'Tomorrow - 5:00 PM', venue: 'Jeddah Cricket Oval', live: false, status: 'Lineups due 60 minutes before toss'},
  {id: 'm3', stage: 'RPL - Match 14', a: 'RF', b: 'JS', date: '16 Aug - 7:30 PM', venue: 'Al Yamamah Ground', live: false, status: 'Officials assigned'},
];

export const matchSummary = {
  battingTeam: 'Riyadh Falcons',
  bowlingTeam: 'Desert Warriors',
  score: '142/4',
  overs: '14.3',
  chase: 'Projected 195',
  striker: 'A. Rahman',
  nonStriker: 'R. Hussain',
  bowler: 'M. Khan',
};
