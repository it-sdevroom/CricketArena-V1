-- ============================================================================
-- Cricket Arena — account deletion
-- ============================================================================
-- Apple rejects any app with account creation that does not also offer account
-- deletion from inside the app (App Store Review Guideline 5.1.1(v)), and
-- Google Play requires a deletion route as well. This is that mechanism.
--
-- The subtlety is what "delete my account" should mean in a sports record.
-- A player's runs belong to the match they were scored in — erasing them would
-- silently rewrite a league table that other people rely on. So deletion
-- removes the *person*: their login, profile, follows, notifications and
-- registrations. The roster entry survives with its statistics, detached from
-- any account, exactly as it would for a club member who never signed up.
-- ============================================================================

create or replace function delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'You must be signed in to delete your account'
      using errcode = '42501';
  end if;

  -- Detach the roster entry so match statistics stay intact and attributable
  -- to a name, without pointing at a login that no longer exists.
  update players set user_id = null where user_id = me;

  -- Hand over any organisation this person is the sole administrator of, so a
  -- league is never left with nobody able to run it. Ownership passes to the
  -- longest-standing remaining member.
  update organization_members om
  set role = 'tournament_admin'
  where om.user_id = (
    select om2.user_id
    from organization_members om2
    where om2.organization_id = om.organization_id
      and om2.user_id <> me
    order by om2.created_at
    limit 1
  )
  and om.organization_id in (
    select organization_id from organization_members
    where user_id = me and role = 'tournament_admin'
    group by organization_id
  )
  and not exists (
    select 1 from organization_members other
    where other.organization_id = om.organization_id
      and other.user_id <> me
      and other.role = 'tournament_admin'
  );

  -- Everything else hangs off auth.users by foreign key: profiles cascades,
  -- and from there follows, notifications, device_sessions, organisation
  -- membership and registrations all cascade too. Authored messages and
  -- recorded deliveries keep their rows with a null author.
  delete from auth.users where id = me;
end;
$$;

comment on function delete_my_account is
  'Deletes the signed-in user. Roster entries and match statistics survive, detached from the account.';

grant execute on function delete_my_account() to authenticated;
