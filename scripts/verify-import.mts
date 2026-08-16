/**
 * Prove import-ppp4.sql builds the tournament described on the fixture sheet,
 * before it is run against the real database.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const STUBS = `
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(),
  email text, phone text, raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now());
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
end $$;
create publication supabase_realtime;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text not null,
  public boolean not null default false, file_size_limit bigint, allowed_mime_types text[],
  created_at timestamptz not null default now());
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id), name text, owner uuid,
  created_at timestamptz not null default now());
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(regexp_replace(name, '/[^/]*$', ''), '/'); $$;
`;

async function main() {
  const db = new PGlite();
  await db.exec(STUBS);

  const dir = `${ROOT}/supabase/migrations`;
  for (const f of (await readdir(dir)).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(await readFile(`${dir}/${f}`, 'utf8'));
  }

  await db.exec(
    `insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','me@test.com')`,
  );

  let sql = await readFile(`${ROOT}/supabase/import-ppp4.sql`, 'utf8');
  sql = sql.replace("'your@email.com'", "'me@test.com'");

  try {
    await db.exec(sql);
    console.log('  ok    import ran');
  } catch (error: any) {
    console.error('  FAIL ', error.message);
    process.exit(1);
  }

  const games = await db.query<any>(`
    select m.match_order g, to_char(m.scheduled_at, 'DD Mon (Dy)') d,
           h.name a, aw.name b
    from matches m
    join teams h on h.id = m.home_team_id
    join teams aw on aw.id = m.away_team_id
    order by m.match_order`);

  console.log('\n  PPP4 Summer Sport 2026');
  for (const r of games.rows) {
    console.log(`   Game ${r.g}  ${r.d}   ${r.a}  v  ${r.b}`);
  }

  const counts = await db.query<any>(`
    select (select count(*)::int from teams) teams,
           (select count(*)::int from matches) matches,
           (select count(*)::int from tournaments) tournaments,
           (select count(*)::int from venues) venues,
           (select count(*)::int from organization_members where role='tournament_admin') admins`);
  const c = counts.rows[0];
  console.log(`\n  teams ${c.teams} · fixtures ${c.matches} · venues ${c.venues} · admins ${c.admins}`);

  const problems: string[] = [];
  if (c.teams !== 6) problems.push(`expected 6 teams, got ${c.teams}`);
  if (c.matches !== 6) problems.push(`expected 6 fixtures, got ${c.matches}`);
  if (c.admins !== 1) problems.push(`expected 1 admin, got ${c.admins}`);

  // The whole point of the results: does the table come out right?
  const table = await db.query<any>(`
    select group_label grp, team_short team, played p, won w, lost l,
           points pts, net_run_rate nrr, runs_scored rs, overs_faced ov
    from tournament_standings
    where tournament_id = (select id from tournaments where slug='ppp4-summer-sport-2026')
    order by group_label, points desc, net_run_rate desc`);

  console.log('\n  Points table');
  console.log('  GRP TEAM  P W L PTS      NRR   runs/overs');
  for (const r of table.rows) {
    console.log(`   ${r.grp}  ${String(r.team).padEnd(5)} ${r.p} ${r.w} ${r.l}  ${String(r.pts).padEnd(3)} ${String(r.nrr).padStart(7)}   ${r.rs}/${r.ov}`);
  }

  const results = await db.query<any>(`
    select m.match_order g, m.result_summary
    from matches m where m.result_kind is not null order by m.match_order`);
  console.log('\n  Results');
  results.rows.forEach((r: any) => console.log(`   Game ${r.g}: ${r.result_summary}`));
  if (results.rows.length !== 3) {
    console.error(`  FAIL expected 3 results, got ${results.rows.length}`);
    process.exit(1);
  }

  // Re-running must rebuild, not duplicate.
  await db.exec(sql);
  const again = await db.query<any>(`select count(*)::int n from matches`);
  if (again.rows[0].n !== 6) problems.push(`re-running duplicated: ${again.rows[0].n} fixtures`);
  else console.log('  ok    safe to run twice');

  if (problems.length) {
    problems.forEach((p) => console.error('  FAIL ', p));
    process.exit(1);
  }

  await db.close();
  console.log('\n  Import verified.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
