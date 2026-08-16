-- ============================================================================
-- Cricket Arena — individual figures for matches scored on paper
-- ============================================================================
-- Migration 7 let a match carry a team summary, which is enough for the points
-- table. It is not enough for a leaderboard: "who scored the most runs this
-- season" needs a name against a number.
--
-- These two tables let an organiser type in the card afterwards — a batter's
-- runs and balls, a bowler's overs and wickets — without needing every
-- delivery. The scorecard views then read deliveries when they exist and these
-- when they do not, exactly as innings_scores already does, so a season can mix
-- matches scored in the app with matches typed up from a notebook and the
-- leaderboard covers both.
--
-- Nothing here is derived. A batter's strike rate and a bowler's economy are
-- still computed, so a typo in the runs cannot disagree with the strike rate
-- shown beside it.
-- ============================================================================

create table summary_batting (
  innings_id uuid not null references innings (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,

  runs int not null default 0 check (runs >= 0),
  balls int not null default 0 check (balls >= 0),
  fours int not null default 0 check (fours >= 0),
  sixes int not null default 0 check (sixes >= 0),

  is_out boolean not null default false,
  wicket_kind dismissal_kind,
  /* Free text, because a paper card says "c Malik b Khan" and not much else. */
  dismissal_note text,
  batting_position int check (batting_position between 1 and 15),

  primary key (innings_id, player_id),

  -- Boundaries cannot account for more runs than were scored.
  constraint boundaries_fit check (fours * 4 + sixes * 6 <= runs)
);

create index on summary_batting (player_id);

create table summary_bowling (
  innings_id uuid not null references innings (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,

  /* Stored as balls so 3.4 overs is unambiguous. */
  legal_balls int not null default 0 check (legal_balls >= 0),
  runs_conceded int not null default 0 check (runs_conceded >= 0),
  wickets int not null default 0 check (wickets between 0 and 10),
  maidens int not null default 0 check (maidens >= 0),
  wides int not null default 0 check (wides >= 0),
  no_balls int not null default 0 check (no_balls >= 0),

  primary key (innings_id, player_id)
);

create index on summary_bowling (player_id);

alter table summary_batting enable row level security;
alter table summary_bowling enable row level security;

-- Same visibility as the match they belong to.
create policy summary_batting_read on summary_batting
  for select using (
    exists (select 1 from innings i where i.id = innings_id and auth_can_read_match(i.match_id))
  );

create policy summary_batting_write on summary_batting
  for all using (
    exists (select 1 from innings i where i.id = innings_id and auth_can_score_match(i.match_id))
  )
  with check (
    exists (select 1 from innings i where i.id = innings_id and auth_can_score_match(i.match_id))
  );

create policy summary_bowling_read on summary_bowling
  for select using (
    exists (select 1 from innings i where i.id = innings_id and auth_can_read_match(i.match_id))
  );

create policy summary_bowling_write on summary_bowling
  for all using (
    exists (select 1 from innings i where i.id = innings_id and auth_can_score_match(i.match_id))
  )
  with check (
    exists (select 1 from innings i where i.id = innings_id and auth_can_score_match(i.match_id))
  );

-- ---------------------------------------------------------------------------
-- Scorecards: deliveries first, typed figures as the fallback
-- ---------------------------------------------------------------------------

create or replace view batting_scorecard
with (security_invoker = on) as
-- Matches scored ball by ball.
with faced as (
  select
    d.innings_id,
    d.striker_id as player_id,
    sum(d.runs_off_bat)::int as runs,
    count(*) filter (where d.wide_runs is null)::int as balls,
    count(*) filter (where d.runs_off_bat = 4)::int as fours,
    count(*) filter (where d.runs_off_bat = 6)::int as sixes,
    count(*) filter (
      where d.is_legal and d.runs_off_bat = 0 and d.byes = 0 and d.leg_byes = 0
    )::int as dots,
    min(d.sequence)::int as first_ball_sequence
  from deliveries d
  group by d.innings_id, d.striker_id
),
dismissals as (
  select d.innings_id, d.player_out_id as player_id, d.wicket_kind,
         d.bowler_id as dismissed_by_bowler_id, d.fielder_id
  from deliveries d
  where d.player_out_id is not null
),
scored as (
  select
    i.id as innings_id,
    i.match_id,
    i.batting_team_id as team_id,
    p.id as player_id,
    p.full_name,
    coalesce(x.batting_order,
             row_number() over (partition by i.id order by f.first_ball_sequence)) as batting_position,
    coalesce(f.runs, 0) as runs,
    coalesce(f.balls, 0) as balls,
    coalesce(f.fours, 0) as fours,
    coalesce(f.sixes, 0) as sixes,
    coalesce(f.dots, 0) as dots,
    (dm.wicket_kind is not null and dm.wicket_kind <> 'retired_not_out') as is_out,
    dm.wicket_kind,
    dm.dismissed_by_bowler_id,
    dm.fielder_id
  from innings i
  join playing_xi x on x.match_id = i.match_id and x.team_id = i.batting_team_id
  join players p on p.id = x.player_id
  left join faced f on f.innings_id = i.id and f.player_id = p.id
  left join dismissals dm on dm.innings_id = i.id and dm.player_id = p.id
  where f.player_id is not null or dm.player_id is not null or x.batting_order is not null
),
-- Matches typed up afterwards. Only used where no delivery exists.
typed as (
  select
    sb.innings_id,
    i.match_id,
    i.batting_team_id as team_id,
    sb.player_id,
    p.full_name,
    coalesce(sb.batting_position, 99) as batting_position,
    sb.runs, sb.balls, sb.fours, sb.sixes,
    0 as dots,
    sb.is_out,
    sb.wicket_kind,
    null::uuid as dismissed_by_bowler_id,
    null::uuid as fielder_id
  from summary_batting sb
  join innings i on i.id = sb.innings_id
  join players p on p.id = sb.player_id
  where not exists (select 1 from deliveries d where d.innings_id = sb.innings_id)
)
select
  innings_id, match_id, team_id, player_id, full_name, batting_position,
  runs, balls, fours, sixes, dots,
  case when balls > 0 then round((runs::numeric / balls) * 100, 2) else 0 end as strike_rate,
  is_out, wicket_kind, dismissed_by_bowler_id, fielder_id
from scored
union all
select
  innings_id, match_id, team_id, player_id, full_name, batting_position,
  runs, balls, fours, sixes, dots,
  case when balls > 0 then round((runs::numeric / balls) * 100, 2) else 0 end as strike_rate,
  is_out, wicket_kind, dismissed_by_bowler_id, fielder_id
from typed;

create or replace view bowling_scorecard
with (security_invoker = on) as
with per_over as (
  select d.innings_id, d.bowler_id, d.over_number,
         sum(d.bowler_runs)::int as runs_in_over,
         count(*) filter (where d.is_legal)::int as legal_in_over
  from deliveries d
  group by d.innings_id, d.bowler_id, d.over_number
),
totals as (
  select
    d.innings_id, d.bowler_id,
    count(*) filter (where d.is_legal)::int as legal_balls,
    sum(d.bowler_runs)::int as runs_conceded,
    count(*) filter (
      where d.wicket_kind in ('bowled','caught','caught_behind','caught_and_bowled','lbw','stumped','hit_wicket')
    )::int as wickets,
    coalesce(sum(d.wide_runs), 0)::int as wides,
    count(*) filter (where d.no_ball_runs is not null)::int as no_balls,
    count(*) filter (where d.is_legal and d.bowler_runs = 0)::int as dots
  from deliveries d
  group by d.innings_id, d.bowler_id
),
maidens as (
  select o.innings_id, o.bowler_id, count(*)::int as maidens
  from per_over o
  join innings i on i.id = o.innings_id
  join matches m on m.id = i.match_id
  where o.runs_in_over = 0 and o.legal_in_over >= m.balls_per_over
  group by o.innings_id, o.bowler_id
),
scored as (
  select
    t.innings_id, i.match_id, i.bowling_team_id as team_id,
    t.bowler_id as player_id, p.full_name,
    t.legal_balls, t.runs_conceded, t.wickets,
    coalesce(mn.maidens, 0) as maidens,
    t.wides, t.no_balls, t.dots,
    m.balls_per_over
  from totals t
  join innings i on i.id = t.innings_id
  join matches m on m.id = i.match_id
  join players p on p.id = t.bowler_id
  left join maidens mn on mn.innings_id = t.innings_id and mn.bowler_id = t.bowler_id
),
typed as (
  select
    sb.innings_id, i.match_id, i.bowling_team_id as team_id,
    sb.player_id, p.full_name,
    sb.legal_balls, sb.runs_conceded, sb.wickets, sb.maidens,
    sb.wides, sb.no_balls, 0 as dots,
    m.balls_per_over
  from summary_bowling sb
  join innings i on i.id = sb.innings_id
  join matches m on m.id = i.match_id
  join players p on p.id = sb.player_id
  where not exists (select 1 from deliveries d where d.innings_id = sb.innings_id)
)
select
  innings_id, match_id, team_id, player_id, full_name,
  legal_balls,
  (legal_balls / balls_per_over)::text || '.' || (legal_balls % balls_per_over)::text as overs,
  runs_conceded, wickets, maidens, wides, no_balls, dots,
  case when legal_balls > 0
    then round(runs_conceded::numeric / (legal_balls::numeric / balls_per_over), 2)
    else 0 end as economy
-- `both` is reserved in Postgres; any other name will do.
from (select * from scored union all select * from typed) all_bowling;
