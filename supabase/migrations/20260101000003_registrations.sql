-- ============================================================================
-- Cricket Arena — player self-registration, following, and avatars
-- ============================================================================
-- Three additions:
--
-- 1. `player_registrations` lets a cricketer apply to join a squad themselves.
--    Nothing they submit touches the real roster until an organiser approves
--    it, so a stranger cannot insert themselves into a league's statistics.
--
-- 2. `follows` powers the fan experience: follow a team, tournament or player
--    and their fixtures surface on your dashboard.
--
-- 3. An `avatars` storage bucket with policies that keep each user inside
--    their own folder.
-- ============================================================================

create type registration_status as enum ('pending', 'approved', 'rejected', 'withdrawn');

create table player_registrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  /* Optional: applying for a specific competition rather than the club at large. */
  tournament_id uuid references tournaments (id) on delete set null,
  /* The account making the application. */
  user_id uuid not null references profiles (id) on delete cascade,
  /* Filled in on approval, linking the application to the roster entry it created. */
  player_id uuid references players (id) on delete set null,

  full_name text not null check (length(trim(full_name)) >= 2),
  display_name text,
  jersey_number int check (jersey_number is null or jersey_number between 0 and 999),
  date_of_birth date,
  phone text,
  photo_url text,
  role player_role not null default 'batter',
  batting_style batting_style not null default 'right_hand',
  bowling_style bowling_style not null default 'none',
  /* A note from the applicant to the organiser. */
  note text check (note is null or length(note) <= 500),

  status registration_status not null default 'pending',
  reviewed_by uuid references profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),

  -- One open application per person per team. Re-applying after a rejection is
  -- allowed, because the partial index only covers pending rows.
  constraint reviewed_has_reviewer check (
    (status in ('pending', 'withdrawn')) or (reviewed_by is not null and reviewed_at is not null)
  )
);

create unique index one_pending_application
  on player_registrations (team_id, user_id)
  where status = 'pending';

create index on player_registrations (organization_id, status);
create index on player_registrations (user_id);

-- ---------------------------------------------------------------------------
-- Following
-- ---------------------------------------------------------------------------

