-- ============================================================================
-- Cricket Arena — remove the demo league
-- ============================================================================
-- Run this when you are ready to use the app for a real competition and no
-- longer want the seeded Riyadh Premier League cluttering it up.
--
-- Deleting the organisation is enough: every table below hangs off it by
-- foreign key with ON DELETE CASCADE, so its tournaments, teams, players,
-- fixtures, innings and every recorded ball go with it. Nothing else in the
-- database references them.
--
-- Your own account is NOT touched. Neither is any competition you have
-- created yourself.
-- ============================================================================

-- Have a look before you delete, so there are no surprises.
select
  (select count(*) from tournaments t
     join organizations o on o.id = t.organization_id
    where o.slug = 'riyadh-cricket-board')                as tournaments,
  (select count(*) from teams t
     join organizations o on o.id = t.organization_id
    where o.slug = 'riyadh-cricket-board')                as teams,
  (select count(*) from players p
     join organizations o on o.id = p.organization_id
    where o.slug = 'riyadh-cricket-board')                as players,
  (select count(*) from matches m
     join organizations o on o.id = m.organization_id
    where o.slug = 'riyadh-cricket-board')                as matches,
  (select count(*) from deliveries d
     join matches m on m.id = d.match_id
     join organizations o on o.id = m.organization_id
    where o.slug = 'riyadh-cricket-board')                as balls_recorded;

-- The delete itself.
delete from organizations where slug = 'riyadh-cricket-board';

-- Confirm it is gone. Expect zero rows.
select count(*) as demo_orgs_remaining
from organizations
where slug = 'riyadh-cricket-board';
