# Where things stand

Snapshot for picking the work back up. Last updated 14 August 2026, at commit
`9c4f554`.

---

## The three URLs

| What | Where |
|---|---|
| Live app | https://mnauman228-coder.github.io/CricketArena-V1/ |
| Repository | https://github.com/mnauman228-coder/CricketArena-V1 |
| Supabase project | https://avbdgmwsurlgvokuyzom.supabase.co |

Every push to `main` redeploys automatically, and will not deploy if the tests
or the schema check fail.

---

## Do these first

Two things are outstanding and both are in the Supabase dashboard, not in code.

### 1. Email confirmation links are broken

Sign-up emails point at `http://localhost:3000`, so the link spins forever on a
phone. The app already sends an explicit redirect with every auth email, but
Supabase only honours redirects that appear on its allow list.

**Authentication → URL Configuration**

- **Site URL** → `https://mnauman228-coder.github.io/CricketArena-V1/`
- **Redirect URLs**, add all three:
  - `https://mnauman228-coder.github.io/CricketArena-V1/**`
  - `cricketarena://**`
  - `http://localhost:8081/**`

The account already signed up is not lost. **Authentication → Users** → `⋯` →
**Confirm user** makes it usable immediately.

While testing, **Authentication → Providers → Email** has a "Confirm email"
toggle. Turning it off removes the email round-trip entirely. Turn it back on
before real users arrive.

### 2. Migration 5 may not have been run

Migrations 0–4 are known to be applied. Migration 5 added the `media` table,
the super over columns and two storage buckets:

```
supabase/migrations/20260101000005_media_and_super_over.sql
```

Paste **only that file** into the SQL editor. Do not re-run `setup-all.sql` on
a database that already has the earlier migrations — it will error on types
that already exist.

To check whether it is applied, look for a `media` table in the Table Editor.

### 3. Make yourself an administrator

The seeded demo league has no owner, so a new account sees it as a spectator.
After signing up:

```sql
update profiles set is_platform_admin = true
where id = (select id from auth.users where email = 'your@email.com');
```

Refresh the app and the organiser console, scoring console and registration
approvals all appear.

---

## What works

- **Scoring engine** — full laws: wides, no balls, free hits, byes and leg
  byes, penalties, every dismissal type, strike rotation, maidens, bowler
  quotas, consecutive-over blocking. An innings is a fold over its deliveries,
  so undo is dropping a row and a correction is editing one.
- **Tournaments** — round robin, double round robin, groups, knockout, league
  plus play-offs. Points table with net run rate, including the rule that a
  side bowled out is charged its full quota of overs.
- **Live match centre** with realtime updates between devices, and ball-by-ball
  commentary grouped by over.
- **Super overs** — offered when scores finish level, and can repeat if the
  super over itself ties. Excluded from career figures and net run rate.
- **Player self-registration** with a photo, going to an organiser approval
  queue, with notifications both ways.
- **Images** — profile photos, and match photographs. Team logos have a bucket
  and an upload path but no UI yet (see below).
- **Highlights** — YouTube links play inline on web and hand off to the native
  app on a phone. Photographs upload to storage.
- **Offline scoring queue** with idempotency keys, so a flaky connection at a
  ground cannot double-count a ball.
- **Store readiness** — icons, privacy policy, in-app account deletion.

---

## What is not built

Named honestly rather than implied as done:

- **DLS / rain-revised targets.** The columns `reduced_overs` and
  `revised_target` exist on `innings` and the engine honours `reducedOvers`,
  but nothing sets them and there is no UI. Real DLS tables are licensed; a
  manual revised target is the realistic version.
- **PDF / share scorecard.**
- **Push notifications.** In-app notifications work. Push needs a development
  build — it cannot work in Expo Go — plus an Expo push token per device. The
  `device_sessions` table is already there for the tokens.
- **Fantasy leagues.** `players.credit_value` is seeded and nothing else exists.
- **Team logo upload UI.** `uploadTeamLogo()` and the bucket and policies are
  all in place; no screen calls it.
- **Arabic / RTL.** Cancelled by the user on 14 August.

---

## Commands

```bash
npm run check          # typecheck + 77 tests + schema + combined-SQL equivalence
npm test               # cricket rules only, fast
npm run verify:schema  # runs every migration and the seed against real Postgres
npm run sql:build      # regenerate supabase/setup-all.sql after adding a migration
npm run icons          # regenerate the icon set from the theme colours
npm start              # Expo dev server
npm run export:web     # static web build into dist/
```

`npm run check` is what CI runs. If it passes locally it will pass there.

---

## Things worth knowing before changing anything

**Deliveries are the source of truth.** Scorecards, points tables and career
figures are all views folded out of the `deliveries` table. There is no stored
"total runs" to keep in step. If you add a statistic, add it as a view.

**Wide and no-ball runs are stored as absolute totals** including the automatic
penalty, so the generated columns need no knowledge of the competition's rules.
The domain layer uses "additional runs run" instead, and `src/data/mappers.ts`
converts between the two. Do not mix them up.

**`EXPO_PUBLIC_*` variables are inlined at build time**, not read at runtime.
Changing a GitHub secret does nothing until the workflow runs again.

**Adding a migration means running `npm run sql:build`.** A check compares two
throwaway Postgres databases — one built from the migrations, one from
`setup-all.sql` — and fails if they diverge. It has already caught this once.

**The runners are on Node 22.** Node 20's test runner cannot resolve glob
patterns, which is why the test script names its files explicitly rather than
globbing.

**A super over is three players a side.** That is not a typo — expressing it
that way makes the existing "all out at `playersPerSide - 1` wickets" check
close the innings after two wickets, which is the actual law.

---

## Suggested next step

Build the APK and test on a real phone before adding anything else. A lot of
surface went in recently — commentary, super overs, photo upload, result
recording — and none of it has been used on a physical device.

```bash
npx eas-cli@latest login     # needs a free account from expo.dev
npx eas-cli@latest init
npx eas-cli@latest build --platform android --profile preview
```

`eas.json` already carries the live Supabase URL and publishable key, so the
resulting APK will talk to the real database rather than opening on the setup
screen. Expect 15–25 minutes on the free queue.

For the stores themselves: Google Play is $25 once, and a new personal
developer account must run a 14-day closed test with 12 testers before going
public. Apple is $99 a year. Both need accounts in the owner's name, so neither
can be done on their behalf.
