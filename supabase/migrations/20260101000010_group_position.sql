-- ============================================================================
-- Cricket Arena — where each side finished in its group
-- ============================================================================
-- The points table was ordered correctly but never said what position anybody
-- was in, so nothing could mark who had qualified. Marking it in the app would
-- have meant re-implementing the tie-break rules in TypeScript alongside the
-- SQL that already does them — two places to get cricket wrong instead of one.
--
-- So the rank is computed here, by the same ordering the table already uses:
-- points, then net run rate, then wins. Qualification itself stays a decision
-- for the organiser, because how many go through is a tournament rule, not a
-- law of the game — a group of three might send two up or only the winner.
-- The view reports position; the app decides what that means.
-- ============================================================================

create or replace view tournament_standings
with (security_invoker = on) as
with charged as (
  select
    r.*,
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
),
ranked as (
  select
    a.tournament_id,
    a.team_id,
    t.name as team_name,
    t.short_name as team_short,
    t.primary_color as team_color,
    tt.group_label,
    a.played, a.won, a.lost, a.tied, a.no_result,
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
  left join tournament_teams tt on tt.tournament_id = a.tournament_id and tt.team_id = a.team_id
)
select
  r.*,
  -- Ranked inside the group when there is one, across the whole competition
  -- when there is not. Same ordering the table is displayed in, so position
  -- and row order can never disagree.
  row_number() over (
    partition by r.tournament_id, coalesce(r.group_label, '')
    order by r.points desc, r.net_run_rate desc, r.won desc, r.team_name
  )::int as group_position,
  -- Whether every fixture in this group has been played. Until it has,
  -- position is provisional and the app should not call anything qualified.
  not exists (
    select 1 from matches m
    where m.tournament_id = r.tournament_id
      and coalesce(m.group_label, '') = coalesce(r.group_label, '')
      and m.result_kind is null
  ) as group_complete
from ranked r;

comment on view tournament_standings is
  'Points table with each side''s position in its group. Qualification is the organiser''s rule, not the view''s.';
