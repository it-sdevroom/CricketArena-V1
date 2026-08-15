# Your checklist

Things only you can do, because they need your accounts. Work top to bottom;
each one is independent.

---

## 1. Fix the email links (5 minutes) — DO THIS FIRST

Two separate problems are stacked on top of each other. Fixing only one leaves
you stuck, which is why it has looked like nothing changed.

### 1a. The link still points at localhost:3000

The app already sends the correct redirect with every email, but **Supabase
overrides it with the Site URL from your dashboard**, and that is still the
default. This setting is the one that matters.

Go to
**[Authentication → URL Configuration](https://supabase.com/dashboard/project/avbdgmwsurlgvokuyzom/auth/url-configuration)**

**Site URL** — replace `http://localhost:3000` with exactly:

```
https://mnauman228-coder.github.io/CricketArena-V1/
```

**Redirect URLs** — click `Add URL` three times and add each of these:

```
https://mnauman228-coder.github.io/CricketArena-V1/**
```
```
cricketarena://**
```
```
http://localhost:8081/**
```

The first is your website, the second lets a link reopen the phone app, the
third keeps local development working. The `**` on the end matters — without it
Supabase rejects the redirect and silently falls back to the Site URL.

Press **Save**. Nothing is retroactive: emails already sent stay broken, the
next one will be correct.

### 1b. Only the first email ever arrives

This is not a bug. **Supabase's free tier sends about 2–4 emails per hour in
total**, across every user. Once you hit it, further emails are dropped with no
error shown anywhere. That is exactly what you are seeing.

For testing, turn the requirement off entirely:

**[Authentication → Providers → Email](https://supabase.com/dashboard/project/avbdgmwsurlgvokuyzom/auth/providers)**
→ expand **Email** → switch **Confirm email** to **OFF** → **Save**.

Accounts then work the instant you create them, with no email at all. Turn it
back on before real users arrive — and by then connect a proper mail provider
(Resend, SendGrid, Postmark) under **Authentication → Emails → SMTP Settings**,
which removes the limit.

### 1c. Rescue the accounts you already created

**[Authentication → Users](https://supabase.com/dashboard/project/avbdgmwsurlgvokuyzom/auth/users)**

For each account stuck unconfirmed: click the `⋯` at the right → **Confirm
user**. It becomes usable immediately, no email needed.

---

## 2. Delete the test data (2 minutes)

The demo league — Riyadh Premier League, its six teams, 72 players and four
simulated matches — is only there so the app had something to show. Removing it
leaves the schema completely intact; only the demo rows go.

**[SQL Editor](https://supabase.com/dashboard/project/avbdgmwsurlgvokuyzom/sql/new)**
→ paste the whole of `supabase/remove-demo-data.sql` → **Run**.

It prints what it deleted. Your own account, and anything you have created
yourself, are untouched — it only removes the organisation with the slug
`riyadh-cricket-board`.

Afterwards the app will look empty. That is correct: create your own
organisation and tournament from **Organiser console → New tournament**.

---

## 3. Make yourself an administrator (1 minute)

Only needed once, and only if you have not already done it. Sign up in the app
first, then in the **SQL Editor**:

```sql
update profiles set is_platform_admin = true
where id = (select id from auth.users where email = 'your@email.com');
```

Put your real email in. Refresh the app and the organiser console, scoring
console and registration approvals all appear.

---

## 4. New database migrations to run

Paste each of these into the **SQL Editor** and run it, in order. Run each one
**once**. Do not re-run `setup-all.sql` on a database that already has the
earlier migrations — it will error on types that already exist.

| File | What it adds |
|---|---|
| `supabase/migrations/20260101000006_dls_and_push.sql` | Rain-revised targets, and push token storage |

If you are unsure whether an earlier one was applied, open the **Table Editor**
and look for the table it creates. `media` means migration 5 is in.

---

## 5. GitHub — nothing to do

Every push deploys automatically and the site is live at
https://mnauman228-coder.github.io/CricketArena-V1/

The only thing worth knowing: if a deploy ever goes red, open the **Actions**
tab and read the failed step. The workflow refuses to publish when the tests or
the schema check fail, which is deliberate.

---

## 6. Expo — nothing to do for Android

The APK builds entirely on your own machine with `bash scripts/build-apk.sh`.
No Expo account, no queue, no fee.

You would only need Expo for:

- **iOS**, which requires macOS to compile — EAS rents you one
- **Play Store**, which wants an `.aab` signed with a real upload key rather
  than the debug key used for testing

---

## What I am building meanwhile

- Team logo upload, finishing the images work
- Rain-revised targets and reduced overs
- Scorecard export as a PDF you can share
- Push notifications to a locked phone

Push is the one with a catch worth repeating: it **cannot work in Expo Go**, and
notifications only reach a phone from a real build. It also needs the migration
in section 4 for token storage.
