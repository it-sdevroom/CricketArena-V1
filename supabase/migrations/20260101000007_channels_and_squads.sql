-- ============================================================================
-- Cricket Arena — automatic chat channels, and safer squad deletion
-- ============================================================================
-- Two gaps found in real use:
--
-- 1. Tournament chat said "no channel available". The seed created a channel by
--    hand, so it only ever worked for the demo league. Every tournament should
--    have one the moment it exists.
--
-- 2. Deleting a team or player that has already played was impossible, because
--    deliveries reference players with ON DELETE RESTRICT. That protection is
--    right — a scorecard must not lose its meaning — but it left organisers
--    unable to tidy up a typo. The answer is to retire rather than delete when
--    there is history, and to delete outright only when there is none.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Every tournament gets a chat channel
-- ---------------------------------------------------------------------------

create or replace function create_tournament_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into channels (organization_id, tournament_id, name, kind)
  values (new.organization_id, new.id, new.name, 'tournament');
  return new;
end;
$$;

create trigger on_tournament_created_add_channel
  after insert on tournaments
  for each row execute function create_tournament_channel();

-- Backfill: any tournament created before this migration has no channel.
insert into channels (organization_id, tournament_id, name, kind)
select t.organization_id, t.id, t.name, 'tournament'
from tournaments t
where not exists (
  select 1 from channels c where c.tournament_id = t.id
);

-- ---------------------------------------------------------------------------
-- Retiring a player, and deleting one safely
-- ---------------------------------------------------------------------------

-- Has this player ever appeared in a recorded delivery?
create or replace function player_has_history(player uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from deliveries d
    where d.striker_id = player or d.non_striker_id = player or d.bowler_id = player
       or d.fielder_id = player or d.player_out_id = player
  );
$$;

/**
 * Remove a player if they have never played, otherwise retire them.
 *
 * Returns 'deleted' or 'retired' so the app can say which happened. Retiring
 * keeps every scorecard they appear on intact while taking them out of squad
 * lists and selection.
 */
create or replace function remove_player(player uuid)
returns text
language plpgsql
security invoker
as $$
declare
  org uuid;
begin
  select organization_id into org from players where id = player;
  if org is null then
    raise exception 'Player not found';
  end if;

  if not auth_has_org_role(org, array['tournament_admin', 'team_manager']::app_role[]) then
    raise exception 'Only an organiser can remove a player' using errcode = '42501';
  end if;

  if player_has_history(player) then
    update players set active = false where id = player;
    delete from team_members where player_id = player;
    return 'retired';
  end if;

  delete from team_members where player_id = player;
  delete from players where id = player;
  return 'deleted';
end;
$$;

grant execute on function remove_player(uuid) to authenticated;

/**
 * Delete a team, but only when it has never taken the field. A team with
 * matches behind it would take fixtures and scorecards with it.
 */
create or replace function remove_team(team uuid)
returns text
language plpgsql
security invoker
as $$
declare
  org uuid;
  played int;
begin
  select organization_id into org from teams where id = team;
  if org is null then
    raise exception 'Team not found';
  end if;

  if not auth_is_org_admin(org) then
    raise exception 'Only an organiser can remove a team' using errcode = '42501';
  end if;

  select count(*) into played from matches
  where (home_team_id = team or away_team_id = team)
    and status not in ('scheduled', 'cancelled');

  if played > 0 then
    raise exception 'This team has already played % match(es) and cannot be deleted', played;
  end if;

  delete from matches where (home_team_id = team or away_team_id = team) and status = 'scheduled';
  delete from tournament_teams where team_id = team;
  delete from team_members where team_id = team;
  delete from teams where id = team;
  return 'deleted';
end;
$$;

grant execute on function remove_team(uuid) to authenticated;

-- Squad lists should not show retired players.
create or replace view active_squad
with (security_invoker = on) as
select
  tm.team_id,
  tm.player_id,
  tm.is_captain,
  tm.is_vice_captain,
  tm.is_wicket_keeper,
  p.full_name,
  p.display_name,
  p.jersey_number,
  p.role,
  p.batting_style,
  p.bowling_style,
  p.photo_url,
  p.organization_id
from team_members tm
join players p on p.id = tm.player_id
where p.active;
