-- ============================================================================
-- Cricket Arena — row level security
-- ============================================================================
-- Model
--
--   Reading sport is public. Scores, fixtures, rosters and points tables are
--   readable by anyone, including signed-out fans on the web build, except for
--   tournaments still marked private.
--
--   Writing sport is narrow. Only an organisation's admins can shape a
--   competition, and only officials assigned to a specific match may record a
--   ball in it.
--
-- All membership lookups go through SECURITY DEFINER helpers. A policy on
-- organization_members that itself queries organization_members would recurse
-- forever; the helpers run with the definer's rights and so bypass RLS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function auth_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_platform_admin from profiles where id = auth.uid()), false);
$$;

create or replace function auth_is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth_is_platform_admin()
     or exists (
       select 1 from organization_members
       where organization_id = org and user_id = auth.uid()
     );
$$;

create or replace function auth_has_org_role(org uuid, allowed app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth_is_platform_admin()
     or exists (
       select 1 from organization_members
       where organization_id = org
         and user_id = auth.uid()
         and role = any (allowed)
     );
$$;

-- Shorthand for "may configure this competition".
create or replace function auth_is_org_admin(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth_has_org_role(org, array['tournament_admin']::app_role[]);
$$;

-- May this user record balls in this match?
create or replace function auth_can_score_match(match uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from matches m
    where m.id = match
      and (
        auth_is_org_admin(m.organization_id)
        or exists (
          select 1 from match_officials o
          where o.match_id = m.id
            and o.user_id = auth.uid()
            and o.role = 'scorer'
        )
      )
  );
$$;

-- May this user see this match? Private tournaments are members-only.
create or replace function auth_can_read_match(match uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from matches m
    left join tournaments t on t.id = m.tournament_id
    where m.id = match
      and (t.id is null or t.is_public or auth_is_org_member(m.organization_id))
  );
$$;

-- Whoever creates an organisation becomes its first administrator.
create or replace function handle_new_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into organization_members (organization_id, user_id, role)
    values (new.id, new.created_by, 'tournament_admin')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger on_organization_created
  after insert on organizations
  for each row execute function handle_new_organization();

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table profiles              enable row level security;
alter table organizations         enable row level security;
alter table organization_members  enable row level security;
alter table venues                enable row level security;
alter table teams                 enable row level security;
alter table players               enable row level security;
alter table team_members          enable row level security;
alter table tournaments           enable row level security;
alter table tournament_teams      enable row level security;
alter table matches               enable row level security;
alter table match_officials       enable row level security;
alter table playing_xi            enable row level security;
alter table innings               enable row level security;
alter table deliveries            enable row level security;
alter table score_corrections     enable row level security;
alter table channels              enable row level security;
alter table messages              enable row level security;
alter table notifications         enable row level security;
alter table device_sessions       enable row level security;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create policy profiles_read on profiles
  for select using (true);

create policy profiles_update_own on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- The sign-up trigger inserts the row; this covers a manual repair.
create policy profiles_insert_own on profiles
  for insert with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Organisations
-- ---------------------------------------------------------------------------

create policy organizations_read on organizations
  for select using (true);

create policy organizations_insert on organizations
  for insert to authenticated
  with check (created_by = auth.uid());

create policy organizations_update on organizations
  for update using (auth_is_org_admin(id));

create policy organizations_delete on organizations
  for delete using (auth_is_org_admin(id));

create policy org_members_read on organization_members
  for select using (auth_is_org_member(organization_id) or user_id = auth.uid());

create policy org_members_write on organization_members
  for all using (auth_is_org_admin(organization_id))
  with check (auth_is_org_admin(organization_id));

-- ---------------------------------------------------------------------------
-- Rosters and venues: public to read, admins to write
-- ---------------------------------------------------------------------------

create policy venues_read on venues for select using (true);
create policy venues_write on venues
  for all using (auth_is_org_admin(organization_id))
  with check (auth_is_org_admin(organization_id));

create policy teams_read on teams for select using (true);

create policy teams_write on teams
  for all
  using (
    auth_is_org_admin(organization_id)
    or manager_id = auth.uid()
  )
  with check (
    auth_is_org_admin(organization_id)
    or manager_id = auth.uid()
  );

create policy players_read on players for select using (true);

create policy players_write on players
  for all
  using (
    auth_has_org_role(organization_id, array['tournament_admin', 'team_manager']::app_role[])
  )
  with check (
    auth_has_org_role(organization_id, array['tournament_admin', 'team_manager']::app_role[])
  );

-- A player may maintain their own record once it is linked to their account.
create policy players_update_self on players
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy team_members_read on team_members for select using (true);

create policy team_members_write on team_members
  for all
  using (
    exists (
      select 1 from teams t
      where t.id = team_id
        and (auth_has_org_role(t.organization_id, array['tournament_admin', 'team_manager']::app_role[])
             or t.manager_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from teams t
      where t.id = team_id
        and (auth_has_org_role(t.organization_id, array['tournament_admin', 'team_manager']::app_role[])
             or t.manager_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Tournaments
-- ---------------------------------------------------------------------------

create policy tournaments_read on tournaments
  for select using (is_public or auth_is_org_member(organization_id));

create policy tournaments_write on tournaments
  for all using (auth_is_org_admin(organization_id))
  with check (auth_is_org_admin(organization_id));

create policy tournament_teams_read on tournament_teams
  for select using (
    exists (
      select 1 from tournaments t
      where t.id = tournament_id
        and (t.is_public or auth_is_org_member(t.organization_id))
    )
  );

create policy tournament_teams_write on tournament_teams
  for all
  using (
    exists (select 1 from tournaments t where t.id = tournament_id and auth_is_org_admin(t.organization_id))
  )
  with check (
    exists (select 1 from tournaments t where t.id = tournament_id and auth_is_org_admin(t.organization_id))
  );

-- ---------------------------------------------------------------------------
-- Matches
-- ---------------------------------------------------------------------------

create policy matches_read on matches
  for select using (
    tournament_id is null
    or exists (
      select 1 from tournaments t
      where t.id = tournament_id
        and (t.is_public or auth_is_org_member(t.organization_id))
    )
  );

create policy matches_write on matches
  for all using (auth_is_org_admin(organization_id))
  with check (auth_is_org_admin(organization_id));

-- A scorer may move the match through its states (toss, live, completed)
-- without being able to create or delete fixtures.
create policy matches_update_by_scorer on matches
  for update using (auth_can_score_match(id)) with check (auth_can_score_match(id));

create policy match_officials_read on match_officials
  for select using (auth_can_read_match(match_id));

create policy match_officials_write on match_officials
  for all
  using (exists (select 1 from matches m where m.id = match_id and auth_is_org_admin(m.organization_id)))
  with check (exists (select 1 from matches m where m.id = match_id and auth_is_org_admin(m.organization_id)));

create policy playing_xi_read on playing_xi
  for select using (auth_can_read_match(match_id));

create policy playing_xi_write on playing_xi
  for all using (auth_can_score_match(match_id)) with check (auth_can_score_match(match_id));

-- ---------------------------------------------------------------------------
-- Scoring
-- ---------------------------------------------------------------------------

create policy innings_read on innings
  for select using (auth_can_read_match(match_id));

create policy innings_write on innings
  for all using (auth_can_score_match(match_id)) with check (auth_can_score_match(match_id));

create policy deliveries_read on deliveries
  for select using (auth_can_read_match(match_id));

create policy deliveries_insert on deliveries
  for insert to authenticated
  with check (auth_can_score_match(match_id) and recorded_by = auth.uid());

-- Corrections stay possible, but every one is written to score_corrections by
-- the client and both are visible to the organiser.
create policy deliveries_update on deliveries
  for update using (auth_can_score_match(match_id)) with check (auth_can_score_match(match_id));

create policy deliveries_delete on deliveries
  for delete using (auth_can_score_match(match_id));

create policy corrections_read on score_corrections
  for select using (auth_can_read_match(match_id));

create policy corrections_insert on score_corrections
  for insert to authenticated
  with check (auth_can_score_match(match_id) and performed_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Communication
-- ---------------------------------------------------------------------------

create policy channels_read on channels
  for select using (
    tournament_id is null
    or exists (
      select 1 from tournaments t
      where t.id = tournament_id and (t.is_public or auth_is_org_member(t.organization_id))
    )
  );

create policy channels_write on channels
  for all using (auth_is_org_admin(organization_id))
  with check (auth_is_org_admin(organization_id));

create policy messages_read on messages
  for select using (
    exists (
      select 1 from channels c
      left join tournaments t on t.id = c.tournament_id
      where c.id = channel_id
        and (t.id is null or t.is_public or auth_is_org_member(c.organization_id))
    )
  );

create policy messages_insert on messages
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from channels c
      where c.id = channel_id and auth_is_org_member(c.organization_id)
    )
  );

create policy messages_delete_own on messages
  for delete using (
    author_id = auth.uid()
    or exists (select 1 from channels c where c.id = channel_id and auth_is_org_admin(c.organization_id))
  );

-- ---------------------------------------------------------------------------
-- Personal data: strictly the owner's
-- ---------------------------------------------------------------------------

create policy notifications_read on notifications
  for select using (user_id = auth.uid());

create policy notifications_update on notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notifications_delete on notifications
  for delete using (user_id = auth.uid());

create policy device_sessions_own on device_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
