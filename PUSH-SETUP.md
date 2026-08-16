# Turning on push notifications

Two ways. **Option A needs no command line at all** and is the one to use if the
CLI gave you trouble.

Your project reference is `avbdgmwsurlgvokuyzom`.

---

## Why your command did not work

You ran it from `E:\Label\Weigh_Bridge`. The Supabase CLI looks for a
`supabase/functions/` folder relative to wherever you run it, and that folder
lives in the Cricket project on `F:`. Nothing was wrong with the command — it
was pointed at the wrong place.

If you use the CLI, `cd` there first:

```bash
cd /f/Projects/Cricket/CricketArena-Mobile-App-v2/CricketArena
```

---

# Option A — the dashboard, no command line

## Step 1. Create the function

1. Open **[Edge Functions](https://supabase.com/dashboard/project/avbdgmwsurlgvokuyzom/functions)**.
2. Click **Deploy a new function**, then **Via editor**.
3. Name it exactly:

   ```
   send-push
   ```

4. Delete the sample code in the editor.
5. Open `supabase/functions/send-push/index.ts` from your project, select all,
   copy, and paste it in.
6. Click **Deploy function**. It takes about thirty seconds.

## Step 2. Let it run without a login token

The function is called by a scheduled job, not by a signed-in person, so it must
not demand a user token.

1. Open the **send-push** function → **Details** (or **Settings**).
2. Find **Verify JWT with legacy secret** and switch it **OFF**.
3. Save.

It is not left unprotected: step 3 gives it a password of its own.

## Step 3. Give it a secret

1. Go to **[Edge Functions → Secrets](https://supabase.com/dashboard/project/avbdgmwsurlgvokuyzom/settings/functions)**.
2. **Add new secret**:

   | Name | Value |
   |---|---|
   | `PUSH_FUNCTION_SECRET` | any long random string you invent |

   Something like `cricket-9f2k-push-7xQ4-arena` is fine. Keep a copy — step 5
   needs it.

3. Save.

The function refuses any request that does not present this, so switching off
the JWT check does not leave it open to the world.

## Step 4. Switch on the two extensions

The scheduler and the ability to call a URL from the database are both
extensions, and both are off by default.

1. Open **[Database → Extensions](https://supabase.com/dashboard/project/avbdgmwsurlgvokuyzom/database/extensions)**.
2. Search **`pg_cron`** → enable.
3. Search **`pg_net`** → enable.

## Step 5. Schedule it

Open the **[SQL Editor](https://supabase.com/dashboard/project/avbdgmwsurlgvokuyzom/sql/new)**,
paste this, and **replace `PUT-YOUR-SECRET-HERE`** with the secret from step 3:

```sql
select cron.schedule(
  'drain-push-queue',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://avbdgmwsurlgvokuyzom.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-push-secret', 'PUT-YOUR-SECRET-HERE'
      ),
      body := '{}'::jsonb
    );
  $$
);
```

Run it. `* * * * *` means once a minute, so a notification arrives within about
sixty seconds.

## Step 6. Check it works

**Is the job scheduled?**

```sql
select jobid, jobname, schedule, active from cron.job;
```

**Did it run?**

```sql
select status, return_message, start_time
from cron.job_run_details
order by start_time desc
limit 5;
```

**Is anything queued or sent?**

```sql
select status, count(*), max(created_at) as newest
from push_queue
group by status;
```

`sent` means it worked. `pending` that never changes means the schedule is not
firing — recheck steps 4 and 5. `failed` with a `last_error` means Expo rejected
it; read the message:

```sql
select title, last_error, attempts from push_queue where status = 'failed';
```

## Step 7. Try it end to end

1. Open the app **on your phone** (not the website — the browser cannot receive
   these).
2. **More → Notification settings → Enable on this device**, and allow the
   Android prompt.
3. Have someone apply to join a squad, or approve a registration yourself from
   another account.
4. Lock the phone. The notification should arrive within a minute.

---

# Option B — the command line

Only differs in how the function gets uploaded. Steps 2 to 7 above still apply.

```bash
cd /f/Projects/Cricket/CricketArena-Mobile-App-v2/CricketArena
```

```bash
npx supabase login
```

```bash
npx supabase functions deploy send-push --project-ref avbdgmwsurlgvokuyzom --no-verify-jwt
```

`--no-verify-jwt` does the same thing as step 2, so you can skip that step if
you deploy this way.

---

## Things that catch people out

**Push does not work in Expo Go, and never will.** It needs the installed APK
from the releases page. This is a limitation Expo introduced, not a bug here.

**Push does not work on the website.** Browsers have their own separate
notification system, and a fan reading the site does not expect a system alert.
The settings screen says so rather than failing silently.

**Nothing arrives until a device is registered.** Tapping *Enable on this
device* is what stores the token. Without it the queue marks entries `skipped`,
which is correct behaviour, not an error.

**Uninstalling the app kills the token.** Expo reports `DeviceNotRegistered`,
and the function deletes it rather than retrying forever. Reinstalling and
tapping *Enable* again issues a fresh one.

## Turning it off

```sql
select cron.unschedule('drain-push-queue');
```
