-- ============================================================================
-- Cricket Arena — demo data
-- ============================================================================
-- Creates one organisation, six teams with full squads, a T20 league with a
-- generated fixture list, and simulates the first four matches ball by ball so
-- that scorecards, points tables and leaderboards all have something real in
-- them the first time you open the app.
--
-- Safe to re-run: it clears the demo organisation first.
-- ============================================================================

do $$
-- Several locals below share a name with a column of the table being written
-- (target, runs_off_bat, byes...). Tell plpgsql the variable always wins.
#variable_conflict use_variable
declare
  org_id uuid;
  tour_id uuid;
  venue_a uuid;
  venue_b uuid;
  team_ids uuid[] := '{}';
  tid uuid;
  team_names text[] := array[
    'Riyadh Falcons', 'Dammam Warriors', 'Jeddah Titans',
    'Khobar Strikers', 'Makkah Royals', 'Madina Blues'
  ];
  team_shorts text[] := array['RF', 'DW', 'JT', 'KS', 'MR', 'MB'];
  team_colors text[] := array['#20D78A', '#6E8BFF', '#FFBF47', '#FF5D67', '#B8F34A', '#7C5CFF'];
  first_names text[] := array[
    'Adnan','Rashid','Imran','Bilal','Kamran','Nasir','Zubair','Faisal','Tariq','Yasir',
    'Hamza','Saad','Umar','Waqas','Junaid','Arif','Danish','Ehsan','Farhan','Ghulam'
  ];
  last_names text[] := array[
    'Rahman','Hussain','Khan','Ali','Sheikh','Malik','Qureshi','Butt','Chaudhry','Aslam',
    'Iqbal','Javed','Mahmood','Nawaz','Siddiqui','Zaman','Baig','Farooq','Hashmi','Raza'
  ];
  i int;
  j int;
  pid uuid;
  fixture_round int;
  fixture_order int := 0;
  home uuid;
  away uuid;
  n int := 6;
  half int := 3;
  rotating uuid[];
  lineup uuid[];
  match_id uuid;
begin
  -- Reset any previous demo data.
  delete from organizations where slug = 'riyadh-cricket-board';

  insert into organizations (name, slug, city, country)
  values ('Riyadh Cricket Board', 'riyadh-cricket-board', 'Riyadh', 'Saudi Arabia')
  returning id into org_id;

  insert into venues (organization_id, name, city, floodlights)
  values (org_id, 'Al Nakheel Oval', 'Riyadh', true) returning id into venue_a;
  insert into venues (organization_id, name, city, floodlights)
  values (org_id, 'Diplomatic Quarter Ground', 'Riyadh', false) returning id into venue_b;

  -- --- teams and squads ----------------------------------------------------
  for i in 1..6 loop
    insert into teams (organization_id, name, short_name, primary_color, home_venue_id)
    values (org_id, team_names[i], team_shorts[i], team_colors[i],
            case when i % 2 = 0 then venue_b else venue_a end)
    returning id into tid;
    team_ids := team_ids || tid;

    for j in 1..12 loop
      insert into players (
        organization_id, full_name, jersey_number, role, batting_style, bowling_style, credit_value
      )
      values (
        org_id,
        first_names[((i - 1) * 12 + j - 1) % 20 + 1] || ' ' || last_names[((i * 7 + j * 3)) % 20 + 1],
        j,
        case
          when j <= 5 then 'batter'::player_role
          when j = 6 then 'wicket_keeper_batter'::player_role
          when j <= 8 then 'all_rounder'::player_role
          else 'bowler'::player_role
        end,
        case when j % 4 = 0 then 'left_hand'::batting_style else 'right_hand'::batting_style end,
        case
          when j <= 5 then 'none'::bowling_style
          when j <= 8 then 'right_arm_medium'::bowling_style
          when j = 9 then 'right_arm_off_break'::bowling_style
          when j = 10 then 'left_arm_orthodox'::bowling_style
          else 'right_arm_fast'::bowling_style
        end,
        round((6.5 + (j % 6) * 0.8)::numeric, 1)
      )
      returning id into pid;

      insert into team_members (team_id, player_id, is_captain, is_wicket_keeper)
      values (tid, pid, j = 1, j = 6);
    end loop;
  end loop;

  -- --- tournament ----------------------------------------------------------
  insert into tournaments (
    organization_id, name, slug, season, format, match_format, status, is_public,
    description, start_date, end_date,
    overs_per_innings, players_per_side, max_overs_per_bowler
  )
  values (
    org_id, 'Riyadh Premier League', 'riyadh-premier-league', '2026',
    'round_robin', 'T20', 'active', true,
    'Six-team T20 league played across two grounds in Riyadh.',
    current_date - 21, current_date + 21,
    20, 11, 4
  )
  returning id into tour_id;

  for i in 1..6 loop
    insert into tournament_teams (tournament_id, team_id, seed)
    values (tour_id, team_ids[i], i);
  end loop;

  insert into channels (organization_id, tournament_id, name, kind)
  values (org_id, tour_id, 'Riyadh Premier League', 'tournament');

  -- --- fixtures: circle-method round robin ---------------------------------
  rotating := team_ids[2:6];
  for fixture_round in 1..5 loop
    lineup := array[team_ids[1]] || rotating;
    for i in 1..half loop
      home := lineup[i];
      away := lineup[n + 1 - i];
      fixture_order := fixture_order + 1;

      insert into matches (
        tournament_id, organization_id, home_team_id, away_team_id, venue_id,
        status, stage, round, match_order, label, scheduled_at,
        overs_per_innings, players_per_side, max_overs_per_bowler
      )
      values (
        tour_id, org_id,
        case when fixture_round % 2 = 0 and i = 1 then away else home end,
        case when fixture_round % 2 = 0 and i = 1 then home else away end,
        case when i % 2 = 0 then venue_b else venue_a end,
        'scheduled', 'league', fixture_round, fixture_order,
        'Round ' || fixture_round,
        (current_date - 21 + (fixture_round - 1) * 7)::timestamptz + interval '16 hours',
        20, 11, 4
      );
    end loop;
    rotating := array[rotating[5]] || rotating[1:4];
  end loop;

  raise notice 'Seeded organisation % with tournament %', org_id, tour_id;