create table follows (
  user_id uuid not null references profiles (id) on delete cascade,
  team_id uuid references teams (id) on delete cascade,
  tournament_id uuid references tournaments (id) on delete cascade,
  player_id uuid references players (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Exactly one target per row.
  constraint one_target check (
    (team_id is not null)::int + (tournament_id is not null)::int + (player_id is not null)::int = 1
  )
);

create unique index follows_team_unique on follows (user_id, team_id) where team_id is not null;
create unique index follows_tournament_unique on follows (user_id, tournament_id) where tournament_id is not null;
create unique index follows_player_unique on follows (user_id, player_id) where player_id is not null;
create index on follows (user_id);

-- ---------------------------------------------------------------------------
-- Approval
-- ---------------------------------------------------------------------------

-- Approving an application has to do three things together — create the player,
-- put them in the squad, and mark the application — so it lives in one function
-- rather than three round trips that could half-fail.
--
-- SECURITY DEFINER because the approving admin needs to write a `players` row
-- on someone else's behalf; the first statement re-checks that they are
-- actually an admin of the owning organisation.
create or replace function approve_registration(registration uuid, note text default null)
returns players
language plpgsql
security definer
set search_path = public
as $$
-- `note` and `registration` shadow columns of player_registrations; the
-- parameter is always what is meant here.
#variable_conflict use_variable
declare
  app player_registrations;
  created players;
begin
  select * into app from player_registrations where id = registration;
  if not found then
    raise exception 'Registration not found';
  end if;

  if not auth_is_org_admin(app.organization_id) then
    raise exception 'Only an administrator of this organisation can approve registrations'
      using errcode = '42501';
  end if;

  if app.status <> 'pending' then
    raise exception 'This registration has already been %', app.status;
  end if;

  -- Reuse an existing roster entry when this account is already a player here,
  -- so someone moving between clubs keeps one career record.
  select * into created from players
  where organization_id = app.organization_id and user_id = app.user_id
  limit 1;

  if not found then
    insert into players (
      organization_id, user_id, full_name, display_name, jersey_number,
      date_of_birth, phone, photo_url, role, batting_style, bowling_style
    )
    values (
      app.organization_id, app.user_id, app.full_name, app.display_name, app.jersey_number,
      app.date_of_birth, app.phone, app.photo_url, app.role, app.batting_style, app.bowling_style
    )
    returning * into created;
  end if;

  insert into team_members (team_id, player_id)
  values (app.team_id, created.id)
  on conflict do nothing;

  update player_registrations
  set status = 'approved',
      player_id = created.id,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = note
  where id = registration;

  -- Give the applicant a role in the organisation so the app stops treating
  -- them as an anonymous fan.
  insert into organization_members (organization_id, user_id, role)
  values (app.organization_id, app.user_id, 'player')
  on conflict do nothing;

  return created;
end;
$$;

create or replace function reject_registration(registration uuid, note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
declare
  org uuid;
begin
  select organization_id into org from player_registrations where id = registration;
  if org is null then
    raise exception 'Registration not found';
  end if;
  if not auth_is_org_admin(org) then
    raise exception 'Only an administrator of this organisation can reject registrations'
      using errcode = '42501';
  end if;

  update player_registrations
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = note
  where id = registration and status = 'pending';
end;
$$;

grant execute on function approve_registration(uuid, text) to authenticated;
grant execute on function reject_registration(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
-- `notifications` deliberately has no INSERT policy: rows are only ever created
-- by these triggers, so nobody can spam another user's inbox through the API.

create or replace function notify_registration_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  team_name text;
  admin_id uuid;
begin
  select name into team_name from teams where id = new.team_id;

  -- Notify every administrator, and fall back to whoever created the
  -- organisation. Without the fallback an org whose admin role was never
  -- assigned would swallow applications silently.
  for admin_id in
    select om.user_id from organization_members om
    where om.organization_id = new.organization_id and om.role = 'tournament_admin'
    union
    select o.created_by from organizations o
    where o.id = new.organization_id and o.created_by is not null
  loop
    insert into notifications (user_id, title, body, kind, tournament_id)
    values (
      admin_id,
      'New player registration',
      new.full_name || ' has applied to join ' || coalesce(team_name, 'a team') || '.',
      'registration',
      new.tournament_id
    );
  end loop;

  return new;
end;
$$;

create trigger on_registration_submitted
  after insert on player_registrations
  for each row execute function notify_registration_submitted();

create or replace function notify_registration_reviewed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  team_name text;
begin
  if new.status = old.status then
    return new;
  end if;

  select name into team_name from teams where id = new.team_id;

  if new.status = 'approved' then
    insert into notifications (user_id, title, body, kind, tournament_id)
    values (
      new.user_id,
      'You are in the squad',
      'Your registration for ' || coalesce(team_name, 'the team') || ' was approved.'
        || coalesce(' ' || new.review_note, ''),
      'registration',
      new.tournament_id
    );
  elsif new.status = 'rejected' then
    insert into notifications (user_id, title, body, kind, tournament_id)
    values (
      new.user_id,
      'Registration not accepted',
      'Your registration for ' || coalesce(team_name, 'the team') || ' was not accepted.'
        || coalesce(' ' || new.review_note, ''),
      'registration',
      new.tournament_id
    );
  end if;

  return new;
end;
$$;

create trigger on_registration_reviewed
  after update on player_registrations
  for each row execute function notify_registration_reviewed();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table player_registrations enable row level security;
alter table follows enable row level security;

-- An applicant sees their own; organisers see everything sent to them.
create policy registrations_read on player_registrations
  for select using (
    user_id = auth.uid()
    or auth_has_org_role(organization_id, array['tournament_admin', 'team_manager']::app_role[])
  );

-- You may only apply as yourself, and only ever as pending.
create policy registrations_insert on player_registrations
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

-- The applicant may withdraw. Approving and rejecting go through the functions
-- above, which is why there is no general update policy for organisers here.
create policy registrations_withdraw on player_registrations
  for update using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status in ('pending', 'withdrawn'));

create policy follows_own on follows
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Avatar storage
-- ---------------------------------------------------------------------------
-- Public read so photos render on the fan-facing web build without a signed
-- URL; writes are confined to a folder named after the user's own id.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152, -- 2 MB is plenty for a resized profile photo
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "Avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users upload their own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users replace their own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users delete their own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table player_registrations;
alter publication supabase_realtime add table notifications;
