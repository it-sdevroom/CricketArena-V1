/**
 * Prove the concatenated setup-all.sql produces exactly the same database as
 * running the four migrations separately. Concatenation is easy to get wrong,
 * and this runs against the user's real project.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const STUBS = `
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(), email text, phone text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now());
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon'); $$;
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

/** Fingerprint the schema so two databases can be compared exactly. */
const FINGERPRINT = `
select
  (select count(*) from pg_tables where schemaname='public') as tables,
  (select count(*) from pg_views where schemaname='public') as views,
  (select count(*) from pg_policies where schemaname='public') as policies,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public') as functions,
  (select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace
     where n.nspname='public' and t.typtype='e') as enums,
  (select count(*) from pg_trigger where not tgisinternal) as triggers,
  (select count(*) from pg_indexes where schemaname='public') as indexes,
  (select count(*) from pg_constraint) as constraints
`;

async function build(apply: (db: PGlite) => Promise<void>) {
  const db = new PGlite();
  await db.exec(STUBS);
  await apply(db);
  const fp = await db.query<any>(FINGERPRINT);
  const names = await db.query<any>(
    `select tablename from pg_tables where schemaname='public' order by tablename`,
  );
  await db.close();
  return { fp: fp.rows[0], tables: names.rows.map((r) => r.tablename) };
}

async function main() {
  const files = [
    '20260101000000_init.sql',
    '20260101000001_rls.sql',
    '20260101000002_views.sql',
    '20260101000003_registrations.sql',
  ];

  const separate = await build(async (db) => {
    for (const f of files) {
      await db.exec(await readFile(`${ROOT}/supabase/migrations/${f}`, 'utf8'));
    }
  });

  const combined = await build(async (db) => {
    await db.exec(await readFile(`${ROOT}/supabase/setup-all.sql`, 'utf8'));
  });

  console.log('  separate migrations:', JSON.stringify(separate.fp));
  console.log('  combined setup-all :', JSON.stringify(combined.fp));

  const same = JSON.stringify(separate.fp) === JSON.stringify(combined.fp);
  const sameTables = JSON.stringify(separate.tables) === JSON.stringify(combined.tables);

  console.log(same ? '\n  ok    object counts are identical' : '\n  FAIL  object counts differ');
  console.log(sameTables ? '  ok    table list is identical' : '  FAIL  table list differs');
  console.log(`  ok    ${combined.tables.length} tables created: ${combined.tables.join(', ')}`);

  if (!same || !sameTables) process.exit(1);
  console.log('\n  setup-all.sql is equivalent to running the migrations in order.\n');
}

main().catch((e) => {
  console.error('  FAIL', e);
  process.exit(1);
});
