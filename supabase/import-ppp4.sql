-- ============================================================================
-- PPP4 Summer Sport 2026 — Cricket Tournament
-- ============================================================================
-- Creates the real competition from your fixture sheet: the organisation, the
-- venue, six teams and the six scheduled games.
--
-- BEFORE RUNNING: put your own email on the line marked below, so you are made
-- the administrator and the app lets you manage it.
--
-- Safe to re-run: it removes and rebuilds the same tournament rather than
-- creating a second copy.
--
-- What this does NOT do is enter the ball-by-ball scores from the paper sheets.
-- Those are handwritten, and a misread digit becomes a wrong scorecard that
-- nobody can tell is wrong. Score those matches in the app instead, or send a
-- typed summary and I will import it exactly.
-- ============================================================================

do $$
declare
  -- >>> PUT YOUR EMAIL HERE <<<
  admin_email text := 'your@email.com';

  admin_id uuid;
  org_id uuid;
  tour_id uuid;
  ground_id uuid;

  team_names text[] := array[
    '11 Fighter', 'Canteen Tiger', 'Desert XI',
    'Golden Tiger', 'Friends 11', 'Desert Lions'
  ];
  team_shorts text[] := array['11F', 'CT', 'DXI', 'GT', 'F11', 'DL'];
  team_colors text[] := array['#20D78A', '#FFBF47', '#6E8BFF', '#B8F34A', '#FF5D67', '#7C5CFF'];

  ids uuid[] := '{}';
  tid uuid;
  i int;

  -- Fixtures exactly as scheduled: home, away, date.
  -- Six games, not a full round robin — this is what the sheet says.
  fixtures text[][] := array[
    array['1', '2', '2026-08-10'],
    array['3', '4', '2026-08-12'],
    array['1', '5', '2026-08-15'],
    array['3', '6', '2026-08-17'],
    array['2', '5', '2026-08-19'],
    array['4', '6', '2026-08-22']
  ];
  f text[];
  n int := 0;
begin
  select id into admin_id from auth.users where email = admin_email;
  if admin_id is null then
    raise exception 'No account found for %. Sign up in the app first, then run this.', admin_email;
  end if;

  -- Rebuild rather than duplicate.
  delete from organizations where slug = 'ppp4-summer-sport';

  insert into organizations (name, slug, city, country, created_by)
  values ('PPP4 Summer Sport', 'ppp4-summer-sport', 'Riyadh', 'Saudi Arabia', admin_id)
  returning id into org_id;

  -- The trigger makes the creator an admin; make sure of it either way.
  insert into organization_members (organization_id, user_id, role)
  values (org_id, admin_id, 'tournament_admin')
  on conflict (organization_id, user_id) do update set role = 'tournament_admin';

  insert into venues (organization_id, name, city)
  values (org_id, 'Accommodation Ground', 'Riyadh')
  returning id into ground_id;

  insert into tournaments (
    organization_id, name, slug, season, format, match_format, status, is_public,
    description, start_date, end_date,
    overs_per_innings, players_per_side, max_overs_per_bowler, created_by
  )
  values (
    org_id,
    'PPP4 Summer Sport 2026',
    'ppp4-summer-sport-2026',
    '2026',
    'groups',            -- two groups of three, each a round robin
    'T10',
    'active',
    true,
    'One Team. One Goal. One Victory. Together we play, together we win.',
    date '2026-08-10',
    date '2026-08-22',
    10, 11, 2,
    admin_id
  )
  returning id into tour_id;

  update tournaments set group_count = 2 where id = tour_id;

  -- Teams.
  for i in 1..6 loop
    insert into teams (organization_id, name, short_name, primary_color, home_venue_id)
    values (org_id, team_names[i], team_shorts[i], team_colors[i], ground_id)
    returning id into tid;
    ids := ids || tid;

    insert into tournament_teams (tournament_id, team_id, seed, group_label)
    values (tour_id, tid, i, case when i in (1, 2, 5) then 'A' else 'B' end);
  end loop;

  -- Fixtures, in the order and on the dates given.
  foreach f slice 1 in array fixtures loop
    n := n + 1;
    insert into matches (
      tournament_id, organization_id, home_team_id, away_team_id, venue_id,
      status, stage, round, match_order, label, scheduled_at,
      overs_per_innings, players_per_side, max_overs_per_bowler, created_by,
      group_label
    )
    values (
      tour_id, org_id,
      ids[f[1]::int], ids[f[2]::int], ground_id,
      'scheduled', 'group', n, n,
      'Group ' || (case when n in (1, 3, 5) then 'A' else 'B' end) || ' • Game ' || n,
      (f[3]::date)::timestamptz + interval '16 hours',
      10, 11, 2, admin_id,
      case when n in (1, 3, 5) then 'A' else 'B' end
    );
  end loop;

  insert into channels (organization_id, tournament_id, name, kind)
  values (org_id, tour_id, 'PPP4 Summer Sport 2026', 'tournament');

  raise notice 'Created PPP4 Summer Sport 2026: 6 teams, % fixtures, admin %', n, admin_email;
