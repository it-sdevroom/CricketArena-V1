-- ============================================================================
-- Cricket Arena — derived views
-- ============================================================================
-- Scorecards, points tables and career figures are all folded out of the
-- delivery log here rather than kept in maintained tables. That means there is
-- exactly one definition of "runs conceded" and it cannot drift out of step
-- with the balls that were actually bowled.
--
-- Every view is created with security_invoker so it enforces the caller's RLS
-- rather than the view owner's.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Innings totals
-- ---------------------------------------------------------------------------

create view innings_scores
with (security_invoker = on) as
select
  i.id as innings_id,
  i.match_id,
  i.innings_number,
  i.batting_team_id,
  i.bowling_team_id,
  i.target,
  i.closed,
  i.end_reason,
  coalesce(sum(d.total_runs), 0)::int as runs,
  count(*) filter (
    where d.wicket_kind is not null and d.wicket_kind <> 'retired_not_out'
  )::int as wickets,
  count(*) filter (where d.is_legal)::int as legal_balls,
  coalesce(sum(d.wide_runs), 0)::int as wides,
  coalesce(sum(d.no_ball_runs), 0)::int as no_balls,
  coalesce(sum(d.byes), 0)::int as byes,
  coalesce(sum(d.leg_byes), 0)::int as leg_byes,
  coalesce(sum(d.penalty_runs), 0)::int as penalties,
  coalesce(sum(d.wide_runs), 0)::int
    + coalesce(sum(d.no_ball_runs), 0)::int
    + coalesce(sum(d.byes), 0)::int
    + coalesce(sum(d.leg_byes), 0)::int
    + coalesce(sum(d.penalty_runs), 0)::int as extras
from innings i
left join deliveries d on d.innings_id = i.id
group by i.id;

comment on view innings_scores is 'Team totals for one innings, folded from its deliveries.';

-- ---------------------------------------------------------------------------
-- Batting scorecard
-- ---------------------------------------------------------------------------

create view batting_scorecard
with (security_invoker = on) as
with faced as (
  select
    d.innings_id,
    d.striker_id as player_id,
    sum(d.runs_off_bat)::int as runs,
    -- A wide is not a ball faced; a no ball is.
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
  select
    d.innings_id,
    d.player_out_id as player_id,
    d.wicket_kind,
    d.bowler_id as dismissed_by_bowler_id,
    d.fielder_id,
    d.sequence
  from deliveries d
  where d.player_out_id is not null
)
select
  i.id as innings_id,
  i.match_id,
  i.batting_team_id as team_id,
  p.id as player_id,
  p.full_name,
  coalesce(x.batting_order, row_number() over (partition by i.id order by f.first_ball_sequence)) as batting_position,
  coalesce(f.runs, 0) as runs,
  coalesce(f.balls, 0) as balls,
  coalesce(f.fours, 0) as fours,
  coalesce(f.sixes, 0) as sixes,
  coalesce(f.dots, 0) as dots,
  case when coalesce(f.balls, 0) > 0
    then round((coalesce(f.runs, 0)::numeric / f.balls) * 100, 2)
    else 0 end as strike_rate,
  (dm.wicket_kind is not null and dm.wicket_kind <> 'retired_not_out') as is_out,
  dm.wicket_kind,
  dm.dismissed_by_bowler_id,
  dm.fielder_id
from innings i
join playing_xi x on x.match_id = i.match_id and x.team_id = i.batting_team_id
join players p on p.id = x.player_id
left join faced f on f.innings_id = i.id and f.player_id = p.id
left join dismissals dm on dm.innings_id = i.id and dm.player_id = p.id
where f.player_id is not null or dm.player_id is not null or x.batting_order is not null;

-- ---------------------------------------------------------------------------
-- Bowling scorecard
-- ---------------------------------------------------------------------------

