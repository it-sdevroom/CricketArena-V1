-- ============================================================================
-- PPP4 — squads from the registration forms, and the last two group games
-- ============================================================================
-- Adds the player lists you sent, plus games 5 and 6, which completes the
-- group stage.
--
-- PHONE NUMBERS ARE DELIBERATELY NOT IMPORTED. The forms carry a WhatsApp
-- number for every player, and rosters in this app are readable by anyone —
-- that is what makes a public scorecard work. Publishing fifty personal phone
-- numbers to do it would be indefensible, and nothing in the app needs them.
-- Staff numbers are left out for the same reason; they identify an employee,
-- not a cricketer.
--
-- Safe to re-run: players are matched by name within their team, so running it
-- twice does not create duplicates.
-- ============================================================================

do $$
declare
  org uuid;
  tour uuid;

  -- name, then the squad as a flat array
  squads jsonb := jsonb_build_object(
    'Desert Lions', jsonb_build_array(
      'Manu Mishra', 'Muhammad Awais Saleem', 'Khawar Rafique',
      'Muhammad Zeeshan Afzal', 'Khalid Khan', 'Jithukrishnan Kannukettil',
      'Mahabub Alam Faisal', 'Sadik Hossain', 'Sujith Ramachandran',
      'Malik Imran Hussain', 'Chakaravarthy Velusamy', 'Muhammad Faisal',
      'Javeda Patel', 'Talha', 'Kamran Ahmed'
    ),
    'Golden Tiger', jsonb_build_array(
      'Uditha Veranga', 'M D Anik', 'Md Rakib Dewan', 'Md Summon',
      'Imran Ovi', 'Prodip Roy', 'Md Nurul Amin', 'Saidur Hossain',
      'A B Rahman', 'Alamin Hossen', 'Syam Ambika', 'Ajin Arul Prakash',
      'Jeju Nickson', 'Muhammad Saydur Rahman', 'Md Nesar', 'Md Simul'
    ),
    'Canteen Tiger', jsonb_build_array(
      'Niranjana Moolay', 'Saiful Islam', 'Md Tamim', 'Md Abdul Hakim',
      'Ashraful Chowdhury', 'Somrat Mia Mst', 'Kazi Ashekunnabi',
      'Kaunain Rabbani', 'Jim Babu', 'Md Robin Ali Sheikh', 'Antar Miah',
      'Mohammad Jawed Akhtar', 'Md Shamim', 'Sujan', 'Hamid Raza'
    ),
    'Friends 11', jsonb_build_array(
      'Chayan Bhatty', 'Md Anwar Hossain', 'Mohammad Opu', 'Md Al Amin',
      'Md Roky Mia', 'Kamruzzaman Tola Mia', 'Rajesh Kumar Sah',
      'Sani Ishaque Miah Shipon', 'Bishun Kumar Mandal', 'Titu Mia',
      'Monir Hossain', 'Md Akash', 'Iman Mia'
    ),
    -- The 11 Fighter form was cut off in the photograph after row 8; the rest
    -- can be added from the app once you have the full list.
    '11 Fighter', jsonb_build_array(
      'Zillur Rahaman', 'Sohag Hossain', 'Uzzal Hossen', 'Mizanur Rahman',
      'Monsur Ahammed', 'Amirul Haque Sumon', 'Md Alamin', 'Md Abdul Alim'
    )
  );

  team_name text;
  tid uuid;
  player_name text;
  pid uuid;
  added int := 0;
  shirt int;
begin
  select id into org from organizations where slug = 'ppp4-summer-sport';
  select id into tour from tournaments where slug = 'ppp4-summer-sport-2026';

  if org is null then
    raise exception 'Run import-ppp4.sql first';
  end if;

  for team_name in select jsonb_object_keys(squads) loop
    select id into tid from teams
    where organization_id = org and teams.name = team_name;

    if tid is null then
      raise notice 'No team called % — skipped', team_name;
      continue;
    end if;

    shirt := 0;
    for player_name in
      select jsonb_array_elements_text(squads -> team_name)
    loop
      shirt := shirt + 1;

      -- Match on name within the organisation so re-running is harmless.
      select p.id into pid
      from players p
      join team_members tm on tm.player_id = p.id and tm.team_id = tid
      where p.organization_id = org and lower(p.full_name) = lower(player_name)
      limit 1;

      if pid is null then
        insert into players (organization_id, full_name, jersey_number, role)
        values (org, player_name, shirt, 'all_rounder')
        returning id into pid;

        insert into team_members (team_id, player_id)
        values (tid, pid)
        on conflict do nothing;

        added := added + 1;
      end if;
    end loop;
  end loop;

  raise notice 'Added % players', added;
end $$;

-- ---------------------------------------------------------------------------
-- Games 5 and 6 — the group stage is now complete
-- ---------------------------------------------------------------------------

do $$
declare
  tour uuid;
  g5 uuid; g6 uuid;
  t_ct uuid; t_f11 uuid; t_gt uuid; t_dl uuid;
begin
  select id into tour from tournaments where slug = 'ppp4-summer-sport-2026';

  select id into t_ct  from teams where name = 'Canteen Tiger';
  select id into t_f11 from teams where name = 'Friends 11';
  select id into t_gt  from teams where name = 'Golden Tiger';
  select id into t_dl  from teams where name = 'Desert Lions';

  select id into g5 from matches where tournament_id = tour and match_order = 5;
  select id into g6 from matches where tournament_id = tour and match_order = 6;

  -- Game 5: Canteen Tiger 149/5 (10), Friends 11 122/4 (10). By 27 runs.
  update matches set toss_winner_team_id = t_ct, toss_decision = 'bat' where id = g5;
  perform record_summary_match(g5, t_ct, 149, 5, 60, 122, 4, 60, 'From scoresheet');

  -- Game 6: Golden Tiger 140/7 (10), Desert Lions 141/2 (8.5 = 53 balls).
  update matches set toss_winner_team_id = t_gt, toss_decision = 'bat' where id = g6;
  perform record_summary_match(g6, t_gt, 140, 7, 60, 141, 2, 53, 'From scoresheet');

  raise notice 'Games 5 and 6 recorded — group stage complete';
end $$;

-- ---------------------------------------------------------------------------
-- The final group tables
-- ---------------------------------------------------------------------------

select
  group_label as "grp",
  case when group_complete and group_position <= 2 then 'Q' else '' end as "qualified",
  team_short as "team",
  played as "p", won as "w", lost as "l",
  points as "pts",
  net_run_rate as "nrr"
from tournament_standings
where tournament_id = (select id from tournaments where slug = 'ppp4-summer-sport-2026')
order by group_label, group_position;

select m.match_order as "game", m.group_label as "grp",
       coalesce(m.result_summary, 'not played') as "result"
from matches m
where m.tournament_id = (select id from tournaments where slug = 'ppp4-summer-sport-2026')
order by m.match_order;
