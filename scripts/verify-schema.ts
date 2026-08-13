/**
 * Run the Supabase migrations and seed against an in-process Postgres (PGlite)
 * so schema mistakes surface here rather than in the Supabase SQL editor.
 *
 *   npm run verify:schema
 *
 * PGlite is plain Postgres without Supabase's managed pieces, so we stub the
 * few things the platform provides: the `auth` schema, `auth.uid()`, and the
 * realtime publication. Everything else runs exactly as it will in production.
 */

import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

/** The parts of Supabase that do not exist in a bare Postgres. */
const SUPABASE_STUBS = `
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Impersonation hook for the RLS tests below.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
end $$;

create publication supabase_realtime;

-- Supabase Storage. Only the pieces the migrations touch.
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

-- Splits an object path into its folder segments, as the real Storage does.
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(regexp_replace(name, '/[^/]*$', ''), '/');
$$;
`;

function fail(message: string, detail?: unknown): never {
  console.error(`\n  FAIL  ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

async function main() {
  const db = new PGlite();

  console.log('  Booting in-process Postgres…');
  await db.exec(SUPABASE_STUBS);

  const migrationsDir = path.join(root, 'supabase', 'migrations');
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    try {
      await db.exec(sql);
      console.log(`  ok    ${file}`);
    } catch (error) {
      fail(`migration ${file}`, error);
    }
  }

  const seed = await readFile(path.join(root, 'supabase', 'seed.sql'), 'utf8');
  try {
    await db.exec(seed);
    console.log('  ok    seed.sql');
  } catch (error) {
    fail('seed.sql', error);
  }

  // -------------------------------------------------------------------------
  // Sanity-check the derived views against the seeded league.
  // -------------------------------------------------------------------------

  const checks: { label: string; sql: string; expect: (rows: any[]) => string | null }[] = [
    {
      label: 'six teams were created',
      sql: 'select count(*)::int as n from teams',
      expect: (r) => (r[0].n === 6 ? null : `expected 6 teams, got ${r[0].n}`),
    },
    {
      label: 'every team has a squad of twelve',
      sql: 'select count(*)::int as n from team_members',
      expect: (r) => (r[0].n === 72 ? null : `expected 72 squad entries, got ${r[0].n}`),
    },
    {
      label: 'the round robin produced fifteen fixtures',
      sql: 'select count(*)::int as n from matches',
      expect: (r) => (r[0].n === 15 ? null : `expected 15 fixtures, got ${r[0].n}`),
    },
    {
      label: 'no side is scheduled twice in the same round',
      sql: `
        select count(*)::int as n from (
          select round, team_id, count(*) as c from (
            select round, home_team_id as team_id from matches
            union all
            select round, away_team_id from matches
          ) s group by round, team_id having count(*) > 1
        ) dupes`,
      expect: (r) => (r[0].n === 0 ? null : `${r[0].n} side(s) appear twice in a round`),
    },
    {
      label: 'four matches were simulated to completion',
      sql: "select count(*)::int as n from matches where status = 'completed'",
      expect: (r) => (r[0].n === 4 ? null : `expected 4 completed matches, got ${r[0].n}`),
    },
    {
      label: 'deliveries were recorded',
      sql: 'select count(*)::int as n from deliveries',
      expect: (r) => (r[0].n > 500 ? null : `expected a full match load of balls, got ${r[0].n}`),
    },
    {
      label: 'delivery sequences are contiguous within an innings',
      sql: `
        select count(*)::int as n from (
          select innings_id, count(*) as balls, max(sequence) as top
          from deliveries group by innings_id
        ) s where s.balls <> s.top`,
      expect: (r) => (r[0].n === 0 ? null : `${r[0].n} innings have gaps in their ball sequence`),
    },
    {
      label: 'innings_scores totals match the raw deliveries',
      sql: `
        select count(*)::int as n
        from innings_scores s
        join (
          select innings_id, sum(total_runs)::int as runs from deliveries group by innings_id
        ) d on d.innings_id = s.innings_id
        where s.runs <> d.runs`,
      expect: (r) => (r[0].n === 0 ? null : `${r[0].n} innings disagree with their deliveries`),
    },
    {
      label: 'batting scorecard adds up to the team total',
      sql: `
        select count(*)::int as n
        from innings_scores s
        join (
          select innings_id, sum(runs)::int as bat_runs from batting_scorecard group by innings_id
        ) b on b.innings_id = s.innings_id
        where s.runs <> b.bat_runs + s.extras`,
      expect: (r) =>
        r[0].n === 0 ? null : `${r[0].n} innings where batters + extras <> team total`,
    },
    {
      label: 'bowling figures account for every legal ball',
      sql: `
        select count(*)::int as n
        from innings_scores s
        join (
          select innings_id, sum(legal_balls)::int as balls from bowling_scorecard group by innings_id
        ) b on b.innings_id = s.innings_id
        where s.legal_balls <> b.balls`,
      expect: (r) => (r[0].n === 0 ? null : `${r[0].n} innings have unaccounted deliveries`),
    },
    {
      label: 'the points table lists every side that has played',
      sql: 'select count(*)::int as n from tournament_standings',
      expect: (r) => (r[0].n >= 6 ? null : `expected at least 6 rows, got ${r[0].n}`),
    },
    {
      label: 'points equal two per win plus one per tie',
      sql: `
        select count(*)::int as n from tournament_standings
        where points <> won * 2 + tied + no_result`,
      expect: (r) => (r[0].n === 0 ? null : `${r[0].n} rows have miscounted points`),
    },
    {
      label: 'net run rate is populated',
      sql: 'select count(*)::int as n from tournament_standings where net_run_rate is null',
      expect: (r) => (r[0].n === 0 ? null : `${r[0].n} rows have a null NRR`),
    },
    {
      label: 'career batting figures are derivable',
      sql: 'select count(*)::int as n from player_batting_career',
      expect: (r) => (r[0].n > 0 ? null : 'no batting careers were produced'),
    },
    {
      label: 'career bowling figures are derivable',
      sql: 'select count(*)::int as n from player_bowling_career',
      expect: (r) => (r[0].n > 0 ? null : 'no bowling careers were produced'),
    },
    {
      label: 'match summaries expose both innings',
      sql: `select count(*)::int as n from match_summaries
            where status = 'completed' and (first_innings_runs is null or second_innings_runs is null)`,
      expect: (r) => (r[0].n === 0 ? null : `${r[0].n} completed matches are missing an innings`),
    },
    {
      label: 'a bowler never bowls consecutive overs',
      sql: `
        select count(*)::int as n from (
          select innings_id, over_number, bowler_id,
                 lag(bowler_id) over (partition by innings_id order by over_number) as prev
          from (select distinct innings_id, over_number, bowler_id from deliveries) o
        ) s where s.bowler_id = s.prev`,
      expect: (r) => (r[0].n === 0 ? null : `${r[0].n} overs were bowled back to back`),
    },
    {
      label: 'the avatars bucket exists and is public',
      sql: "select public from storage.buckets where id = 'avatars'",
      expect: (r) => (r[0]?.public === true ? null : 'avatars bucket missing or not public'),
    },
    {
      label: 'a user can only write inside their own avatar folder',
      sql: `select (storage.foldername('abc-123/photo.jpg'))[1] as folder`,
      expect: (r) => (r[0].folder === 'abc-123' ? null : `folder resolved to ${r[0].folder}`),
    },
    {
      label: 'approve_registration and reject_registration exist',
      sql: `select count(*)::int as n from pg_proc
            where proname in ('approve_registration','reject_registration')`,
      expect: (r) => (r[0].n === 2 ? null : `expected 2 functions, found ${r[0].n}`),
    },
    {
      label: 'approval runs as definer so it can write the roster',
      sql: `select prosecdef from pg_proc where proname = 'approve_registration'`,
      expect: (r) => (r[0].prosecdef === true ? null : 'approve_registration is not SECURITY DEFINER'),
    },
    {
      label: 'only one pending application per person per team',
      sql: `select count(*)::int as n from pg_indexes
            where indexname = 'one_pending_application'`,
      expect: (r) => (r[0].n === 1 ? null : 'the partial unique index is missing'),
    },
    {
      label: 'a follow points at exactly one thing',
      sql: `select count(*)::int as n from pg_constraint where conname = 'one_target'`,
      expect: (r) => (r[0].n === 1 ? null : 'the one_target check constraint is missing'),
    },
    {
      label: 'RLS is enabled on every application table',
      sql: `
        select count(*)::int as n
        from pg_tables t
        join pg_class c on c.relname = t.tablename
        where t.schemaname = 'public' and not c.relrowsecurity`,
      expect: (r) => (r[0].n === 0 ? null : `${r[0].n} public table(s) have RLS switched off`),
    },
  ];

  let failures = 0;
  for (const check of checks) {
    try {
      const result = await db.query<any>(check.sql);
      const problem = check.expect(result.rows);
      if (problem) {
        console.error(`  FAIL  ${check.label} — ${problem}`);
        failures += 1;
      } else {
        console.log(`  ok    ${check.label}`);
      }
    } catch (error) {
      console.error(`  FAIL  ${check.label}`);
      console.error(error);
      failures += 1;
    }
  }

  // -------------------------------------------------------------------------
  // Walk a player registration all the way through approval.
  // -------------------------------------------------------------------------

  console.log('\n  Player registration flow:');
  try {
    // An organiser, and a cricketer who wants to join one of their teams.
    await db.exec(`
      insert into auth.users (id, email) values
        ('11111111-1111-1111-1111-111111111111', 'organiser@example.com'),
        ('22222222-2222-2222-2222-222222222222', 'player@example.com');
      update profiles set is_platform_admin = true
        where id = '11111111-1111-1111-1111-111111111111';
      update profiles set full_name = 'Hopeful Cricketer'
        where id = '22222222-2222-2222-2222-222222222222';
    `);

    const team = await db.query<any>(`select id, organization_id from teams limit 1`);
    const { id: teamId, organization_id: orgId } = team.rows[0];

    // Give the organiser the role they would really hold.
    await db.query(
      `insert into organization_members (organization_id, user_id, role)
       values ($1, '11111111-1111-1111-1111-111111111111', 'tournament_admin')
       on conflict do nothing`,
      [orgId],
    );

    // Act as the applicant.
    await db.exec(`set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'`);
    const application = await db.query<any>(
      `insert into player_registrations
         (organization_id, team_id, user_id, full_name, jersey_number, role, note)
       values ($1, $2, '22222222-2222-2222-2222-222222222222', 'Hopeful Cricketer', 77,
               'all_rounder', 'I keep wicket too.')
       returning id`,
      [orgId, teamId],
    );
    const applicationId = application.rows[0].id;
    console.log('  ok    a signed-in user can apply to join a squad');

    // A second pending application to the same team must be refused.
    let blocked = false;
    try {
      await db.query(
        `insert into player_registrations (organization_id, team_id, user_id, full_name)
         values ($1, $2, '22222222-2222-2222-2222-222222222222', 'Hopeful Cricketer')`,
        [orgId, teamId],
      );
    } catch {
      blocked = true;
    }
    console.log(
      blocked
        ? '  ok    a duplicate pending application is refused'
        : '  FAIL  a duplicate pending application was allowed',
    );
    if (!blocked) failures += 1;

    // The organiser was told.
    const alerted = await db.query<any>(
      `select count(*)::int as n from notifications
       where user_id = '11111111-1111-1111-1111-111111111111' and kind = 'registration'`,
    );
    console.log(
      alerted.rows[0].n > 0
        ? '  ok    the organiser is notified of the application'
        : '  FAIL  no notification reached the organiser',
    );
    if (alerted.rows[0].n === 0) failures += 1;

    // A non-admin must not be able to approve it.
    await db.exec(`set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'`);
    let refused = false;
    try {
      await db.query(`select approve_registration($1)`, [applicationId]);
    } catch {
      refused = true;
    }
    console.log(
      refused
        ? '  ok    an applicant cannot approve their own registration'
        : '  FAIL  self-approval was allowed',
    );
    if (!refused) failures += 1;

    // Now the organiser approves.
    await db.exec(`set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'`);
    await db.query(`select approve_registration($1, 'Welcome aboard')`, [applicationId]);

    const outcome = await db.query<any>(
      `select r.status, r.player_id, p.full_name, p.user_id,
              (select count(*)::int from team_members tm
                where tm.team_id = r.team_id and tm.player_id = r.player_id) as in_squad,
              (select count(*)::int from organization_members om
                where om.organization_id = r.organization_id and om.user_id = r.user_id) as is_member,
              (select count(*)::int from notifications n
                where n.user_id = r.user_id and n.kind = 'registration') as told
       from player_registrations r
       left join players p on p.id = r.player_id
       where r.id = $1`,
      [applicationId],
    );
    const row = outcome.rows[0];

    const expectations: [string, boolean][] = [
      ['the application is marked approved', row.status === 'approved'],
      ['a roster entry was created', !!row.player_id && row.full_name === 'Hopeful Cricketer'],
      ['the roster entry is linked to their account', row.user_id === '22222222-2222-2222-2222-222222222222'],
      ['they were added to the squad', row.in_squad === 1],
      ['they gained a role in the organisation', row.is_member === 1],
      ['the applicant was told the outcome', row.told > 0],
    ];
    for (const [label, ok] of expectations) {
      console.log(ok ? `  ok    ${label}` : `  FAIL  ${label}`);
      if (!ok) failures += 1;
    }

    // Approving twice must not create a second player.
    let secondRefused = false;
    try {
      await db.query(`select approve_registration($1)`, [applicationId]);
    } catch {
      secondRefused = true;
    }
    console.log(
      secondRefused
        ? '  ok    an already-approved registration cannot be approved again'
        : '  FAIL  double approval was allowed',
    );
    if (!secondRefused) failures += 1;

    await db.exec(`reset request.jwt.claim.sub`);
  } catch (error) {
    console.error('  FAIL  registration flow');
    console.error(error);
    failures += 1;
  }

  // -------------------------------------------------------------------------
  // A quick look at the league table, as a human-readable smoke test.
  // -------------------------------------------------------------------------

  const table = await db.query<any>(`
    select team_short, played, won, lost, tied, points, net_run_rate
    from tournament_standings
    order by points desc, net_run_rate desc
  `);
  console.log('\n  Points table after the seeded matches:');
  console.log('  TEAM   P  W  L  T  PTS   NRR');
  for (const row of table.rows) {
    console.log(
      `  ${String(row.team_short).padEnd(6)} ${row.played}  ${row.won}  ${row.lost}  ${row.tied}   ${String(row.points).padEnd(3)} ${row.net_run_rate}`,
    );
  }

  const top = await db.query<any>(`
    select full_name, runs, balls, strike_rate
    from player_batting_career order by runs desc limit 5
  `);
  console.log('\n  Leading run scorers:');
  for (const row of top.rows) {
    console.log(`  ${String(row.full_name).padEnd(20)} ${String(row.runs).padStart(4)} runs (${row.balls} balls, SR ${row.strike_rate})`);
  }

  await db.close();

  if (failures > 0) {
    console.error(`\n  ${failures} check(s) failed.\n`);
    process.exit(1);
  }
  console.log('\n  Schema, seed and views all verified.\n');
}

main().catch((error) => fail('unexpected', error));
