# Cricket Arena

A tournament platform for local cricket. One Expo/React Native codebase runs on
Android, iOS and the web, backed by your own Supabase project.

Score every ball, and the app derives everything else: scorecards, partnerships,
fall of wickets, bowling figures, the points table with net run rate, and career
statistics. Scoring keeps working with no signal and syncs when you are back.

---

## Quick start

```bash
npm install
```

```bash
cp .env.example .env
```

Then follow **Connect Supabase** below, put your two keys in `.env`, and run:

```bash
npm start
```

Scan the QR code with **Expo Go** on your phone, or press `w` for the browser.

---

## Connect Supabase

The app needs a database. This takes about five minutes.

1. **Create a project** at [supabase.com](https://supabase.com/dashboard). The free tier is fine.

2. **Create the schema.** Open the SQL editor and run these files in order:

   | Order | File | What it does |
   |---|---|---|
   | 1 | `supabase/migrations/20260101000000_init.sql` | Tables, enums, triggers |
   | 2 | `supabase/migrations/20260101000001_rls.sql` | Row level security policies |
   | 3 | `supabase/migrations/20260101000002_views.sql` | Scorecards, points table, careers |
   | 4 | `supabase/seed.sql` | *Optional* — a demo league with six teams and four simulated matches |

   If you have the Supabase CLI linked, `supabase db push` does the same thing.

3. **Copy your keys** from Project settings → API into `.env`:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

4. **Restart** with `npx expo start --clear`.

The anon key is meant to be public — it ships inside the app bundle. Row level
security is what actually protects the data. Never put the `service_role` key in
`.env`.

Until the keys are set the app opens on a setup screen instead of crashing.

### Becoming an organiser

Sign up in the app, then open **More → Organiser console** and create an
organisation. Whoever creates it becomes its `tournament_admin` automatically.
From there you can add teams and players, create a competition, generate the
whole fixture list in one tap, and appoint scorers.

---

## Who can do what

| Role | Can |
|---|---|
| *(signed out)* | Browse fixtures, live scores, scorecards, tables and stats |
| `fan` | The above, plus follow teams/competitions/players, and apply to join a squad |
| `player` | The above, plus their own linked career record |
| `scorer` | Record balls, but **only** in matches they are appointed to |
| `umpire` | Appointed to a match; read access to officials' channels |
| `team_manager` | Add and edit players and squads |
| `tournament_admin` | Everything within their organisation |
| `platform_admin` | Everything |

These are enforced by row level security in the database, not just hidden in the
UI — a crafted API call from a fan still cannot write a ball.

### Players registering themselves

A cricketer does not need an organiser to type them in. From **More → Register
as a player** (or the button on any team page) they:

1. sign in,
2. pick the club and team,
3. fill in their name, squad number, role, batting and bowling style,
4. add a profile photo,
5. optionally write a note to the organiser.

That creates a row in `player_registrations` and **nothing else** — the roster,
the squad list and the statistics are untouched. The organiser gets a
notification and reviews it under **Organiser console → Player registrations**.

Approving runs the `approve_registration` database function, which in one
transaction creates the player, adds them to the squad, links the record to
their account, gives them the `player` role, and notifies them. It re-checks
that the caller is an administrator, so an applicant cannot approve themselves.
Rejecting keeps a record and lets them apply again later.

A person can only have one pending application per team, enforced by a partial
unique index rather than a UI check.

### Appointing scorers

**Organiser console → Scorers & umpires.** Pick a fixture, then pick who is
scoring it. This matters: the RLS policy on `deliveries` only accepts a ball
from an organisation administrator or someone named in `match_officials` for
that exact match. Until you appoint someone, only admins can score.

---

## Hosting the web version on GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds and publishes on every
push. Three one-time steps:

1. **Push the repository to GitHub.**

2. **Add your keys as repository secrets** — Settings → Secrets and variables →
   Actions → New repository secret:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`

3. **Turn on Pages** — Settings → Pages → Build and deployment → Source:
   **GitHub Actions**.

Your site lands at `https://<username>.github.io/<repository>/`. The workflow
sets the base path from the repository name, copies `index.html` to `404.html`
so deep links work, and refuses to deploy if the tests or the schema check fail.

To build it yourself:

```bash
npm run export:web
```

---

## Phone builds

Expo Go covers day-to-day development. For an installable app:

```bash
npx eas login
```

```bash
npx eas init
```

Put your real Supabase values into the `env` blocks in `eas.json`, then:

```bash
npm run build:android
```

That produces an APK you can install directly. `npm run build:ios` needs an
Apple Developer account. Both need a free Expo account.

---

## How it works

### The match is an event log

`deliveries` is the only thing written during a match. Everything else — the
scorecard, the run rate, the points table, a player's career average — is folded
out of it, in the same way, by the same code.

That single decision buys a lot:

- **Undo** is dropping the last row.
- **Corrections** are editing one row, with the before and after kept in `score_corrections`.
- **Offline** replay is safe, because re-sending a ball is a no-op.
- Two halves of a scorecard can never disagree, because there is only one sum.

### The scoring engine is pure

`src/domain/` has no imports from React, Supabase or the network. `buildInnings`
takes a list of deliveries and returns the complete state of an innings. It
implements the laws that scoring apps usually get wrong:

- a wide is not a ball faced; a no ball is
- byes and leg byes count against the team but not the bowler, and still allow a maiden
- a free hit survives a wide and is only cleared by a legal delivery
- only a run out or obstruction can dismiss on a free hit
- bowlers are credited for bowled, caught, lbw, stumped and hit wicket, but not run outs
- strike rotates on odd runs *and* at the end of the over — including both at once
- a side bowled out is charged its full quota of overs for net run rate

54 unit tests cover these. `npm test`.

### Offline scoring

Every ball is written to local storage first and pushed in the background. Each
carries a client-generated idempotency key, and the database has a unique index
on `(innings_id, idempotency_key)`, so a retry cannot double-count. Balls are
sent oldest-first and a failure stops the run rather than skipping ahead, since
the server assigns sequence numbers on insert.

### Permissions

Read is public: fans see fixtures, live scores and tables without an account.
Write is narrow: only an organisation's admins shape a competition, and only
officials assigned to a specific match can record a ball in it. The rules live
in `20260101000001_rls.sql` and are mirrored by `can.*` in `src/store/auth.tsx`
so the UI hides what the database would reject anyway.

---

## Project layout

```
app/                      screens (expo-router)
  (auth)/                 sign in, sign up
  (tabs)/                 home, matches, tournaments, stats, more
  match/[id].tsx          match centre: live, scorecard, info
  scorer/[id].tsx         ball-by-ball scoring console
  tournament/[id].tsx     table, fixtures, teams, stats
  organizer/              console, new tournament, teams & players
components/               shared UI kit
src/
  domain/                 pure cricket logic + tests
  data/                   repositories, mappers, offline queue
  store/                  auth context, live match hook
  lib/                    Supabase client, environment
supabase/
  migrations/             schema, RLS, views
  seed.sql                demo league
scripts/verify-schema.ts  runs the SQL against in-process Postgres
```

---

## Checks

```bash
npm run check
```

Runs three things:

- `typecheck` — TypeScript across the whole app
- `test` — 54 cricket-rules unit tests
- `verify:schema` — executes every migration and the seed against a real
  Postgres (PGlite, in-process) and asserts the derived views reconcile:
  batters plus extras equal the team total, bowling figures account for every
  legal ball, points match wins and ties, no bowler bowls consecutive overs

No Docker required.

---

## Not built yet

Deliberately left out of this pass, in rough priority order:

- **Fantasy leagues.** The earlier prototype had a credit-based picker; making it
  real needs its own contest, entry and points tables rather than a static screen.
  `players.credit_value` is already there for it.
- **Push notifications.** Notifications are created and delivered inside the app
  (registration submitted, approved, rejected). Pushing them to a locked phone
  needs a server function plus a development build — Expo Go cannot receive push
  on SDK 54. The `device_sessions` table is ready for the tokens.
- **Live video.** `matches.stream_url` is stored and nothing consumes it yet.
- **DLS.** `innings.revised_target` exists for manual entry; the Duckworth–Lewis
  calculation itself is not implemented.
- **Super overs**, declarations and follow-ons. The schema allows up to four
  innings; the UI drives two.
- **PDF scorecard export** and Arabic/RTL localisation.
