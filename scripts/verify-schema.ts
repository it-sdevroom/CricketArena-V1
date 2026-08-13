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
