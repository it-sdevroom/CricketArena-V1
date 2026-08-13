/**
 * Row shapes for the tables and views in supabase/migrations.
 *
 * These are written by hand rather than generated so a fresh clone type-checks
 * without a linked Supabase project. Once you have linked one you can replace
 * this file wholesale with:
 *
 *   npx supabase gen types typescript --linked > src/data/database.types.ts
 */

import type { DismissalKind } from '@/src/domain/types';

export type AppRole =
  | 'platform_admin'
  | 'tournament_admin'
  | 'scorer'
  | 'umpire'
  | 'team_manager'
  | 'captain'
  | 'player'
  | 'fan'
  | 'stream_operator';

export type TournamentFormatRow =
  | 'round_robin'
  | 'double_round_robin'
  | 'groups'
  | 'knockout'
  | 'league_playoffs'
  | 'custom';

export type MatchFormatRow = 'T10' | 'T20' | 'ODI' | 'TEST' | 'TAPE_BALL' | 'CUSTOM';

export type TournamentStatus = 'draft' | 'registration' | 'active' | 'completed' | 'archived';

export type MatchStatus =
  | 'scheduled'
  | 'toss'
  | 'live'
  | 'innings_break'
  | 'completed'
  | 'abandoned'
  | 'cancelled'
  | 'walkover';

export type MatchStage =
  | 'league'
  | 'group'
  | 'quarter_final'
  | 'semi_final'
  | 'final'
  | 'third_place'
  | 'eliminator'
  | 'qualifier'
  | 'friendly';

export type ResultKind = 'win' | 'tie' | 'draw' | 'no_result' | 'abandoned' | 'walkover';

export type PlayerRole =
  | 'batter'
  | 'bowler'
  | 'all_rounder'
  | 'wicket_keeper'
  | 'wicket_keeper_batter';

export interface ProfileRow {
  id: string;
  full_name: string;
  handle: string | null;
  avatar_url: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  is_platform_admin: boolean;
  created_at: string;
}

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  city: string | null;
  country: string | null;
  created_by: string | null;
  created_at: string;
}