end $$;

-- Check it landed.
select m.group_label as "group",
       m.match_order as "game",
       to_char(m.scheduled_at, 'DD Mon (Dy)') as "date",
       h.name as "team a",
       a.name as "team b",
       v.name as "venue"
from matches m
join teams h on h.id = m.home_team_id
join teams a on a.id = m.away_team_id
left join venues v on v.id = m.venue_id
where m.tournament_id = (select id from tournaments where slug = 'ppp4-summer-sport-2026')
order by m.match_order;


-- ============================================================================
-- Results, from your scoresheets
-- ============================================================================
-- Three games played, three still to come. Recorded as summaries because they
-- were scored on paper; the points table and net run rate compute from these
-- exactly as they would from ball-by-ball data.
--
-- 10 overs = 60 balls, 6.3 overs = 39 balls, 7.1 overs = 43 balls.
-- ============================================================================

do $$
declare
  tour uuid;
  g1 uuid; g2 uuid; g3 uuid;
  t_11f uuid; t_ct uuid; t_dxi uuid; t_gt uuid; t_f11 uuid;
begin
  select id into tour from tournaments where slug = 'ppp4-summer-sport-2026';

  select id into t_11f from teams where name = '11 Fighter';
  select id into t_ct  from teams where name = 'Canteen Tiger';
  select id into t_dxi from teams where name = 'Desert XI';
  select id into t_gt  from teams where name = 'Golden Tiger';
  select id into t_f11 from teams where name = 'Friends 11';

  select id into g1 from matches where tournament_id = tour and match_order = 1;
  select id into g2 from matches where tournament_id = tour and match_order = 2;
  select id into g3 from matches where tournament_id = tour and match_order = 3;

  -- Game 1: 11 Fighter 88/4 (10), Canteen Tiger 89/2 (6.3). Canteen Tiger won.
  perform record_summary_match(g1, t_11f, 88, 4, 60, 89, 2, 39, 'From scoresheet');

  -- Game 2: Desert XI 140/4 (10), Golden Tiger 133/4 (10). Desert XI by 7 runs.
  perform record_summary_match(g2, t_dxi, 140, 4, 60, 133, 4, 60, 'From scoresheet');

  -- Game 3: Friends 11 batted first, 79/8 (10); 11 Fighter chased 81/4 (7.1).
  perform record_summary_match(g3, t_f11, 79, 8, 60, 81, 4, 43, 'From scoresheet');

  raise notice 'Recorded 3 completed games. Games 4, 5 and 6 remain scheduled.';
end $$;

-- The table these produce.
select group_label as "grp", team_short as "team", played as "p", won as "w",
       lost as "l", points as "pts", net_run_rate as "nrr"
from tournament_standings
where tournament_id = (select id from tournaments where slug = 'ppp4-summer-sport-2026')
order by group_label, points desc, net_run_rate desc;
