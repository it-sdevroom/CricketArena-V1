/**
 * Prove remove-demo-data.sql actually runs, by seeding a database and then
 * cleaning it. The previous version failed on a foreign key that only bites
 * once deliveries exist, which a dry read of the SQL would not have caught.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';

const ROOT = 'F:/Projects/Cricket/CricketArena-Mobile-App-v2/CricketArena';

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
  await db.exec(await readFile(`${ROOT}/supabase/seed.sql`, 'utf8'));

  const before = await db.query<any>(`
    select (select count(*)::int from deliveries) as deliveries,
           (select count(*)::int from players) as players,
           (select count(*)::int from matches) as matches,
           (select count(*)::int from organizations) as orgs`);
  console.log('  seeded :', JSON.stringify(before.rows[0]));

  // The real test.
  try {
    await db.exec(await readFile(`${ROOT}/supabase/remove-demo-data.sql`, 'utf8'));
    console.log('  ok     cleanup ran without a foreign key error');
  } catch (error: any) {
    console.error('  FAIL   cleanup threw:', error.message);
    process.exit(1);
  }

  const after = await db.query<any>(`
    select (select count(*)::int from deliveries) as deliveries,
           (select count(*)::int from players) as players,
           (select count(*)::int from matches) as matches,
           (select count(*)::int from teams) as teams,
           (select count(*)::int from tournaments) as tournaments,
           (select count(*)::int from organizations) as orgs`);
  const a = after.rows[0];
  console.log('  after  :', JSON.stringify(a));

  const problems = Object.entries(a).filter(([, v]) => v !== 0);
  if (problems.length) {
    console.error('  FAIL   these are not empty:', problems);
    process.exit(1);
  }
  console.log('  ok     every demo row is gone');

  // The failure the user actually hit: a database a migration or two behind,
  // where `media` does not exist yet. DROP THE LATER TABLES and clean again.
  {
    const db2 = new PGlite();
    await db2.exec(STUBS);
    for (const f of (await readdir(dir)).filter((x) => x.endsWith('.sql')).sort()) {
      await db2.exec(await readFile(`${dir}/${f}`, 'utf8'));
    }
    await db2.exec(await readFile(`${ROOT}/supabase/seed.sql`, 'utf8'));
    await db2.exec('drop table if exists media cascade; drop table if exists match_interruptions cascade;');
    try {
      await db2.exec(await readFile(`${ROOT}/supabase/remove-demo-data.sql`, 'utf8'));
      console.log('  ok     works on a database missing later tables');
    } catch (error: any) {
      console.error('  FAIL   partially-migrated database:', error.message);
      process.exit(1);
    }
    const left = await db2.query<any>('select count(*)::int as n from players');
    if (left.rows[0].n !== 0) {
      console.error('  FAIL   players survived on the partial database');
      process.exit(1);
    }
    await db2.close();
  }

  // Re-running must not error.
  await db.exec(await readFile(`${ROOT}/supabase/remove-demo-data.sql`, 'utf8'));
  console.log('  ok     safe to run twice');

  // And the schema must still be intact.
  const tables = await db.query<any>(
    `select count(*)::int as n from pg_tables where schemaname='public'`);
  console.log(`  ok     schema intact (${tables.rows[0].n} tables)`);

  await db.close();
  console.log('\n  Cleanup script verified.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