create view bowling_scorecard
with (security_invoker = on) as
with per_over as (
  select
    d.innings_id,
    d.bowler_id,
    d.over_number,
    sum(d.bowler_runs)::int as runs_in_over,
    count(*) filter (where d.is_legal)::int as legal_in_over
  from deliveries d
  group by d.innings_id, d.bowler_id, d.over_number
),
totals as (
  select
    d.innings_id,
    d.bowler_id,
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
  select
    o.innings_id,
    o.bowler_id,
    count(*)::int as maidens
  from per_over o
  join innings i on i.id = o.innings_id
  join matches m on m.id = i.match_id
  where o.runs_in_over = 0 and o.legal_in_over >= m.balls_per_over
  group by o.innings_id, o.bowler_id
)
select
  t.innings_id,
  i.match_id,
  i.bowling_team_id as team_id,
  t.bowler_id as player_id,
  p.full_name,
  t.legal_balls,
  (t.legal_balls / m.balls_per_over)::text || '.' || (t.legal_balls % m.balls_per_over)::text as overs,
  t.runs_conceded,
  t.wickets,
  coalesce(mn.maidens, 0) as maidens,
  t.wides,
  t.no_balls,
  t.dots,
  case when t.legal_balls > 0
    then round(t.runs_conceded::numeric / (t.legal_balls::numeric / m.balls_per_over), 2)
    else 0 end as economy
from totals t
join innings i on i.id = t.innings_id
join matches m on m.id = i.match_id
join players p on p.id = t.bowler_id
left join maidens mn on mn.innings_id = t.innings_id and mn.bowler_id = t.bowler_id;

-- ---------------------------------------------------------------------------
-- Match summary: one row per match with both innings folded in
-- ---------------------------------------------------------------------------

create view match_summaries
with (security_invoker = on) as
select
  m.id as match_id,
  m.tournament_id,
  m.organization_id,
  m.status,
  m.stage,
  m.round,
  m.label,
  m.scheduled_at,
  m.overs_per_innings,
  m.balls_per_over,
  m.home_team_id,
  ht.name as home_team_name,
  ht.short_name as home_team_short,
  ht.primary_color as home_team_color,
  m.away_team_id,
  at.name as away_team_name,
  at.short_name as away_team_short,
  at.primary_color as away_team_color,
  v.name as venue_name,
  m.result_kind,
  m.winner_team_id,
  m.result_summary,
  i1.batting_team_id as first_innings_team_id,
  i1.runs as first_innings_runs,
  i1.wickets as first_innings_wickets,
  i1.legal_balls as first_innings_balls,
  i2.batting_team_id as second_innings_team_id,
  i2.runs as second_innings_runs,
  i2.wickets as second_innings_wickets,
  i2.legal_balls as second_innings_balls,
  i2.target as chase_target
from matches m
left join teams ht on ht.id = m.home_team_id
left join teams at on at.id = m.away_team_id
left join venues v on v.id = m.venue_id
left join innings_scores i1 on i1.match_id = m.id and i1.innings_number = 1
left join innings_scores i2 on i2.match_id = m.id and i2.innings_number = 2;

-- ---------------------------------------------------------------------------
-- Points table
-- ---------------------------------------------------------------------------

-- One row per side per completed match, from that side's point of view.
create view team_match_records
with (security_invoker = on) as
select
  m.id as match_id,
  m.tournament_id,
  own.batting_team_id as team_id,
  own.bowling_team_id as opponent_id,
  case
    when m.result_kind = 'walkover' and m.winner_team_id = own.batting_team_id then 'walkover_win'
    when m.result_kind = 'walkover' then 'walkover_loss'
    when m.result_kind = 'tie' then 'tie'
    when m.result_kind in ('no_result', 'abandoned', 'draw') then 'no_result'
    when m.winner_team_id = own.batting_team_id then 'win'
    else 'loss'
  end as outcome,
  own.runs as runs_scored,
  own.legal_balls as balls_faced,
  (own.wickets >= m.players_per_side - 1) as all_out,
  coalesce(opp.runs, 0) as runs_conceded,
  coalesce(opp.legal_balls, 0) as balls_bowled,
  coalesce(opp.wickets >= m.players_per_side - 1, false) as opponent_all_out,
  m.overs_per_innings as max_overs,
  m.balls_per_over
