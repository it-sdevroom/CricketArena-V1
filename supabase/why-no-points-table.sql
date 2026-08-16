-- ============================================================================
-- Why is the points table empty?
-- ============================================================================
-- Read-only. Run the whole thing; each query answers one link in the chain and
-- the last one tells you which link is broken.
--
-- The chain is: a match must be COMPLETED and carry a RESULT, which produces
-- rows in team_match_records, which is what tournament_standings aggregates.
-- A fixture that has been played but never marked completed is invisible to
-- the table, which is the usual cause.
-- ============================================================================

-- 1. Which tournaments exist at all?
select
  t.name as "tournament",
  t.slug,
  t.status,
  (select count(*) from matches m where m.tournament_id = t.id) as "fixtures",
  (select count(*) from matches m
     where m.tournament_id = t.id and m.status = 'completed') as "completed",
  (select count(*) from matches m
     where m.tournament_id = t.id and m.result_kind is not null) as "with a result"
from tournaments t
order by t.created_at desc;

-- 2. Every match, and whether it qualifies for the table.
select
  coalesce(t.name, 'no tournament') as "tournament",
  m.match_order as "game",
  h.short_name || ' v ' || a.short_name as "fixture",
  m.status,
  coalesce(m.result_kind::text, '—') as "result kind",
  coalesce(m.result_summary, '—') as "result",
  case
    when m.tournament_id is null then 'not in a tournament'
    when m.status <> 'completed' then 'not marked completed'
    when m.result_kind is null then 'completed but no result recorded'
    else 'counts toward the table'
  end as "verdict"
from matches m
left join tournaments t on t.id = m.tournament_id
left join teams h on h.id = m.home_team_id
left join teams a on a.id = m.away_team_id
order by t.name, m.match_order;

-- 3. Do the innings have any figures behind them?
--    A completed match with no deliveries AND no summary shows as 0/0.
select
  m.match_order as "game",
  i.innings_number as "inns",
  tm.short_name as "batting",
  s.runs,
  s.wickets,
  s.legal_balls as "balls",
  case
    when (select count(*) from deliveries d where d.innings_id = i.id) > 0
      then 'ball by ball'
    when i.summary_runs is not null then 'typed summary'
    else 'NOTHING — this is why it reads 0'
  end as "source"
from innings i
join matches m on m.id = i.match_id
join innings_scores s on s.innings_id = i.id
join teams tm on tm.id = i.batting_team_id
order by m.match_order, i.innings_number;

-- 4. The rows the table is built from. Empty here means empty in the app.
select count(*) as "qualifying innings rows" from team_match_records;

-- 5. The table itself.
select
  coalesce(group_label, '—') as "grp",
  team_short as "team",
  played, won, lost, points, net_run_rate as "nrr"
from tournament_standings
order by group_label nulls first, points desc, net_run_rate desc;

-- 6. The verdict.
select case
  when not exists (select 1 from tournaments)
    then 'No tournament exists. Run import-ppp4.sql, or create one in the app.'
  when not exists (select 1 from matches where tournament_id is not null)
    then 'A tournament exists but has no fixtures. Generate them in the organiser console.'
  when not exists (select 1 from matches where status = 'completed')
    then 'Fixtures exist but none is marked completed. A table only counts finished matches — score one in the app, or run import-ppp4.sql to load the three you already played.'
  when not exists (select 1 from matches where result_kind is not null)
    then 'Matches are completed but carry no result. Re-run import-ppp4.sql, which sets the result as well as the status.'
  when not exists (select 1 from team_match_records)
    then 'Results exist but produce no rows — the innings are missing. Re-run import-ppp4.sql.'
  else 'The table has data. If the app still shows nothing, you are looking at a different tournament, or the app needs a refresh: pull down on the tournament screen.'
end as "what to do";
