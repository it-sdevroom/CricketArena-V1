-- ============================================================================
-- Cricket Arena — team logos, match media, and super overs
-- ============================================================================
-- Three additions:
--
-- 1. Two more storage buckets. Avatars are owned by the person in them, so
--    that policy keys on the user's own folder. Team logos and match media are
--    owned by the *competition*, so they key on organisation membership
--    instead — a team manager can change their crest, a passer-by cannot.
--
-- 2. `media` records highlight clips and photographs against a match. Video is
--    stored as a link to YouTube or a stream host rather than as a file: a
--    single innings of footage would dwarf every other row in this database.
--
-- 3. Super overs. A tie is decided by one extra over per side, and the laws
--    for it differ from a normal innings — two wickets ends it rather than ten.
--    Modelling it as further innings on the same match keeps the whole event
--    log in one place.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Super over
-- ---------------------------------------------------------------------------

-- A T20 tie produces innings 3 and 4; a second super over would produce 5 and
-- 6, which does happen.
alter table innings drop constraint if exists innings_innings_number_check;
alter table innings add constraint innings_innings_number_check
  check (innings_number between 1 and 8);

alter table innings add column is_super_over boolean not null default false;

-- Which super over this is: 1 for the first, 2 if the first was also tied.
alter table innings add column super_over_number int;

alter table innings add constraint super_over_numbered check (
  (not is_super_over and super_over_number is null)
  or (is_super_over and super_over_number is not null and super_over_number > 0)
);

comment on column innings.is_super_over is
  'Super over innings. Two wickets ends it, not ten, and it does not count toward career figures.';

-- A match can now be decided by a super over rather than on the main innings.
alter table matches add column decided_by_super_over boolean not null default false;

-- ---------------------------------------------------------------------------
-- Match media: highlights, photographs and streams
-- ---------------------------------------------------------------------------

create type media_kind as enum ('video', 'photo', 'stream');

create table media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  match_id uuid references matches (id) on delete cascade,
  tournament_id uuid references tournaments (id) on delete cascade,
  team_id uuid references teams (id) on delete set null,
  player_id uuid references players (id) on delete set null,

  kind media_kind not null default 'video',
  title text not null check (length(trim(title)) between 1 and 140),
  description text check (description is null or length(description) <= 1000),
  /* YouTube, Mux, Cloudflare Stream, or a Supabase Storage public URL. */
  url text not null,
  thumbnail_url text,
  /* Seconds into the match, so a clip can be pinned to a moment. */
  duration_seconds int,
  /* Which over this clip covers, for jumping from the commentary feed. */
  over_number int,

  is_featured boolean not null default false,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint media_has_a_home check (match_id is not null or tournament_id is not null)
);

create index on media (match_id, created_at desc);
create index on media (tournament_id, created_at desc);
create index on media (organization_id);

alter table media enable row level security;

-- Highlights follow the visibility of whatever they are attached to.
create policy media_read on media
  for select using (
    (match_id is not null and auth_can_read_match(match_id))
    or (
      tournament_id is not null
      and exists (
        select 1 from tournaments t
        where t.id = tournament_id
          and (t.is_public or auth_is_org_member(t.organization_id))
      )
    )
  );

create policy media_write on media
  for all
  using (
    auth_has_org_role(
      organization_id,
      array['tournament_admin', 'stream_operator', 'team_manager']::app_role[]
    )
  )
  with check (
    auth_has_org_role(
      organization_id,
      array['tournament_admin', 'stream_operator', 'team_manager']::app_role[]
    )
  );

alter publication supabase_realtime add table media;

-- ---------------------------------------------------------------------------
-- Storage: team logos and match media
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('team-logos', 'team-logos', true, 1048576,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('match-media', 'match-media', true, 10485760,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Both buckets are laid out as `<organization-id>/…`, so the policy can ask
-- whether the caller belongs to that organisation.
create policy "Team logos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'team-logos');

create policy "Organisers upload team logos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'team-logos'
    and auth_has_org_role(
      ((storage.foldername(name))[1])::uuid,
      array['tournament_admin', 'team_manager']::app_role[]
    )
  );

create policy "Organisers replace team logos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'team-logos'
    and auth_has_org_role(
      ((storage.foldername(name))[1])::uuid,
      array['tournament_admin', 'team_manager']::app_role[]
    )
  );

create policy "Organisers delete team logos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'team-logos'
    and auth_has_org_role(
      ((storage.foldername(name))[1])::uuid,
      array['tournament_admin', 'team_manager']::app_role[]
    )
  );

create policy "Match media is publicly readable"
  on storage.objects for select
  using (bucket_id = 'match-media');