from matches m
join innings_scores own on own.match_id = m.id
left join innings_scores opp
  on opp.match_id = m.id and opp.batting_team_id = own.bowling_team_id
where m.status in ('completed', 'walkover', 'abandoned')
  and m.result_kind is not null;

create view tournament_standings
with (security_invoker = on) as
with charged as (
  select
    r.*,
    -- A side bowled out is charged its full quota of overs, not the overs it
    -- actually faced. Without this, being dismissed cheaply would flatter a
    -- team's run rate.
    case
      when r.all_out and r.max_overs is not null then r.max_overs::numeric
      else r.balls_faced::numeric / nullif(r.balls_per_over, 0)
    end as overs_faced,
    case
      when r.opponent_all_out and r.max_overs is not null then r.max_overs::numeric
      else r.balls_bowled::numeric / nullif(r.balls_per_over, 0)
    end as overs_bowled
  from team_match_records r
),
agg as (
  select
    c.tournament_id,
    c.team_id,
    count(*)::int as played,
    count(*) filter (where c.outcome in ('win', 'walkover_win'))::int as won,
    count(*) filter (where c.outcome in ('loss', 'walkover_loss'))::int as lost,
    count(*) filter (where c.outcome = 'tie')::int as tied,
    count(*) filter (where c.outcome = 'no_result')::int as no_result,
    sum(c.runs_scored) filter (where c.outcome not in ('no_result', 'walkover_win', 'walkover_loss'))::int as runs_scored,
    sum(c.overs_faced) filter (where c.outcome not in ('no_result', 'walkover_win', 'walkover_loss')) as overs_faced,
    sum(c.runs_conceded) filter (where c.outcome not in ('no_result', 'walkover_win', 'walkover_loss'))::int as runs_conceded,
    sum(c.overs_bowled) filter (where c.outcome not in ('no_result', 'walkover_win', 'walkover_loss')) as overs_bowled
  from charged c
  group by c.tournament_id, c.team_id
)
select
  a.tournament_id,
  a.team_id,
  t.name as team_name,
  t.short_name as team_short,
  t.primary_color as team_color,
  tt.group_label,
  a.played,
  a.won,
  a.lost,
  a.tied,
  a.no_result,
  (a.won * tr.points_win
    + a.lost * tr.points_loss
    + a.tied * tr.points_tie
    + a.no_result * tr.points_no_result)::int as points,
  coalesce(a.runs_scored, 0) as runs_scored,
  round(coalesce(a.overs_faced, 0), 1) as overs_faced,
  coalesce(a.runs_conceded, 0) as runs_conceded,
  round(coalesce(a.overs_bowled, 0), 1) as overs_bowled,
  round(
    coalesce(a.runs_scored::numeric / nullif(a.overs_faced, 0), 0)
      - coalesce(a.runs_conceded::numeric / nullif(a.overs_bowled, 0), 0),
    3
  ) as net_run_rate
from agg a
join teams t on t.id = a.team_id
join tournaments tr on tr.id = a.tournament_id
left join tournament_teams tt on tt.tournament_id = a.tournament_id and tt.team_id = a.team_id;

-- ---------------------------------------------------------------------------
-- Career figures
-- ---------------------------------------------------------------------------

create view player_batting_career
with (security_invoker = on) as
select
  b.player_id,
  p.full_name,
  p.organization_id,
  m.tournament_id,
  count(*)::int as innings,
  count(*) filter (where not b.is_out)::int as not_outs,
  sum(b.runs)::int as runs,
  sum(b.balls)::int as balls,
  sum(b.fours)::int as fours,
  sum(b.sixes)::int as sixes,
  count(*) filter (where b.runs >= 50 and b.runs < 100)::int as fifties,
  count(*) filter (where b.runs >= 100)::int as hundreds,
  max(b.runs)::int as high_score,
  case when count(*) filter (where b.is_out) > 0
    then round(sum(b.runs)::numeric / count(*) filter (where b.is_out), 2)
    else null end as average,
  case when sum(b.balls) > 0
    then round((sum(b.runs)::numeric / sum(b.balls)) * 100, 2)
    else 0 end as strike_rate