end $$;

-- ---------------------------------------------------------------------------
-- Simulate the first four matches ball by ball.
-- ---------------------------------------------------------------------------

do $$
#variable_conflict use_variable
declare
  m record;
  inn int;
  innings_id uuid;
  bat_team uuid;
  bowl_team uuid;
  xi uuid[];
  bowlers uuid[];
  striker uuid;
  non_striker uuid;
  next_bat int;
  bowler uuid;
  last_bowler uuid;
  bowler_pick int;
  legal int;
  wickets int;
  runs int;
  target int;
  outcome int;
  runs_off_bat int;
  wide int;
  no_ball int;
  byes int;
  leg_byes int;
  wicket dismissal_kind;
  out_player uuid;
  fielder uuid;
  fielders uuid[];
  swap uuid;
  p record;
  seed_counter int := 0;
  first_runs int;
  first_wkts int;
  first_balls int;
begin
  for m in
    select * from matches
    where tournament_id = (select id from tournaments where slug = 'riyadh-premier-league')
    order by match_order
    limit 4
  loop
    -- Name an eleven for both sides, batting order following squad number.
    for p in
      select tm.team_id, tm.player_id,
             row_number() over (partition by tm.team_id order by pl.jersey_number) as pos
      from team_members tm
      join players pl on pl.id = tm.player_id
      where tm.team_id in (m.home_team_id, m.away_team_id)
    loop
      if p.pos <= 11 then
        insert into playing_xi (match_id, team_id, player_id, batting_order, is_captain, is_wicket_keeper)
        values (m.id, p.team_id, p.player_id, p.pos, p.pos = 1, p.pos = 6);
      end if;
    end loop;

    update matches
    set toss_winner_team_id = m.home_team_id, toss_decision = 'bat', status = 'live'
    where id = m.id;

    first_runs := 0; first_wkts := 0; first_balls := 0;

    for inn in 1..2 loop
      if inn = 1 then
        bat_team := m.home_team_id; bowl_team := m.away_team_id; target := null;
      else
        bat_team := m.away_team_id; bowl_team := m.home_team_id; target := first_runs + 1;
      end if;

      select array_agg(player_id order by batting_order)
        into xi from playing_xi where match_id = m.id and team_id = bat_team;
      select array_agg(player_id order by batting_order desc)
        into bowlers from playing_xi where match_id = m.id and team_id = bowl_team;
      select array_agg(player_id order by batting_order)
        into fielders from playing_xi where match_id = m.id and team_id = bowl_team;

      insert into innings (match_id, innings_number, batting_team_id, bowling_team_id, target)
      values (m.id, inn, bat_team, bowl_team, target)
      returning id into innings_id;

      striker := xi[1]; non_striker := xi[2]; next_bat := 3;
      legal := 0; wickets := 0; runs := 0; last_bowler := null; bowler_pick := 1;
      bowler := bowlers[1];

      while legal < 120 and wickets < 10 and (target is null or runs < target) loop
        -- Change bowler at the top of each over, never twice in a row.
        if legal % 6 = 0 then
          bowler_pick := bowler_pick + 1;
          if bowler_pick > 6 then bowler_pick := 1; end if;
          bowler := bowlers[bowler_pick];
          if bowler = last_bowler then
            bowler := bowlers[(bowler_pick % 6) + 1];
          end if;
        end if;

        seed_counter := seed_counter + 1;
        -- Deterministic pseudo-random so re-seeding gives the same league table.
        outcome := (seed_counter * 7919 + legal * 104729 + wickets * 31) % 100;

        runs_off_bat := 0; wide := null; no_ball := null; byes := 0; leg_byes := 0;
        wicket := null; out_player := null; fielder := null;

        if outcome < 33 then runs_off_bat := 0;
        elsif outcome < 58 then runs_off_bat := 1;
        elsif outcome < 68 then runs_off_bat := 2;
        elsif outcome < 70 then runs_off_bat := 3;
        elsif outcome < 82 then runs_off_bat := 4;
        elsif outcome < 88 then runs_off_bat := 6;
        elsif outcome < 91 then wide := 1;
        elsif outcome < 92 then no_ball := 1; runs_off_bat := 1;
        elsif outcome < 94 then leg_byes := 1;
        elsif outcome < 95 then byes := 2;
        else
          wicket := (array['bowled','caught','lbw','caught','run_out','stumped'])[(outcome % 6) + 1]::dismissal_kind;
          out_player := striker;
          if wicket in ('caught', 'run_out', 'stumped') then
            fielder := fielders[(outcome % 11) + 1];
            if fielder = bowler then fielder := fielders[((outcome + 3) % 11) + 1]; end if;
          end if;
        end if;

        insert into deliveries (
          innings_id, match_id, striker_id, non_striker_id, bowler_id,
          runs_off_bat, wide_runs, no_ball_runs, byes, leg_byes,
          wicket_kind, player_out_id, fielder_id, idempotency_key
        )
        values (
          innings_id, m.id, striker, non_striker, bowler,
          runs_off_bat, wide, no_ball, byes, leg_byes,
          wicket, out_player, fielder,
          'seed-' || innings_id::text || '-' || seed_counter::text
        );

        runs := runs + runs_off_bat + coalesce(wide, 0) + coalesce(no_ball, 0) + byes + leg_byes;

        if wide is null and no_ball is null then
          legal := legal + 1;
        end if;

        if wicket is not null then
          wickets := wickets + 1;
          if next_bat <= 11 then
            striker := xi[next_bat];
            next_bat := next_bat + 1;
          else
            exit;
          end if;
        elsif (runs_off_bat + byes + leg_byes) % 2 = 1 then
          swap := striker; striker := non_striker; non_striker := swap;
        end if;

        if wide is null and no_ball is null and legal % 6 = 0 then
          last_bowler := bowler;
          swap := striker; striker := non_striker; non_striker := swap;
        end if;
      end loop;

      update innings
      set closed = true,
          closed_at = now(),
          end_reason = case
            when target is not null and runs >= target then 'target_reached'::innings_end_reason
            when wickets >= 10 then 'all_out'::innings_end_reason
            else 'overs_complete'::innings_end_reason
          end
      where id = innings_id;

      if inn = 1 then
        first_runs := runs; first_wkts := wickets; first_balls := legal;
      end if;
    end loop;

    -- Settle the result from the two innings totals.
    update matches m2
    set status = 'completed',
        result_kind = case
          when s2.runs > s1.runs then 'win'::result_kind
          when s1.runs > s2.runs then 'win'::result_kind
          else 'tie'::result_kind
        end,
        winner_team_id = case
          when s2.runs > s1.runs then s2.batting_team_id
          when s1.runs > s2.runs then s1.batting_team_id
          else null
        end,
        result_margin_runs = case when s1.runs > s2.runs then s1.runs - s2.runs else null end,
        result_margin_wickets = case when s2.runs > s1.runs then 10 - s2.wickets else null end,
        result_summary = case
          when s1.runs > s2.runs then t1.name || ' won by ' || (s1.runs - s2.runs) || ' runs'
          when s2.runs > s1.runs then t2.name || ' won by ' || (10 - s2.wickets) || ' wickets'
          else 'Match tied'
        end
    from innings_scores s1, innings_scores s2, teams t1, teams t2
    where m2.id = m.id
      and s1.match_id = m.id and s1.innings_number = 1
      and s2.match_id = m.id and s2.innings_number = 2
      and t1.id = s1.batting_team_id and t2.id = s2.batting_team_id;
  end loop;

  raise notice 'Simulated 4 matches';
end $$;
