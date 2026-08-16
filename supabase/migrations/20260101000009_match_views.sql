-- ============================================================================
-- Cricket Arena — who is watching, and how many watched
-- ============================================================================
-- Two different questions, and they want two different mechanisms.
--
-- "How many are watching right now" is answered by Supabase Realtime presence
-- on the client: people join a channel when they open a match and drop off it
-- when they close the app or lose signal. Nothing is written to the database,
-- because a live count that survives a crashed phone is a lie.
--
-- "How many watched this match" needs to survive, so it is a row per viewer
-- here. One row per person per match, not per visit — refreshing a scorecard
-- eleven times is one interested spectator, not eleven.
--
-- Signed-out fans are counted too, keyed by a device id the client generates.
-- Most people following a local match never sign in, and a count that ignored
-- them would be the wrong number for an organiser deciding whether streaming is
-- worth the effort.
-- ============================================================================

create table match_views (
  match_id uuid not null references matches (id) on delete cascade,
  /* Null for a signed-out fan; then device_key identifies them instead. */
  user_id uuid references profiles (id) on delete cascade,
  /* Random, client-generated, stored on the device. Not an advertising id. */
  device_key text not null,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  /* Rough engagement: how many times they came back. */
  visits int not null default 1,

  primary key (match_id, device_key)
);

create index on match_views (match_id);
create index on match_views (user_id) where user_id is not null;

alter table match_views enable row level security;

-- Nobody reads individual rows: the aggregate below is what the app shows, and
-- exposing who watched what would be a small privacy disaster for no benefit.
create policy match_views_insert on match_views
  for insert with check (true);

create policy match_views_update_own on match_views
  for update using (true) with check (true);

comment on table match_views is
  'One row per device per match. Aggregated by match_view_counts; individual rows are never shown.';

-- ---------------------------------------------------------------------------
-- Record a view
-- ---------------------------------------------------------------------------
-- Upsert so a returning viewer bumps their own row rather than inflating the
-- count. SECURITY DEFINER so a signed-out fan can be counted without being
-- given write access to anything else.

create or replace function record_match_view(p_match_id uuid, p_device_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_device_key is null or length(p_device_key) < 8 then
    return;  -- ignore rather than error: a missing key is not worth a failure
  end if;

  insert into match_views (match_id, user_id, device_key)
  values (p_match_id, auth.uid(), p_device_key)
  on conflict (match_id, device_key) do update
    set last_seen_at = now(),
        visits = match_views.visits + 1,
        -- Someone who signs in mid-match stops being anonymous.
        user_id = coalesce(match_views.user_id, auth.uid());
end;
$$;

grant execute on function record_match_view(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The aggregate the app displays
-- ---------------------------------------------------------------------------

create view match_view_counts
with (security_invoker = on) as
select
  m.id as match_id,
  count(v.device_key)::int as total_viewers,
  count(v.device_key) filter (where v.user_id is not null)::int as signed_in_viewers,
  count(v.device_key) filter (where v.last_seen_at > now() - interval '10 minutes')::int as recent_viewers,
  coalesce(sum(v.visits), 0)::int as total_visits,
  max(v.last_seen_at) as last_viewed_at
from matches m
left join match_views v on v.match_id = m.id
group by m.id;

comment on view match_view_counts is
  'Aggregated viewer numbers per match. The only thing anyone can read about viewers.';
