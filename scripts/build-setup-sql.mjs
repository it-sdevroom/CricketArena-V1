/**
 * Concatenate every migration into supabase/setup-all.sql.
 *
 *   npm run sql:build
 *
 * Running four or five files by hand in the Supabase SQL editor is that many
 * chances to paste one out of order, and order matters here — the views
 * reference tables, the policies reference the views. This produces one file to
 * paste once.
 *
 * scripts/verify-combined-sql.ts proves the result is equivalent to running the
 * migrations separately, and `npm run check` runs it, so the combined file
 * cannot drift unnoticed.
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'supabase', 'migrations');
const OUT = path.join(ROOT, 'supabase', 'setup-all.sql');

const header = `-- ===========================================================================
-- Cricket Arena — complete database setup
--
-- GENERATED FILE. Do not edit by hand; edit the migrations and run:
--     npm run sql:build
--
-- Paste the whole thing into the Supabase SQL editor and press Run, once.
-- Safe on a brand new project. Running it twice will error on existing types.
-- ===========================================================================
`;

const files = (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort();

if (files.length === 0) {
  console.error('No migrations found in supabase/migrations');
  process.exit(1);
}

const parts = [header];
for (const file of files) {
  const sql = await readFile(path.join(DIR, file), 'utf8');
  parts.push(`\n-- >>> BEGIN ${file}\n\n${sql}\n-- <<< END ${file}\n`);
}

const out = parts.join('');
await writeFile(OUT, out, 'utf8');

console.log(`  Combined ${files.length} migrations into supabase/setup-all.sql`);
for (const f of files) console.log(`    ${f}`);
console.log(`  ${(out.length / 1024).toFixed(1)} KB`);