from batting_scorecard b
join players p on p.id = b.player_id
join matches m on m.id = b.match_id
where b.balls > 0 or b.is_out
group by b.player_id, p.full_name, p.organization_id, m.tournament_id;

create view player_bowling_career
with (security_invoker = on) as
select
  b.player_id,
  p.full_name,
  p.organization_id,
  m.tournament_id,
  count(*)::int as innings,
  sum(b.legal_balls)::int as legal_balls,
  sum(b.runs_conceded)::int as runs_conceded,
  sum(b.wickets)::int as wickets,
  sum(b.maidens)::int as maidens,
  max(b.wickets)::int as best_wickets,
  count(*) filter (where b.wickets >= 4 and b.wickets < 5)::int as four_wicket_hauls,
  count(*) filter (where b.wickets >= 5)::int as five_wicket_hauls,
  case when sum(b.wickets) > 0
    then round(sum(b.runs_conceded)::numeric / sum(b.wickets), 2)
    else null end as average,
  case when sum(b.legal_balls) > 0
    then round(sum(b.runs_conceded)::numeric / (sum(b.legal_balls)::numeric / max(m.balls_per_over)), 2)
    else 0 end as economy,
  case when sum(b.wickets) > 0
    then round(sum(b.legal_balls)::numeric / sum(b.wickets), 1)
    else null end as strike_rate
from bowling_scorecard b
join players p on p.id = b.player_id
join matches m on m.id = b.match_id
group by b.player_id, p.full_name, p.organization_id, m.tournament_id;

-- ---------------------------------------------------------------------------
-- Helper RPCs
-- ---------------------------------------------------------------------------

-- Record a delivery and return the row with its server-assigned sequence.
-- Wrapping the insert means an offline queue can retry blindly: the unique
-- (innings_id, idempotency_key) index turns a duplicate into a no-op that
-- returns the ball already stored.
create or replace function record_delivery(payload jsonb)
returns deliveries
language plpgsql
security invoker
as $$
declare
  result deliveries;
  key text := payload ->> 'idempotency_key';
  innings uuid := (payload ->> 'innings_id')::uuid;
begin
  select * into result from deliveries
  where innings_id = innings and idempotency_key = key;

  if found then
    return result;
  end if;

  insert into deliveries (
    innings_id, match_id, striker_id, non_striker_id, bowler_id,
    runs_off_bat, wide_runs, no_ball_runs, byes, leg_byes, penalty_runs,
    wicket_kind, player_out_id, fielder_id, free_hit,
    idempotency_key, recorded_by
  )
  values (
    innings,
    (payload ->> 'match_id')::uuid,
    (payload ->> 'striker_id')::uuid,
    (payload ->> 'non_striker_id')::uuid,
    (payload ->> 'bowler_id')::uuid,
    coalesce((payload ->> 'runs_off_bat')::int, 0),
    (payload ->> 'wide_runs')::int,
    (payload ->> 'no_ball_runs')::int,
    coalesce((payload ->> 'byes')::int, 0),
    coalesce((payload ->> 'leg_byes')::int, 0),
    coalesce((payload ->> 'penalty_runs')::int, 0),
    (payload ->> 'wicket_kind')::dismissal_kind,
    (payload ->> 'player_out_id')::uuid,
    (payload ->> 'fielder_id')::uuid,
    coalesce((payload ->> 'free_hit')::boolean, false),
    key,
    auth.uid()
  )
  on conflict (innings_id, idempotency_key) do nothing
  returning * into result;

  if result.id is null then
    select * into result from deliveries
    where innings_id = innings and idempotency_key = key;
  end if;

  return result;
end;
$$;

grant execute on function record_delivery(jsonb) to authenticated;
