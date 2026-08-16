-- ============================================================================
-- Remove the things you created while testing
-- ============================================================================
-- Clears everything belonging to organisations you own, EXCEPT the real
-- tournament (PPP4 Summer Sport) and the original demo league, which has its
-- own script.
--
-- Your account, your login and your admin rights all survive. Only the
-- competitions you made while trying the app go.
--
-- Order matters for the same reason as the demo cleanup: deliveries reference
-- players with ON DELETE RESTRICT, so the balls have to go before the people
-- who faced them.
--
-- BEFORE RUNNING: put your email on the line marked below.
-- ============================================================================

do $$
declare
  -- >>> PUT YOUR EMAIL HERE <<<
  my_email text := 'your@email.com';

  me uuid;
  org record;
  n_orgs int := 0;
  n_deliveries int := 0;
  n_players int := 0;
begin
  select id into me from auth.users where email = my_email;
  if me is null then
    raise exception 'No account found for %', my_email;
  end if;

  for org in
    select o.id, o.name, o.slug
    from organizations o
    where o.id in (
        select organization_id from organization_members
        where user_id = me and role = 'tournament_admin'
      )
      -- Keep the real competition and the demo league.
      and o.slug not in ('ppp4-summer-sport', 'riyadh-cricket-board')
  loop
    raise notice 'Removing test organisation: % (%)', org.name, org.slug;

    delete from deliveries
      where innings_id in (
        select i.id from innings i
        join matches m on m.id = i.match_id
        where m.organization_id = org.id
      );
    get diagnostics n_deliveries = row_count;

    delete from score_corrections
      where match_id in (select id from matches where organization_id = org.id);

    if to_regclass('public.match_interruptions') is not null then
      execute format(
        'delete from match_interruptions where match_id in
           (select id from matches where organization_id = %L)', org.id);
    end if;

    delete from innings
      where match_id in (select id from matches where organization_id = org.id);
    delete from playing_xi
      where match_id in (select id from matches where organization_id = org.id);
    delete from match_officials
      where match_id in (select id from matches where organization_id = org.id);

    if to_regclass('public.media') is not null then
      execute format('delete from media where organization_id = %L', org.id);
    end if;

    delete from matches where organization_id = org.id;

    delete from tournament_teams
      where tournament_id in (select id from tournaments where organization_id = org.id);
    delete from messages
      where channel_id in (select id from channels where organization_id = org.id);
    delete from channels where organization_id = org.id;

    if to_regclass('public.player_registrations') is not null then
      execute format('delete from player_registrations where organization_id = %L', org.id);
    end if;

    delete from tournaments where organization_id = org.id;

    if to_regclass('public.follows') is not null then
      execute format(
        'delete from follows where player_id in (select id from players where organization_id = %L)
           or team_id in (select id from teams where organization_id = %L)', org.id, org.id);
    end if;

    delete from team_members
      where team_id in (select id from teams where organization_id = org.id);

    delete from players where organization_id = org.id;
    get diagnostics n_players = row_count;

    delete from teams where organization_id = org.id;
    delete from venues where organization_id = org.id;
    delete from organization_members where organization_id = org.id;
    delete from organizations where id = org.id;

    n_orgs := n_orgs + 1;
  end loop;

  if n_orgs = 0 then
    raise notice 'Nothing to remove — you own no test organisations.';
  else
    raise notice 'Removed % test organisation(s).', n_orgs;
  end if;
end $$;

-- What is left.
select o.name as "organisation", o.slug,
       (select count(*) from teams t where t.organization_id = o.id) as teams,
       (select count(*) from matches m where m.organization_id = o.id) as matches
from organizations o
order by o.name;
