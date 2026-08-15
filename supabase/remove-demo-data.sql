-- ============================================================================
-- Cricket Arena — remove the demo data
-- ============================================================================
-- Deletes the seeded "Riyadh Cricket Board" organisation and everything under
-- it. Your own account, your own organisations and the schema itself are all
-- untouched.
--
-- Order matters. `deliveries.striker_id` references `players` with ON DELETE
-- RESTRICT, on purpose: a player who has faced a ball must not vanish and take
-- a scorecard's meaning with them. That protection also means a cascade from
-- the organisation is not enough — Postgres does not promise to delete the
-- deliveries before it tries the players. So this walks the graph explicitly,
-- deepest first.
--
-- Safe to run more than once; deleting nothing is not an error.
-- ============================================================================

do $$
declare
  org_id uuid;
  n_deliveries int := 0;
  n_matches int := 0;
  n_players int := 0;
  n_teams int := 0;
  n_tournaments int := 0;
begin
  select id into org_id from organizations where slug = 'riyadh-cricket-board';

  if org_id is null then
    raise notice 'No demo organisation found — nothing to remove.';
    return;
  end if;

  -- Every match belonging to this organisation, gathered once and reused.
  create temporary table _demo_matches on commit drop as
    select id from matches where organization_id = org_id;

  create temporary table _demo_innings on commit drop as
    select id from innings where match_id in (select id from _demo_matches);

  -- 1. Ball-by-ball data. This is what holds the RESTRICT locks on players.
  delete from deliveries where innings_id in (select id from _demo_innings);
  get diagnostics n_deliveries = row_count;

  delete from score_corrections where match_id in (select id from _demo_matches);
  delete from match_interruptions where match_id in (select id from _demo_matches);

  -- 2. Innings, and everything else hanging off a match.
  delete from innings where id in (select id from _demo_innings);
  delete from playing_xi where match_id in (select id from _demo_matches);
  delete from match_officials where match_id in (select id from _demo_matches);
  delete from media where match_id in (select id from _demo_matches);

  -- 3. The matches themselves.
  delete from matches where id in (select id from _demo_matches);
  get diagnostics n_matches = row_count;

  -- 4. Competition structure.
  delete from tournament_teams
    where tournament_id in (select id from tournaments where organization_id = org_id);
  delete from messages
    where channel_id in (select id from channels where organization_id = org_id);
  delete from channels where organization_id = org_id;
  delete from media where tournament_id in (select id from tournaments where organization_id = org_id);
  delete from player_registrations where organization_id = org_id;

  delete from tournaments where organization_id = org_id;
  get diagnostics n_tournaments = row_count;

  -- 5. Squads, then the players they pointed at.
  delete from follows where player_id in (select id from players where organization_id = org_id);
  delete from follows where team_id in (select id from teams where organization_id = org_id);
  delete from team_members
    where team_id in (select id from teams where organization_id = org_id);

  delete from players where organization_id = org_id;
  get diagnostics n_players = row_count;

  delete from teams where organization_id = org_id;
  get diagnostics n_teams = row_count;

  delete from venues where organization_id = org_id;
  delete from organization_members where organization_id = org_id;

  -- 6. Finally the organisation.
  delete from organizations where id = org_id;

  raise notice 'Removed demo data: % deliveries, % matches, % players, % teams, % tournament(s).',
    n_deliveries, n_matches, n_players, n_teams, n_tournaments;
end $$;
