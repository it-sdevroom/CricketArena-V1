-- ============================================================================
-- Which migrations has this database actually had?
-- ============================================================================
-- Run this in the SQL editor. It reports one row per migration and whether the
-- thing that migration creates is present, so there is no guessing about which
-- ones ran. Read-only; it changes nothing.
-- ============================================================================

select
  m.n as "migration",
  m.file,
  case when to_regclass(m.probe) is not null or m.found then '✅ applied' else '❌ MISSING' end as status,
  m.adds
from (
  values
    (0, '20260101000000_init.sql', 'public.deliveries',
        (select count(*) > 0 from pg_tables where tablename = 'deliveries'),
        'Core schema: teams, players, matches, deliveries'),
    (1, '20260101000001_rls.sql', null,
        (select count(*) > 20 from pg_policies where schemaname = 'public'),
        'Row level security policies'),
    (2, '20260101000002_views.sql', null,
        (select count(*) > 0 from pg_views where viewname = 'tournament_standings'),
        'Scorecards, points table, career figures'),
    (3, '20260101000003_registrations.sql', 'public.player_registrations',
        (select count(*) > 0 from pg_tables where tablename = 'player_registrations'),
        'Player self-registration, follows, avatars'),
    (4, '20260101000004_account_deletion.sql', null,
        (select count(*) > 0 from pg_proc where proname = 'delete_my_account'),
        'In-app account deletion (required by Apple)'),
    (5, '20260101000005_media_and_super_over.sql', 'public.media',
        (select count(*) > 0 from pg_tables where tablename = 'media'),
        'Highlights, photos, team logos, super overs'),
    (6, '20260101000006_dls_and_push.sql', 'public.push_queue',
        (select count(*) > 0 from pg_tables where tablename = 'push_queue'),
        'Rain interruptions, revised targets, push notifications')
) as m(n, file, probe, found, adds)
order by m.n;

-- Storage buckets, which some features need.
select
  id as "bucket",
  case when public then 'public read' else 'private' end as access,
  pg_size_pretty(file_size_limit) as max_file
from storage.buckets
where id in ('avatars', 'team-logos', 'match-media')
order by id;

-- Anything left from the demo league.
select
  'demo data' as what,
  case when exists (select 1 from organizations where slug = 'riyadh-cricket-board')
    then 'still present — run remove-demo-data.sql'
    else 'removed'
  end as status;