create policy "Organisers upload match media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'match-media'
    and auth_has_org_role(
      ((storage.foldername(name))[1])::uuid,
      array['tournament_admin', 'stream_operator', 'team_manager']::app_role[]
    )
  );

create policy "Organisers delete match media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'match-media'
    and auth_has_org_role(
      ((storage.foldername(name))[1])::uuid,
      array['tournament_admin', 'stream_operator', 'team_manager']::app_role[]
    )
  );

-- ---------------------------------------------------------------------------
-- Career figures must ignore super overs
-- ---------------------------------------------------------------------------
-- A super over is a tie-break, not an innings. Counting its runs would let a
-- batter's average be decided by three deliveries.

create or replace view player_batting_career
with (security_invoker = on) as
select
  b.player_id,
  p.full_name,
  p.organization_id,
  m.tournament_id,
  count(*)::int as innings,
  count(*) filter (where not b.is_out)::int as not_outs,
  sum(b.runs)::int as runs,
  sum(b.balls)::int as balls,
  sum(b.fours)::int as fours,
  sum(b.sixes)::int as sixes,
  count(*) filter (where b.runs >= 50 and b.runs < 100)::int as fifties,
  count(*) filter (where b.runs >= 100)::int as hundreds,
  max(b.runs)::int as high_score,
  case when count(*) filter (where b.is_out) > 0
    then round(sum(b.runs)::numeric / count(*) filter (where b.is_out), 2)
    else null end as average,
  case when sum(b.balls) > 0
    then round((sum(b.runs)::numeric / sum(b.balls)) * 100, 2)
    else 0 end as strike_rate
from batting_scorecard b
join players p on p.id = b.player_id
join matches m on m.id = b.match_id
join innings i on i.id = b.innings_id
where (b.balls > 0 or b.is_out)
  and not i.is_super_over
group by b.player_id, p.full_name, p.organization_id, m.tournament_id;

create or replace view player_bowling_career
with (security_invoker = on) as
select
  b.player_id,
  p.full_name,
  p.organization_id,
  m.tournament_id,
  count(*)::int as innings,
  sum(b.legal_balls)::int as legal_balls,
  sum(b.runs_conceded)::int as runs_conceded,
  sum(b.wickets)::int as wickets,
  sum(b.maidens)::int as maidens,
  max(b.wickets)::int as best_wickets,
  count(*) filter (where b.wickets >= 4 and b.wickets < 5)::int as four_wicket_hauls,
  count(*) filter (where b.wickets >= 5)::int as five_wicket_hauls,
  case when sum(b.wickets) > 0
    then round(sum(b.runs_conceded)::numeric / sum(b.wickets), 2)
    else null end as average,
  case when sum(b.legal_balls) > 0
    then round(sum(b.runs_conceded)::numeric / (sum(b.legal_balls)::numeric / max(m.balls_per_over)), 2)
    else 0 end as economy,
  case when sum(b.wickets) > 0
    then round(sum(b.legal_balls)::numeric / sum(b.wickets), 1)
    else null end as strike_rate
from bowling_scorecard b
join players p on p.id = b.player_id
join matches m on m.id = b.match_id
join innings i on i.id = b.innings_id
where not i.is_super_over
group by b.player_id, p.full_name, p.organization_id, m.tournament_id;

-- Net run rate must ignore super overs too: one over at 15 an over would
-- distort a whole season's figures.
create or replace view team_match_records
with (security_invoker = on) as
select
  m.id as match_id,
  m.tournament_id,
  own.batting_team_id as team_id,
  own.bowling_team_id as opponent_id,
  case
    when m.result_kind = 'walkover' and m.winner_team_id = own.batting_team_id then 'walkover_win'
    when m.result_kind = 'walkover' then 'walkover_loss'
    when m.result_kind = 'tie' then 'tie'
    when m.result_kind in ('no_result', 'abandoned', 'draw') then 'no_result'
    when m.winner_team_id = own.batting_team_id then 'win'
    else 'loss'
  end as outcome,
  own.runs as runs_scored,
  own.legal_balls as balls_faced,
  (own.wickets >= m.players_per_side - 1) as all_out,
  coalesce(opp.runs, 0) as runs_conceded,
  coalesce(opp.legal_balls, 0) as balls_bowled,
  coalesce(opp.wickets >= m.players_per_side - 1, false) as opponent_all_out,
  m.overs_per_innings as max_overs,
  m.balls_per_over
from matches m
join innings_scores own on own.match_id = m.id
join innings own_i on own_i.id = own.innings_id and not own_i.is_super_over
left join innings_scores opp
  on opp.match_id = m.id and opp.batting_team_id = own.bowling_team_id
left join innings opp_i on opp_i.id = opp.innings_id and not opp_i.is_super_over
where m.status in ('completed', 'walkover', 'abandoned')
  and m.result_kind is not null;
