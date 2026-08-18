-- ============================================================================
-- PPP4 — Game 4 result, and the correct start time
-- ============================================================================
-- Two changes:
--
--   1. Fixtures were created at 19:00. They are played at 17:00.
--   2. Game 4, Desert XI v Desert Lions, has been played.
--
-- Safe to run more than once.
--
-- ⚠️ ONE THING TO CHECK before you run this — see the note on Game 4 below.
-- ============================================================================

-- --- 1. Start time: 17:00, not 19:00 ---------------------------------------

update matches
set scheduled_at = date_trunc('day', scheduled_at) + interval '17 hours'
where tournament_id = (select id from tournaments where slug = 'ppp4-summer-sport-2026');

-- --- 2. Game 4 -------------------------------------------------------------
--
-- Confirmed by the organiser:
--
--     Desert Lions won the toss and chose to bat
--     Desert Lions 162/4  (10 overs)
--     Desert XI    163/3  (9.5 overs)  — 7 wickets in hand
--     Desert XI won by 7 wickets

do $$
declare
  tour uuid;
  g4 uuid;
  t_dxi uuid;
  t_dl uuid;
begin
  select id into tour from tournaments where slug = 'ppp4-summer-sport-2026';
  select id into g4 from matches where tournament_id = tour and match_order = 4;

  select id into t_dxi from teams where name = 'Desert XI';
  select id into t_dl  from teams where name = 'Desert Lions';

  if g4 is null then
    raise exception 'Game 4 not found — run import-ppp4.sql first';
  end if;

  -- Toss: Desert Lions won it and chose to bat.
  update matches
  set toss_winner_team_id = t_dl,
      toss_decision = 'bat'
  where id = g4;

  --                          match, batted first, 1st innings,  2nd innings
  --                                              runs wkts balls  runs wkts balls
  perform record_summary_match(g4, t_dl,           162,   4,   60,   163,   3,   59,
                               'From scoresheet');

  raise notice 'Game 4: Desert Lions 162/4, Desert XI 163/3 (9.5 ov) — Desert XI by 7 wickets';
end $$;

-- --- What the table looks like now ------------------------------------------

select group_label as "grp", team_short as "team", played as "p", won as "w",
       lost as "l", points as "pts", net_run_rate as "nrr"
from tournament_standings
where tournament_id = (select id from tournaments where slug = 'ppp4-summer-sport-2026')
order by group_label, points desc, net_run_rate desc;

select m.match_order as "game",
       to_char(m.scheduled_at, 'DD Mon HH24:MI') as "starts",
       coalesce(m.result_summary, 'not played yet') as "result"
from matches m
where m.tournament_id = (select id from tournaments where slug = 'ppp4-summer-sport-2026')
order by m.match_order;
