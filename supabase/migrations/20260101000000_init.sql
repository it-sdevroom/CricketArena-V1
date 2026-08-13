-- ============================================================================
-- Cricket Arena — core schema
-- ============================================================================
-- Design notes
--
-- 1. A match is an event log. `deliveries` is the source of truth; scorecards,
--    standings and career figures are all derived. That gives free undo,
--    auditable corrections, and lets an offline device replay its queue safely.
--
-- 2. `wide_runs` and `no_ball_runs` are stored as ABSOLUTE totals including the
--    automatic penalty, so the generated total columns below need no knowledge
--    of the competition's rules. The client converts to and from the domain
--    representation (where `wide` means "additional runs run").
--
-- 3. A `player` is an entity inside an organisation and only optionally linked
--    to an auth user. Most club cricketers never sign in.
-- ============================================================================

-- `gen_random_uuid()` is core Postgres from 13 onwards, so no extension is
-- required. Everything below is plain SQL and runs on any modern Postgres.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type app_role as enum (
  'platform_admin',
  'tournament_admin',
  'scorer',
  'umpire',
  'team_manager',
  'captain',
  'player',
  'fan',
  'stream_operator'
);

create type tournament_format as enum (
  'round_robin',
  'double_round_robin',
  'groups',
  'knockout',
  'league_playoffs',
  'custom'
);

create type match_format as enum ('T10', 'T20', 'ODI', 'TEST', 'TAPE_BALL', 'CUSTOM');

create type tournament_status as enum ('draft', 'registration', 'active', 'completed', 'archived');

create type match_status as enum (
  'scheduled',
  'toss',
  'live',
  'innings_break',
  'completed',
  'abandoned',
  'cancelled',
  'walkover'
);

create type match_stage as enum (
  'league',
  'group',
  'quarter_final',
  'semi_final',
  'final',
  'third_place',
  'eliminator',
  'qualifier',
  'friendly'
);

create type result_kind as enum ('win', 'tie', 'draw', 'no_result', 'abandoned', 'walkover');

create type dismissal_kind as enum (
  'bowled',
  'caught',
  'caught_behind',
  'caught_and_bowled',
  'lbw',
  'stumped',
  'hit_wicket',
  'run_out',
  'obstructing_the_field',
  'hit_ball_twice',
  'timed_out',
  'retired_out',
  'retired_not_out'
);

create type innings_end_reason as enum (
  'all_out',
  'overs_complete',
  'target_reached',
  'declared',
  'forfeited',
  'abandoned'
);

create type batting_style as enum ('right_hand', 'left_hand');

create type bowling_style as enum (
  'right_arm_fast',
  'right_arm_medium',
  'right_arm_off_break',
  'right_arm_leg_break',
  'left_arm_fast',
  'left_arm_medium',
  'left_arm_orthodox',
  'left_arm_chinaman',
  'none'
);

create type player_role as enum ('batter', 'bowler', 'all_rounder', 'wicket_keeper', 'wicket_keeper_batter');

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  handle text unique,
  avatar_url text,
  phone text,
  city text,
  country text,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table profiles is 'Public profile mirroring auth.users. Created automatically on sign up.';

-- ---------------------------------------------------------------------------
-- Organisations (a club, league body or tournament operator)
-- ---------------------------------------------------------------------------

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  city text,
  country text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table organization_members (
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role app_role not null default 'fan',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index on organization_members (user_id);

-- ---------------------------------------------------------------------------
-- Venues
-- ---------------------------------------------------------------------------

create table venues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  city text,
  address text,
  pitch_type text,
  floodlights boolean not null default false,
  created_at timestamptz not null default now()
);

create index on venues (organization_id);

-- ---------------------------------------------------------------------------
-- Teams and players
-- ---------------------------------------------------------------------------

create table teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  short_name text not null,
  logo_url text,
  primary_color text not null default '#20D78A',
  home_venue_id uuid references venues (id) on delete set null,
  manager_id uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index on teams (organization_id);

