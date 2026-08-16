-- ============================================================================
-- Cricket Arena — matches recorded as a summary rather than ball by ball
-- ============================================================================
-- Every figure in this app is folded out of `deliveries`, which is the right
-- design for a match scored in the app: undo, corrections and live figures all
-- fall out of it for free.
--
-- It has one gap. A match played before the app existed, or scored on paper,
-- has a real result and no deliveries — and the points table would read it as
-- nought for nought. Clubs have filing cabinets full of exactly that.
--
-- So an innings may carry a summary: runs, wickets and balls faced, entered by
-- an organiser. `innings_scores` prefers the deliveries when there are any and
-- falls back to the summary when there are none, so both kinds of match sit in
-- one table and net run rate is computed identically for both.
--
-- The precedence matters: as soon as somebody scores a ball, the ball-by-ball
-- record wins. A summary can never silently override what was actually
-- recorded.
-- ============================================================================

alter table innings add column summary_runs int check (summary_runs is null or summary_runs >= 0);
alter table innings add column summary_wickets int check (summary_wickets between 0 and 10);
alter table innings add column summary_balls int check (summary_balls is null or summary_balls >= 0);
alter table innings add column summary_note text;

comment on column innings.summary_runs is
  'Set only for matches recorded from a paper scoresheet. Ignored once deliveries exist.';

-- ---------------------------------------------------------------------------
-- innings_scores: deliveries first, summary as the fallback
-- ---------------------------------------------------------------------------

create or replace view innings_scores
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
  -- A single count decides which source to trust, so the three figures below
  -- can never come from different places.
  case when count(d.id) > 0 then coalesce(sum(d.total_runs), 0)::int
       else coalesce(i.summary_runs, 0) end as runs,
  case when count(d.id) > 0
       then count(*) filter (
              where d.wicket_kind is not null and d.wicket_kind <> 'retired_not_out'
            )::int
       else coalesce(i.summary_wickets, 0) end as wickets,
  case when count(d.id) > 0 then count(*) filter (where d.is_legal)::int
       else coalesce(i.summary_balls, 0) end as legal_balls,
  coalesce(sum(d.wide_runs), 0)::int as wides,
  coalesce(sum(d.no_ball_runs), 0)::int as no_balls,
  coalesce(sum(d.byes), 0)::int as byes,
  coalesce(sum(d.leg_byes), 0)::int as leg_byes,
  coalesce(sum(d.penalty_runs), 0)::int as penalties,
  coalesce(sum(d.wide_runs), 0)::int
    + coalesce(sum(d.no_ball_runs), 0)::int
    + coalesce(sum(d.byes), 0)::int
    + coalesce(sum(d.leg_byes), 0)::int
    + coalesce(sum(d.penalty_runs), 0)::int as extras,
  (count(d.id) = 0 and i.summary_runs is not null) as from_summary
from innings i
left join deliveries d on d.innings_id = i.id
group by i.id;

comment on view innings_scores is
  'Team totals per innings. Uses the ball-by-ball record when it exists, otherwise the organiser''s summary.';

-- ---------------------------------------------------------------------------
-- Record a completed match from a scoresheet
-- ---------------------------------------------------------------------------
-- Doing this in one function keeps the two innings and the result consistent:
-- a half-entered match with one innings and no result would show up in the
-- table as a game nobody won.

create or replace function record_summary_match(
  p_match_id uuid,
  p_first_batting_team uuid,
  p_first_runs int,
  p_first_wickets int,
  p_first_balls int,
  p_second_runs int,
  p_second_wickets int,
  p_second_balls int,
  p_note text default null
)
returns void
language plpgsql
security invoker
as $$
declare
  m matches;
  second_team uuid;
  winner uuid;
  kind result_kind;
  summary text;
  first_name text;
  second_name text;
  wickets_left int;
begin
  select * into m from matches where id = p_match_id;
  if not found then
    raise exception 'Match not found';
  end if;

  second_team := case when p_first_batting_team = m.home_team_id
                      then m.away_team_id else m.home_team_id end;

  select name into first_name from teams where id = p_first_batting_team;
  select name into second_name from teams where id = second_team;

  -- Replace any previous attempt so this can be corrected by running it again.
  delete from innings where match_id = p_match_id;

  insert into innings (
    match_id, innings_number, batting_team_id, bowling_team_id,
    summary_runs, summary_wickets, summary_balls, summary_note,
    closed, end_reason, closed_at
  )
  values (
    p_match_id, 1, p_first_batting_team, second_team,
    p_first_runs, p_first_wickets, p_first_balls, p_note,
    true,
    case when p_first_wickets >= m.players_per_side - 1
         then 'all_out'::innings_end_reason
         else 'overs_complete'::innings_end_reason end,
    now()
  );

  insert into innings (
    match_id, innings_number, batting_team_id, bowling_team_id, target,
    summary_runs, summary_wickets, summary_balls, summary_note,
    closed, end_reason, closed_at
  )
  values (
    p_match_id, 2, second_team, p_first_batting_team, p_first_runs + 1,
    p_second_runs, p_second_wickets, p_second_balls, p_note,
    true,
    case when p_second_runs > p_first_runs then 'target_reached'::innings_end_reason
         when p_second_wickets >= m.players_per_side - 1 then 'all_out'::innings_end_reason
         else 'overs_complete'::innings_end_reason end,
    now()
  );

  wickets_left := (m.players_per_side - 1) - p_second_wickets;

  if p_second_runs > p_first_runs then
    kind := 'win'; winner := second_team;
    summary := second_name || ' won by ' || wickets_left ||
               ' wicket' || case when wickets_left = 1 then '' else 's' end;
  elsif p_first_runs > p_second_runs then
    kind := 'win'; winner := p_first_batting_team;
    summary := first_name || ' won by ' || (p_first_runs - p_second_runs) ||
               ' run' || case when p_first_runs - p_second_runs = 1 then '' else 's' end;
  else
    kind := 'tie'; winner := null; summary := 'Match tied';
  end if;

  update matches
  set status = 'completed',
      result_kind = kind,
      winner_team_id = winner,
      result_summary = summary,
      result_margin_runs = case when kind = 'win' and winner = p_first_batting_team
                                then p_first_runs - p_second_runs end,
      result_margin_wickets = case when kind = 'win' and winner = second_team
                                   then wickets_left end
  where id = p_match_id;
end;
$$;

grant execute on function record_summary_match(uuid, uuid, int, int, int, int, int, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Finding someone by email, to add them to a committee
-- ---------------------------------------------------------------------------
-- The client cannot read auth.users, and rightly so. This exposes exactly one
-- fact — does this address belong to an account — and only to someone who
-- already administers an organisation, so it cannot be used to enumerate users.

create or replace function find_profile_by_email(lookup_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  found uuid;
begin
  if not exists (
    select 1 from organization_members
    where user_id = auth.uid() and role = 'tournament_admin'
  ) then
    raise exception 'Only an organisation administrator can look up an account'
      using errcode = '42501';
  end if;

  select id into found from auth.users where lower(email) = lower(lookup_email);
  return found;
end;
$$;

grant execute on function find_profile_by_email(text) to authenticated;
