-- ============================================================================
-- Cricket Arena — rain interruptions, and push notification delivery
-- ============================================================================
-- The columns a revised target needs (innings.reduced_overs and
-- innings.revised_target) already exist from migration 0. What was missing is
-- the *record* of why they changed: if an organiser cuts an innings to twelve
-- overs and resets the target, the losing captain will ask on what basis. An
-- unexplained number in a database is how disputes start.
--
-- Real Duckworth-Lewis-Stern tables are licensed by the ICC and cannot be
-- reimplemented here, so this stores a manually agreed target and who agreed
-- it, which is what club cricket actually does.
-- ============================================================================

create type interruption_kind as enum (
  'rain',
  'bad_light',
  'ground_conditions',
  'crowd',
  'injury',
  'other'
);

create table match_interruptions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  innings_id uuid references innings (id) on delete cascade,

  kind interruption_kind not null default 'rain',
  /* Score when play stopped, so the decision can be reconstructed. */
  runs_at_stop int,
  wickets_at_stop int,
  balls_at_stop int,

  /* What the innings was cut to, and the target that was agreed. */
  overs_before int,
  overs_after int,
  target_before int,
  target_after int,

  /* Free text: "DLS par score 96, agreed with both captains". */
  note text check (note is null or length(note) <= 500),
  method text not null default 'manual' check (method in ('manual', 'dls', 'vjd', 'none')),

  started_at timestamptz not null default now(),
  resumed_at timestamptz,
  decided_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index on match_interruptions (match_id, created_at desc);

alter table match_interruptions enable row level security;

create policy interruptions_read on match_interruptions
  for select using (auth_can_read_match(match_id));

create policy interruptions_write on match_interruptions
  for all using (auth_can_score_match(match_id)) with check (auth_can_score_match(match_id));

comment on table match_interruptions is
  'Audit trail for rain delays and revised targets. The revised numbers live on innings; this records why.';

-- ---------------------------------------------------------------------------
-- Push notifications
-- ---------------------------------------------------------------------------
-- `device_sessions` already stores Expo push tokens. Two things were missing:
-- a way for someone to say what they want to be told about, and a queue the
-- server can drain.

create table notification_preferences (
  user_id uuid primary key references profiles (id) on delete cascade,
  /* A ball-by-ball feed would be unbearable; these are the moments that matter. */
  match_start boolean not null default true,
  match_result boolean not null default true,
  wicket_of_followed_player boolean not null default false,
  registration_updates boolean not null default true,
  chat_mentions boolean not null default true,
  /* Local time window, so a night match does not wake anyone at 2am. */
  quiet_hours_start int check (quiet_hours_start between 0 and 23),
  quiet_hours_end int check (quiet_hours_end between 0 and 23),
  updated_at timestamptz not null default now()
);

alter table notification_preferences enable row level security;

create policy notification_prefs_own on notification_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Outgoing push queue. A database trigger cannot call Expo's API directly, so
-- rows land here and an Edge Function drains them. Keeping it as a table means
-- a failed send is visible and retryable rather than lost.
create table push_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index on push_queue (status, created_at) where status = 'pending';

alter table push_queue enable row level security;

-- Only the service role drains this; nobody reads another person's queue.
create policy push_queue_own on push_queue
  for select using (user_id = auth.uid());

-- Every in-app notification also becomes a push, subject to preference.
create or replace function enqueue_push_for_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prefs notification_preferences;
  wants boolean := true;
begin
  select * into prefs from notification_preferences where user_id = new.user_id;

  -- No row means defaults, which are on for the important kinds.
  if found then
    wants := case new.kind
      when 'registration' then prefs.registration_updates
      when 'match_start' then prefs.match_start
      when 'result' then prefs.match_result
      when 'chat' then prefs.chat_mentions
      else true
    end;
  end if;

  if not wants then
    return new;
  end if;

  -- Only queue for people who actually have a device registered.
  if not exists (select 1 from device_sessions where user_id = new.user_id) then
    return new;
  end if;

  insert into push_queue (user_id, title, body, data)
  values (
    new.user_id,
    new.title,
    new.body,
    jsonb_build_object(
      'notificationId', new.id,
      'matchId', new.match_id,
      'tournamentId', new.tournament_id,
      'kind', new.kind
    )
  );

  return new;
end;
$$;

create trigger on_notification_enqueue_push
  after insert on notifications
  for each row execute function enqueue_push_for_notification();

-- Register or refresh this device's push token.
create or replace function register_push_token(token text, device_platform text default null)
returns void
language plpgsql
security invoker
as $$
begin
  if auth.uid() is null then
    raise exception 'Must be signed in to register for notifications' using errcode = '42501';
  end if;

  insert into device_sessions (user_id, expo_push_token, platform, last_seen_at)
  values (auth.uid(), token, device_platform, now())
  on conflict (user_id, expo_push_token)
  do update set last_seen_at = now(), platform = coalesce(excluded.platform, device_sessions.platform);
end;
$$;

grant execute on function register_push_token(text, text) to authenticated;

alter publication supabase_realtime add table match_interruptions;