create table players (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  -- Set when this cricketer also has an account on the platform.
  user_id uuid references profiles (id) on delete set null,
  full_name text not null,
  display_name text,
  jersey_number int,
  date_of_birth date,
  role player_role not null default 'batter',
  batting_style batting_style not null default 'right_hand',
  bowling_style bowling_style not null default 'none',
  photo_url text,
  phone text,
  /* Fantasy credit value, 5.0 - 12.0 */
  credit_value numeric(4, 1) not null default 8.0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index on players (organization_id);
create index on players (user_id);

create table team_members (
  team_id uuid not null references teams (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  is_captain boolean not null default false,
  is_vice_captain boolean not null default false,
  is_wicket_keeper boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (team_id, player_id)
);

create index on team_members (player_id);

-- Only one captain per team.
create unique index team_one_captain on team_members (team_id) where is_captain;

-- ---------------------------------------------------------------------------
-- Tournaments
-- ---------------------------------------------------------------------------

create table tournaments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  slug text not null,
  season text,
  format tournament_format not null default 'round_robin',
  match_format match_format not null default 'T20',
  status tournament_status not null default 'draft',
  /* Visible to signed-out fans on the public web build. */
  is_public boolean not null default true,
  logo_url text,
  banner_url text,
  description text,
  start_date date,
  end_date date,
  group_count int not null default 1,

  -- Playing conditions. Mirrors MatchRules in src/domain/types.ts.
  overs_per_innings int default 20,
  balls_per_over int not null default 6,
  wide_runs int not null default 1,
  no_ball_runs int not null default 1,
  free_hit_after_no_ball boolean not null default true,
  players_per_side int not null default 11,
  max_overs_per_bowler int default 4,

  -- Points configuration.
  points_win int not null default 2,
  points_loss int not null default 0,
  points_tie int not null default 1,
  points_no_result int not null default 1,
  bonus_point_enabled boolean not null default false,
  bonus_point_ratio numeric(4, 2) not null default 1.25,

  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  constraint overs_positive check (overs_per_innings is null or overs_per_innings > 0),
  constraint balls_per_over_sane check (balls_per_over between 1 and 12)
);

create index on tournaments (organization_id);
create index on tournaments (status);

create table tournament_teams (
  tournament_id uuid not null references tournaments (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  group_label text,
  seed int,
  registered_at timestamptz not null default now(),
  primary key (tournament_id, team_id)
);

create index on tournament_teams (team_id);

-- ---------------------------------------------------------------------------
-- Matches
-- ---------------------------------------------------------------------------

create table matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references tournaments (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  home_team_id uuid references teams (id) on delete set null,
  away_team_id uuid references teams (id) on delete set null,
  venue_id uuid references venues (id) on delete set null,
  status match_status not null default 'scheduled',
  stage match_stage not null default 'league',
  round int not null default 1,
  match_order int not null default 1,
  label text,
  group_label text,
  scheduled_at timestamptz,

  -- Playing conditions, copied from the tournament so a rain-reduced or
  -- one-off match can differ without rewriting the competition rules.
  overs_per_innings int,
  balls_per_over int not null default 6,
  wide_runs int not null default 1,
  no_ball_runs int not null default 1,
  free_hit_after_no_ball boolean not null default true,
  players_per_side int not null default 11,
  max_overs_per_bowler int,

  -- Toss
  toss_winner_team_id uuid references teams (id) on delete set null,
  toss_decision text check (toss_decision in ('bat', 'bowl')),

  -- Result
  result_kind result_kind,
  winner_team_id uuid references teams (id) on delete set null,
  result_summary text,
  result_margin_runs int,
  result_margin_wickets int,
  player_of_match_id uuid references players (id) on delete set null,

  stream_url text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_differ check (home_team_id is null or away_team_id is null or home_team_id <> away_team_id)
);

create index on matches (tournament_id);
create index on matches (organization_id);
create index on matches (status);
create index on matches (scheduled_at);

-- Scorers and umpires assigned to a specific match.
create table match_officials (
  match_id uuid not null references matches (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role app_role not null check (role in ('scorer', 'umpire', 'stream_operator')),
  assigned_at timestamptz not null default now(),
  primary key (match_id, user_id, role)
);

create index on match_officials (user_id);

-- The eleven (or however many) named for this match.
create table playing_xi (
  match_id uuid not null references matches (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  batting_order int,
  is_captain boolean not null default false,
  is_wicket_keeper boolean not null default false,
  is_substitute boolean not null default false,
  primary key (match_id, player_id)
);

create index on playing_xi (match_id, team_id);

-- ---------------------------------------------------------------------------
-- Innings and deliveries
-- ---------------------------------------------------------------------------

create table innings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  /* 1 or 2 in a limited-overs match; up to 4 in a multi-day match. */
  innings_number int not null check (innings_number between 1 and 4),
  batting_team_id uuid not null references teams (id) on delete cascade,
  bowling_team_id uuid not null references teams (id) on delete cascade,
  /* Set for the side batting second. */
  target int,
  /* Overs this innings was reduced to by rain. */
  reduced_overs int,
  /* DLS or manually revised target. */
  revised_target int,
  closed boolean not null default false,
  end_reason innings_end_reason,
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (match_id, innings_number)
);

create index on innings (match_id);

create table deliveries (
  id uuid primary key default gen_random_uuid(),
  innings_id uuid not null references innings (id) on delete cascade,
  match_id uuid not null references matches (id) on delete cascade,

  /* Server-assigned monotonic order within the innings. */
  sequence int not null,
  over_number int not null default 0,
  ball_in_over int not null default 0,

  striker_id uuid not null references players (id) on delete restrict,
  non_striker_id uuid not null references players (id) on delete restrict,
  bowler_id uuid not null references players (id) on delete restrict,

  runs_off_bat int not null default 0 check (runs_off_bat >= 0),
  /* Absolute wide total including the automatic penalty. NULL when not a wide. */
  wide_runs int check (wide_runs is null or wide_runs > 0),
  /* Absolute no-ball penalty. NULL when not a no ball. */
  no_ball_runs int check (no_ball_runs is null or no_ball_runs > 0),
  byes int not null default 0 check (byes >= 0),
  leg_byes int not null default 0 check (leg_byes >= 0),
  penalty_runs int not null default 0 check (penalty_runs >= 0),

  wicket_kind dismissal_kind,
  player_out_id uuid references players (id) on delete restrict,
  fielder_id uuid references players (id) on delete set null,

  free_hit boolean not null default false,

  -- Derived, so scorecard views need no rule lookups.
  is_legal boolean generated always as (wide_runs is null and no_ball_runs is null) stored,
  total_runs int generated always as (
    runs_off_bat + coalesce(wide_runs, 0) + coalesce(no_ball_runs, 0)
      + byes + leg_byes + penalty_runs
  ) stored,
  bowler_runs int generated always as (
    runs_off_bat + coalesce(wide_runs, 0) + coalesce(no_ball_runs, 0)
  ) stored,

  /* Client-generated. Makes a retried offline sync a no-op instead of a duplicate. */
  idempotency_key text not null,
  recorded_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint striker_differs check (striker_id <> non_striker_id),
  constraint wicket_needs_player check (
    (wicket_kind is null and player_out_id is null)
    or (wicket_kind is not null and player_out_id is not null)
  ),
  unique (innings_id, idempotency_key),
  unique (innings_id, sequence)
);

create index on deliveries (innings_id, sequence);
create index on deliveries (match_id);
create index on deliveries (bowler_id);
create index on deliveries (striker_id);

-- Every edit or deletion of a recorded ball, for dispute resolution.
create table score_corrections (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  delivery_id uuid,
  action text not null check (action in ('edit', 'delete', 'insert')),
  before_state jsonb,
  after_state jsonb,
  reason text,
  performed_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index on score_corrections (match_id);

-- ---------------------------------------------------------------------------
-- Communication
-- ---------------------------------------------------------------------------

create table channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  tournament_id uuid references tournaments (id) on delete cascade,
  match_id uuid references matches (id) on delete cascade,
  name text not null,
  kind text not null default 'tournament' check (kind in ('tournament', 'match', 'team', 'officials')),
  created_at timestamptz not null default now()
);

create index on channels (tournament_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels (id) on delete cascade,
  author_id uuid references profiles (id) on delete set null,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index on messages (channel_id, created_at desc);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  title text not null,
  body text,
  kind text not null default 'general',
  match_id uuid references matches (id) on delete cascade,
  tournament_id uuid references tournaments (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index on notifications (user_id, created_at desc);

create table device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  expo_push_token text not null,
  platform text,
  last_seen_at timestamptz not null default now(),
  unique (user_id, expo_push_token)
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Keep updated_at honest.
create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();
create trigger tournaments_touch before update on tournaments
  for each row execute function touch_updated_at();
create trigger matches_touch before update on matches
  for each row execute function touch_updated_at();

-- Give every new auth user a profile.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.phone
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Assign each delivery the next sequence number in its innings, and derive the
-- over/ball position. Doing this server-side means two scorers racing on a
-- flaky connection cannot both claim ball 4 of the 12th over.
create or replace function assign_delivery_position()
returns trigger
language plpgsql
as $$
declare
  next_seq int;
  legal_before int;
  bpo int;
begin
  select coalesce(max(sequence), 0) + 1 into next_seq
  from deliveries where innings_id = new.innings_id;

  new.sequence := next_seq;

  select m.balls_per_over into bpo
  from innings i join matches m on m.id = i.match_id
  where i.id = new.innings_id;

  bpo := coalesce(bpo, 6);

  select count(*) into legal_before
  from deliveries
  where innings_id = new.innings_id and is_legal;

  if new.wide_runs is null and new.no_ball_runs is null then
    new.over_number := legal_before / bpo;
    new.ball_in_over := (legal_before % bpo) + 1;
  else
    new.over_number := legal_before / bpo;
    new.ball_in_over := (legal_before % bpo) + 1;
  end if;

  return new;
end;
$$;

create trigger deliveries_assign_position
  before insert on deliveries
  for each row execute function assign_delivery_position();

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table deliveries;
alter publication supabase_realtime add table innings;
alter publication supabase_realtime add table matches;
alter publication supabase_realtime add table messages;