export interface OrganizationMemberRow {
  organization_id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface VenueRow {
  id: string;
  organization_id: string;
  name: string;
  city: string | null;
  address: string | null;
  pitch_type: string | null;
  floodlights: boolean;
}

export interface TeamRow {
  id: string;
  organization_id: string;
  name: string;
  short_name: string;
  logo_url: string | null;
  primary_color: string;
  home_venue_id: string | null;
  manager_id: string | null;
  created_at: string;
}

export interface PlayerRow {
  id: string;
  organization_id: string;
  user_id: string | null;
  full_name: string;
  display_name: string | null;
  jersey_number: number | null;
  date_of_birth: string | null;
  role: PlayerRole;
  batting_style: 'right_hand' | 'left_hand';
  bowling_style: string;
  photo_url: string | null;
  phone: string | null;
  credit_value: number;
  active: boolean;
}

export interface TeamMemberRow {
  team_id: string;
  player_id: string;
  is_captain: boolean;
  is_vice_captain: boolean;
  is_wicket_keeper: boolean;
}

export interface TournamentRow {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  season: string | null;
  format: TournamentFormatRow;
  match_format: MatchFormatRow;
  status: TournamentStatus;
  is_public: boolean;
  logo_url: string | null;
  banner_url: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  group_count: number;
  overs_per_innings: number | null;
  balls_per_over: number;
  wide_runs: number;
  no_ball_runs: number;
  free_hit_after_no_ball: boolean;
  players_per_side: number;
  max_overs_per_bowler: number | null;
  points_win: number;
  points_loss: number;
  points_tie: number;
  points_no_result: number;
  bonus_point_enabled: boolean;
  bonus_point_ratio: number;
  created_by: string | null;
  created_at: string;
}

export interface MatchRow {
  id: string;
  tournament_id: string | null;
  organization_id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  venue_id: string | null;
  status: MatchStatus;
  stage: MatchStage;
  round: number;
  match_order: number;
  label: string | null;
  group_label: string | null;
  scheduled_at: string | null;
  overs_per_innings: number | null;
  balls_per_over: number;
  wide_runs: number;
  no_ball_runs: number;
  free_hit_after_no_ball: boolean;
  players_per_side: number;
  max_overs_per_bowler: number | null;
  toss_winner_team_id: string | null;
  toss_decision: 'bat' | 'bowl' | null;
  result_kind: ResultKind | null;
  winner_team_id: string | null;
  result_summary: string | null;
  result_margin_runs: number | null;
  result_margin_wickets: number | null;
  player_of_match_id: string | null;
  stream_url: string | null;
}

export interface PlayingXiRow {
  match_id: string;
  team_id: string;
  player_id: string;
  batting_order: number | null;
  is_captain: boolean;
  is_wicket_keeper: boolean;
  is_substitute: boolean;
}

export interface InningsRow {
  id: string;
  match_id: string;
  innings_number: number;
  batting_team_id: string;
  bowling_team_id: string;
  target: number | null;
  reduced_overs: number | null;
  revised_target: number | null;
  closed: boolean;
  end_reason: string | null;
  started_at: string;
  closed_at: string | null;
}

/**
 * Note the storage convention: `wide_runs` and `no_ball_runs` are ABSOLUTE
 * totals including the automatic penalty. `src/data/mappers.ts` converts to and
 * from the domain shape, where `wide` counts only the additional runs run.
 */
export interface DeliveryRow {
  id: string;
  innings_id: string;
  match_id: string;
  sequence: number;
  over_number: number;
  ball_in_over: number;
  striker_id: string;
  non_striker_id: string;
  bowler_id: string;
  runs_off_bat: number;
  wide_runs: number | null;
  no_ball_runs: number | null;
  byes: number;
  leg_byes: number;
  penalty_runs: number;
  wicket_kind: DismissalKind | null;
  player_out_id: string | null;
  fielder_id: string | null;
  free_hit: boolean;
  is_legal: boolean;
  total_runs: number;
  bowler_runs: number;
  idempotency_key: string;
  recorded_by: string | null;
  created_at: string;
}

// --- views -----------------------------------------------------------------

export interface MatchSummaryRow {
  match_id: string;
  tournament_id: string | null;
  organization_id: string;
  status: MatchStatus;
  stage: MatchStage;
  round: number;
  label: string | null;
  scheduled_at: string | null;
  overs_per_innings: number | null;
  balls_per_over: number;
  home_team_id: string | null;
  home_team_name: string | null;
  home_team_short: string | null;
  home_team_color: string | null;
  away_team_id: string | null;
  away_team_name: string | null;
  away_team_short: string | null;
  away_team_color: string | null;
  venue_name: string | null;
  result_kind: ResultKind | null;
  winner_team_id: string | null;
  result_summary: string | null;
  first_innings_team_id: string | null;
  first_innings_runs: number | null;
  first_innings_wickets: number | null;
  first_innings_balls: number | null;
  second_innings_team_id: string | null;
  second_innings_runs: number | null;
  second_innings_wickets: number | null;
  second_innings_balls: number | null;
  chase_target: number | null;
}

export interface StandingsRowDb {
  tournament_id: string;
  team_id: string;
  team_name: string;
  team_short: string;
  team_color: string;
  group_label: string | null;
  played: number;
  won: number;
  lost: number;
  tied: number;
  no_result: number;
  points: number;
  runs_scored: number;
  overs_faced: number;
  runs_conceded: number;
  overs_bowled: number;
  net_run_rate: number;
}

export interface BattingCardRow {
  innings_id: string;
  match_id: string;
  team_id: string;
  player_id: string;
  full_name: string;
  batting_position: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dots: number;
  strike_rate: number;
  is_out: boolean;
  wicket_kind: DismissalKind | null;
  dismissed_by_bowler_id: string | null;
  fielder_id: string | null;
}

export interface BowlingCardRow {
  innings_id: string;
  match_id: string;
  team_id: string;
  player_id: string;
  full_name: string;
  legal_balls: number;
  overs: string;
  runs_conceded: number;
  wickets: number;
  maidens: number;
  wides: number;
  no_balls: number;
  dots: number;
  economy: number;
}

export interface BattingCareerRow {
  player_id: string;
  full_name: string;
  organization_id: string;
  tournament_id: string | null;
  innings: number;
  not_outs: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  fifties: number;
  hundreds: number;
  high_score: number;
  average: number | null;
  strike_rate: number;
}

export interface BowlingCareerRow {
  player_id: string;
  full_name: string;
  organization_id: string;
  tournament_id: string | null;
  innings: number;
  legal_balls: number;
  runs_conceded: number;
  wickets: number;
  maidens: number;
  best_wickets: number;
  four_wicket_hauls: number;
  five_wicket_hauls: number;
  average: number | null;
  economy: number;
  strike_rate: number | null;
}

export interface MessageRow {
  id: string;
  channel_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  kind: string;
  match_id: string | null;
  tournament_id: string | null;
  read_at: string | null;
  created_at: string;
}
