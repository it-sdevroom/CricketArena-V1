/**
 * Repository layer.
 *
 * Every screen talks to Supabase through these functions rather than building
 * queries inline. That keeps table names and column shapes in one place, and
 * means swapping the backend later touches this file and nothing else.
 *
 * Errors are thrown, not returned. React Query handles them at the call site.
 */

import { supabase } from '@/src/lib/supabase';
import { authRedirectUrl } from '@/src/lib/redirect';
import { generateFixtures, type TournamentFormat } from '@/src/domain/fixtures';

import { enqueueDelivery, newIdempotencyKey } from './queue';
import { rulesFromMatch, toDelivery, toDeliveryInsert } from './mappers';
import type {
  AppRole,
  BattingCardRow,
  BattingCareerRow,
  BowlingCardRow,
  BowlingCareerRow,
  DeliveryRow,
  FollowRow,
  InningsRow,
  MatchRow,
  MatchSummaryRow,
  MediaKind,
  MediaRow,
  MessageRow,
  NotificationRow,
  OrganizationRow,
  PlayerRow,
  PlayingXiRow,
  ProfileRow,
  ResultKind,
  RegistrationRow,
  StandingsRowDb,
  TeamRow,
  TournamentRow,
  VenueRow,
} from './types';
import type { Delivery } from '@/src/domain/types';

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

// ---------------------------------------------------------------------------
// Auth and profile
// ---------------------------------------------------------------------------

export const auth = {
  async signInWithPassword(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signUp(email: string, password: string, fullName: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        // Without this the confirmation link uses Supabase's Site URL, which
        // defaults to http://localhost:3000 and hangs forever on a phone.
        emailRedirectTo: authRedirectUrl('/'),
      },
    });
    if (error) throw error;
    return data;
  },

  /** Phone OTP: step one, send the code. */
  async sendPhoneOtp(phone: string) {
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) throw error;
  },

  /** Phone OTP: step two, exchange the code for a session. */
  async verifyPhoneOtp(phone: string, token: string) {
    const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
    if (error) throw error;
    return data;
  },

  async sendPasswordReset(email: string, redirectTo?: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo ?? authRedirectUrl('/'),
    });
    if (error) throw error;
  },

  /** Re-send the confirmation email, for a link that expired or never arrived. */
  async resendConfirmation(email: string) {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: authRedirectUrl('/') },
    });
    if (error) throw error;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getProfile(userId: string): Promise<ProfileRow | null> {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) throw error;
    return data;
  },

  async updateProfile(userId: string, patch: Partial<ProfileRow>): Promise<ProfileRow> {
    return unwrap(
      await supabase.from('profiles').update(patch).eq('id', userId).select('*').single(),
    );
  },
};

// ---------------------------------------------------------------------------
// Organisations
// ---------------------------------------------------------------------------

export const organizations = {
  async list(): Promise<OrganizationRow[]> {
    return unwrap(await supabase.from('organizations').select('*').order('name'));
  },

  async get(id: string): Promise<OrganizationRow | null> {
    const { data, error } = await supabase.from('organizations').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  },

  async create(input: { name: string; slug: string; city?: string; country?: string }, userId: string) {
    return unwrap(
      await supabase
        .from('organizations')
        .insert({ ...input, created_by: userId })
        .select('*')
        .single(),
    );
  },

  /** Every organisation the signed-in user belongs to, with their role. */
  async mine(userId: string): Promise<(OrganizationRow & { role: AppRole })[]> {
    const { data, error } = await supabase
      .from('organization_members')
      .select('role, organizations(*)')
      .eq('user_id', userId);
    if (error) throw error;

    return (data ?? [])
      .filter((row: any) => row.organizations)
      .map((row: any) => ({ ...row.organizations, role: row.role as AppRole }));
  },

  async roleFor(organizationId: string, userId: string): Promise<AppRole | null> {
    const { data, error } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return (data?.role as AppRole) ?? null;
  },

  /** Everyone in the organisation, with their profile, for assigning duties. */
  async members(organizationId: string): Promise<(ProfileRow & { role: AppRole })[]> {
    const { data, error } = await supabase
      .from('organization_members')
      .select('role, profiles(*)')
      .eq('organization_id', organizationId);
    if (error) throw error;

    return (data ?? [])
      .filter((row: any) => row.profiles)
      .map((row: any) => ({ ...row.profiles, role: row.role as AppRole }))
      .sort((a: any, z: any) => (a.full_name ?? '').localeCompare(z.full_name ?? ''));
  },

  /**
   * Add someone to the committee by the email they signed up with.
   *
   * Looks them up through profiles rather than auth.users, which the client
   * cannot read. That means they must already have an account; inviting a
   * stranger by email would need a server-side invitation flow.
   */
  async addMemberByEmail(organizationId: string, email: string, role: AppRole) {
    const { data: found, error: lookupError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .ilike('handle', email)
      .maybeSingle();

    let userId = found?.id as string | undefined;

    if (!userId) {
      // handle is not always set; fall back to matching the auth email through
      // the RPC, which runs with the definer's rights.
      const { data: viaRpc, error: rpcError } = await supabase.rpc('find_profile_by_email', {
        lookup_email: email,
      });
      if (rpcError) throw rpcError;
      userId = (viaRpc as string | null) ?? undefined;
    }
    if (lookupError) throw lookupError;

    if (!userId) {
      throw new Error(
        `No account found for ${email}. Ask them to sign up in the app first, then add them.`,
      );
    }

    return this.addMember(organizationId, userId, role);
  },

  async removeMember(organizationId: string, userId: string) {
    const { error } = await supabase
      .from('organization_members')
      .delete()
      .eq('organization_id', organizationId)
      .eq('user_id', userId);
    if (error) throw error;
  },

  async addMember(organizationId: string, userId: string, role: AppRole) {
    return unwrap(
      await supabase
        .from('organization_members')
        .upsert({ organization_id: organizationId, user_id: userId, role })
        .select('*')
        .single(),
    );
  },
};

// ---------------------------------------------------------------------------
// Venues, teams, players
// ---------------------------------------------------------------------------

export const venues = {
  async list(organizationId: string): Promise<VenueRow[]> {
    return unwrap(
      await supabase.from('venues').select('*').eq('organization_id', organizationId).order('name'),
    );
  },

  async create(input: Omit<VenueRow, 'id'>) {
    return unwrap(await supabase.from('venues').insert(input).select('*').single());
  },
};

export const teams = {
  async list(organizationId: string): Promise<TeamRow[]> {
    return unwrap(
      await supabase.from('teams').select('*').eq('organization_id', organizationId).order('name'),
    );
  },

  async get(id: string): Promise<TeamRow | null> {
    const { data, error } = await supabase.from('teams').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  },

  async create(input: {
    organization_id: string;
    name: string;
    short_name: string;
    primary_color?: string;
    home_venue_id?: string | null;
    logo_url?: string | null;
  }): Promise<TeamRow> {
    return unwrap(await supabase.from('teams').insert(input).select('*').single());
  },

  async update(id: string, patch: Partial<TeamRow>): Promise<TeamRow> {
    return unwrap(await supabase.from('teams').update(patch).eq('id', id).select('*').single());
  },

  async remove(id: string) {
    const { error } = await supabase.from('teams').delete().eq('id', id);
    if (error) throw error;
  },

  /** The squad, with each player's row joined in. */
  async squad(teamId: string): Promise<(PlayerRow & { is_captain: boolean; is_wicket_keeper: boolean })[]> {
    const { data, error } = await supabase
      .from('team_members')
      .select('is_captain, is_wicket_keeper, players(*)')
      .eq('team_id', teamId);
    if (error) throw error;

    return (data ?? [])
      .filter((row: any) => row.players)
      .map((row: any) => ({
        ...row.players,
        is_captain: row.is_captain,
        is_wicket_keeper: row.is_wicket_keeper,
      }))
      .sort((a: any, z: any) => (a.jersey_number ?? 99) - (z.jersey_number ?? 99));
  },

  async addPlayer(teamId: string, playerId: string, options?: { isCaptain?: boolean; isKeeper?: boolean }) {
    const { error } = await supabase.from('team_members').upsert({
      team_id: teamId,
      player_id: playerId,
      is_captain: options?.isCaptain ?? false,
      is_wicket_keeper: options?.isKeeper ?? false,
    });
    if (error) throw error;
  },

  async removePlayer(teamId: string, playerId: string) {
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('player_id', playerId);
    if (error) throw error;
  },
};

export const players = {
  async list(organizationId: string): Promise<PlayerRow[]> {
    return unwrap(
      await supabase
        .from('players')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('active', true)
        .order('full_name'),
    );
  },

  async get(id: string): Promise<PlayerRow | null> {
    const { data, error } = await supabase.from('players').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  },

  async create(input: {
    organization_id: string;
    full_name: string;
    jersey_number?: number | null;
    role?: string;
    batting_style?: string;
    bowling_style?: string;
  }): Promise<PlayerRow> {
    return unwrap(await supabase.from('players').insert(input).select('*').single());
  },

  async update(id: string, patch: Partial<PlayerRow>): Promise<PlayerRow> {
    return unwrap(await supabase.from('players').update(patch).eq('id', id).select('*').single());
  },
};

// ---------------------------------------------------------------------------
// Tournaments
// ---------------------------------------------------------------------------

export const tournaments = {
  async list(organizationId?: string): Promise<TournamentRow[]> {
    let query = supabase.from('tournaments').select('*').order('start_date', { ascending: false });
    if (organizationId) query = query.eq('organization_id', organizationId);
    return unwrap(await query);
  },

  async listPublic(): Promise<TournamentRow[]> {
    return unwrap(
      await supabase
        .from('tournaments')
        .select('*')
        .eq('is_public', true)
        .in('status', ['registration', 'active', 'completed'])
        .order('start_date', { ascending: false }),
    );
  },

  async get(id: string): Promise<TournamentRow | null> {
    const { data, error } = await supabase.from('tournaments').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  },

  async create(
    input: Partial<TournamentRow> & { organization_id: string; name: string; slug: string },
  ): Promise<TournamentRow> {
    return unwrap(await supabase.from('tournaments').insert(input).select('*').single());
  },

  async update(id: string, patch: Partial<TournamentRow>): Promise<TournamentRow> {
    return unwrap(await supabase.from('tournaments').update(patch).eq('id', id).select('*').single());
  },

  async entrants(tournamentId: string): Promise<(TeamRow & { group_label: string | null; seed: number | null })[]> {
    const { data, error } = await supabase
      .from('tournament_teams')
      .select('group_label, seed, teams(*)')
      .eq('tournament_id', tournamentId);
    if (error) throw error;

    return (data ?? [])
      .filter((row: any) => row.teams)
      .map((row: any) => ({ ...row.teams, group_label: row.group_label, seed: row.seed }))
      .sort((a: any, z: any) => (a.seed ?? 99) - (z.seed ?? 99));
  },

  async addTeam(tournamentId: string, teamId: string, seed?: number) {
    const { error } = await supabase
      .from('tournament_teams')
      .upsert({ tournament_id: tournamentId, team_id: teamId, seed: seed ?? null });
    if (error) throw error;
  },

  async removeTeam(tournamentId: string, teamId: string) {
    const { error } = await supabase
      .from('tournament_teams')
      .delete()
      .eq('tournament_id', tournamentId)
      .eq('team_id', teamId);
    if (error) throw error;
  },

  async standings(tournamentId: string): Promise<StandingsRowDb[]> {
    const { data, error } = await supabase
      .from('tournament_standings')
      .select('*')
      .eq('tournament_id', tournamentId);
    if (error) throw error;

    // The view cannot express the head-to-head tie-break, so the final ordering
    // is applied here where the full record set is available.
    return (data ?? []).sort(
      (a, z) => z.points - a.points || z.net_run_rate - a.net_run_rate || z.won - a.won,
    );
  },

  /**
   * Build and persist the fixture list for a tournament.
   * Refuses to run if fixtures already exist, so it cannot silently duplicate
   * a schedule that officials have already been assigned to.
   */
  async generateSchedule(
    tournament: TournamentRow,
    options: { startDate?: Date; daysBetweenRounds?: number } = {},
  ): Promise<number> {
    const existing = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournament.id);
    if ((existing.count ?? 0) > 0) {
      throw new Error('This tournament already has fixtures. Delete them before regenerating.');
    }

    const entrants = await tournaments.entrants(tournament.id);
    if (entrants.length < 2) throw new Error('Add at least two teams before generating fixtures.');

    const generated = generateFixtures({
      format: tournament.format as TournamentFormat,
      teamIds: entrants.map((t) => t.id),
      groupCount: tournament.group_count,
    });

    const start = options.startDate ?? new Date(tournament.start_date ?? Date.now());
    const gap = options.daysBetweenRounds ?? 7;

    const rows = generated.map((f) => {
      const when = new Date(start);
      when.setDate(when.getDate() + (f.round - 1) * gap);
      when.setHours(16, 0, 0, 0);

      return {
        tournament_id: tournament.id,
        organization_id: tournament.organization_id,
        home_team_id: f.homeTeamId,
        away_team_id: f.awayTeamId,
        status: 'scheduled' as const,
        stage: f.stage,
        round: f.round,
        match_order: f.order,
        label: f.label,
        group_label: f.group,
        scheduled_at: when.toISOString(),
        overs_per_innings: tournament.overs_per_innings,
        balls_per_over: tournament.balls_per_over,
        wide_runs: tournament.wide_runs,
        no_ball_runs: tournament.no_ball_runs,
        free_hit_after_no_ball: tournament.free_hit_after_no_ball,
        players_per_side: tournament.players_per_side,
        max_overs_per_bowler: tournament.max_overs_per_bowler,
      };
    });

    const { error } = await supabase.from('matches').insert(rows);
    if (error) throw error;
    return rows.length;
  },

  async deleteSchedule(tournamentId: string) {
    const { error } = await supabase.from('matches').delete().eq('tournament_id', tournamentId);
    if (error) throw error;
  },
};

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

export const matches = {
  async summaries(filter: {
    tournamentId?: string;
    organizationId?: string;
    status?: string[];
    limit?: number;
  }): Promise<MatchSummaryRow[]> {
    let query = supabase.from('match_summaries').select('*');
    if (filter.tournamentId) query = query.eq('tournament_id', filter.tournamentId);
    if (filter.organizationId) query = query.eq('organization_id', filter.organizationId);
    if (filter.status?.length) query = query.in('status', filter.status);
    query = query.order('scheduled_at', { ascending: true });
    if (filter.limit) query = query.limit(filter.limit);
    return unwrap(await query);
  },

  async live(limit = 10): Promise<MatchSummaryRow[]> {
    return unwrap(
      await supabase
        .from('match_summaries')
        .select('*')
        .in('status', ['live', 'innings_break', 'toss'])
        .order('scheduled_at', { ascending: true })
        .limit(limit),
    );
  },

  async upcoming(limit = 10): Promise<MatchSummaryRow[]> {
    return unwrap(
      await supabase
        .from('match_summaries')
        .select('*')
        .eq('status', 'scheduled')
        .gte('scheduled_at', new Date(Date.now() - 86_400_000).toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(limit),
    );
  },

  async recent(limit = 10): Promise<MatchSummaryRow[]> {
    return unwrap(
      await supabase
        .from('match_summaries')
        .select('*')
        .eq('status', 'completed')
        .order('scheduled_at', { ascending: false })
        .limit(limit),
    );
  },

  async get(id: string): Promise<MatchRow | null> {
    const { data, error } = await supabase.from('matches').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  },

  async summary(id: string): Promise<MatchSummaryRow | null> {
    const { data, error } = await supabase
      .from('match_summaries')
      .select('*')
      .eq('match_id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async create(input: Partial<MatchRow> & { organization_id: string }): Promise<MatchRow> {
    return unwrap(await supabase.from('matches').insert(input).select('*').single());
  },

  async update(id: string, patch: Partial<MatchRow>): Promise<MatchRow> {
    return unwrap(await supabase.from('matches').update(patch).eq('id', id).select('*').single());
  },

  async recordToss(id: string, winnerTeamId: string, decision: 'bat' | 'bowl') {
    return matches.update(id, {
      toss_winner_team_id: winnerTeamId,
      toss_decision: decision,
      status: 'toss',
    });
  },

  async assignOfficial(matchId: string, userId: string, role: 'scorer' | 'umpire' | 'stream_operator') {
    const { error } = await supabase
      .from('match_officials')
      .upsert({ match_id: matchId, user_id: userId, role });
    if (error) throw error;
  },

  async officials(matchId: string) {
    const { data, error } = await supabase
      .from('match_officials')
      .select('role, profiles(id, full_name, avatar_url)')
      .eq('match_id', matchId);
    if (error) throw error;
    return data ?? [];
  },

  // --- playing XI ---------------------------------------------------------

  async playingXi(matchId: string): Promise<(PlayingXiRow & { player: PlayerRow })[]> {
    const { data, error } = await supabase
      .from('playing_xi')
      .select('*, players(*)')
      .eq('match_id', matchId);
    if (error) throw error;

    return (data ?? [])
      .filter((row: any) => row.players)
      .map((row: any) => ({ ...row, player: row.players }))
      .sort((a: any, z: any) => (a.batting_order ?? 99) - (z.batting_order ?? 99));
  },

  async setPlayingXi(
    matchId: string,
    teamId: string,
    entries: { playerId: string; battingOrder: number; isCaptain?: boolean; isKeeper?: boolean }[],
  ) {
    // Replace the side wholesale so removing a player actually removes them.
    const { error: clearError } = await supabase
      .from('playing_xi')
      .delete()
      .eq('match_id', matchId)
      .eq('team_id', teamId);
    if (clearError) throw clearError;

    if (entries.length === 0) return;

    const { error } = await supabase.from('playing_xi').insert(
      entries.map((e) => ({
        match_id: matchId,
        team_id: teamId,
        player_id: e.playerId,
        batting_order: e.battingOrder,
        is_captain: e.isCaptain ?? false,
        is_wicket_keeper: e.isKeeper ?? false,
      })),
    );
    if (error) throw error;
  },
};

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export const scoring = {
  async innings(matchId: string): Promise<InningsRow[]> {
    return unwrap(
      await supabase.from('innings').select('*').eq('match_id', matchId).order('innings_number'),
    );
  },

  async startInnings(input: {
    matchId: string;
    inningsNumber: number;
    battingTeamId: string;
    bowlingTeamId: string;
    target?: number | null;
    isSuperOver?: boolean;
    superOverNumber?: number | null;
  }): Promise<InningsRow> {
    return unwrap(
      await supabase
        .from('innings')
        .insert({
          match_id: input.matchId,
          innings_number: input.inningsNumber,
          batting_team_id: input.battingTeamId,
          bowling_team_id: input.bowlingTeamId,
          target: input.target ?? null,
          is_super_over: input.isSuperOver ?? false,
          super_over_number: input.isSuperOver ? (input.superOverNumber ?? 1) : null,
        })
        .select('*')
        .single(),
    );
  },

  /**
   * Record the outcome of a finished match.
   *
   * Setting `status` alone is not enough: `tournament_standings` only counts a
   * match once `result_kind` is set, so a match marked complete without one
   * silently never reaches the points table.
   */
  async finishMatch(input: {
    matchId: string;
    kind: ResultKind;
    winnerTeamId?: string | null;
    summary: string;
    marginRuns?: number | null;
    marginWickets?: number | null;
    decidedBySuperOver?: boolean;
    playerOfMatchId?: string | null;
  }): Promise<MatchRow> {
    return unwrap(
      await supabase
        .from('matches')
        .update({
          status: input.kind === 'abandoned' ? 'abandoned' : 'completed',
          result_kind: input.kind,
          winner_team_id: input.winnerTeamId ?? null,
          result_summary: input.summary,
          result_margin_runs: input.marginRuns ?? null,
          result_margin_wickets: input.marginWickets ?? null,
          decided_by_super_over: input.decidedBySuperOver ?? false,
          player_of_match_id: input.playerOfMatchId ?? null,
        })
        .eq('id', input.matchId)
        .select('*')
        .single(),
    );
  },

  /** Abandon a match without a result, e.g. rain. Both sides take a point. */
  async abandonMatch(matchId: string, reason: string): Promise<MatchRow> {
    return unwrap(
      await supabase
        .from('matches')
        .update({
          status: 'abandoned',
          result_kind: 'no_result',
          winner_team_id: null,
          result_summary: reason,
        })
        .eq('id', matchId)
        .select('*')
        .single(),
    );
  },

  async closeInnings(inningsId: string, reason: string) {
    return unwrap(
      await supabase
        .from('innings')
        .update({ closed: true, end_reason: reason, closed_at: new Date().toISOString() })
        .eq('id', inningsId)
        .select('*')
        .single(),
    );
  },

  async deliveries(inningsId: string): Promise<DeliveryRow[]> {
    return unwrap(
      await supabase.from('deliveries').select('*').eq('innings_id', inningsId).order('sequence'),
    );
  },

  /** Deliveries already mapped into the domain shape, ready for the reducer. */
  async domainDeliveries(inningsId: string, match: MatchRow): Promise<Delivery[]> {
    const rows = await scoring.deliveries(inningsId);
    const rules = rulesFromMatch(match);
    return rows.map((row) => toDelivery(row, rules));
  },

  /**
   * Record a ball. Goes through the offline queue so a lost signal never costs
   * the scorer a delivery.
   */
  async recordDelivery(delivery: Omit<Delivery, 'id' | 'sequence'>, inningsId: string, match: MatchRow) {
    const rules = rulesFromMatch(match);
    const withKey: Delivery = {
      ...delivery,
      id: '',
      sequence: 0,
      idempotencyKey: delivery.idempotencyKey ?? newIdempotencyKey(),
    };
    const payload = toDeliveryInsert(withKey, inningsId, match.id, rules);
    await enqueueDelivery(payload);
    return withKey;
  },

  /** Remove the most recent ball of an innings and log the correction. */
  async undoLastDelivery(inningsId: string, matchId: string, userId: string) {
    const { data, error } = await supabase
      .from('deliveries')
      .select('*')
      .eq('innings_id', inningsId)
      .order('sequence', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const { error: logError } = await supabase.from('score_corrections').insert({
      match_id: matchId,
      delivery_id: data.id,
      action: 'delete',
      before_state: data,
      reason: 'Undo last ball',
      performed_by: userId,
    });
    if (logError) throw logError;

    const { error: deleteError } = await supabase.from('deliveries').delete().eq('id', data.id);
    if (deleteError) throw deleteError;
    return data as DeliveryRow;
  },

  /**
   * Remove a delivery recorded by mistake, and log why.
   *
   * The innings is re-derived from what remains, so removing a ball from three
   * overs ago is safe: nothing downstream is stored, it is all folded from the
   * delivery list.
   */
  async deleteDelivery(
    deliveryId: string,
    context: { matchId: string; userId: string; reason: string },
  ) {
    const { data: before, error: readError } = await supabase
      .from('deliveries')
      .select('*')
      .eq('id', deliveryId)
      .single();
    if (readError) throw readError;

    const { error: removeError } = await supabase.from('deliveries').delete().eq('id', deliveryId);
    if (removeError) throw removeError;

    const { error } = await supabase.from('score_corrections').insert({
      match_id: context.matchId,
      delivery_id: deliveryId,
      action: 'delete',
      before_state: before,
      after_state: null,
      reason: context.reason,
      performed_by: context.userId,
    });
    if (error) throw error;
  },

  async correctDelivery(
    deliveryId: string,
    patch: Partial<DeliveryRow>,
    context: { matchId: string; userId: string; reason: string },
  ) {
    const { data: before, error: readError } = await supabase
      .from('deliveries')
      .select('*')
      .eq('id', deliveryId)
      .single();
    if (readError) throw readError;

    const after = unwrap(
      await supabase.from('deliveries').update(patch).eq('id', deliveryId).select('*').single(),
    );

    const { error } = await supabase.from('score_corrections').insert({
      match_id: context.matchId,
      delivery_id: deliveryId,
      action: 'edit',
      before_state: before,
      after_state: after,
      reason: context.reason,
      performed_by: context.userId,
    });
    if (error) throw error;
    return after;
  },

  async battingCard(inningsId: string): Promise<BattingCardRow[]> {
    return unwrap(
      await supabase
        .from('batting_scorecard')
        .select('*')
        .eq('innings_id', inningsId)
        .order('batting_position'),
    );
  },

  async bowlingCard(inningsId: string): Promise<BowlingCardRow[]> {
    return unwrap(
      await supabase
        .from('bowling_scorecard')
        .select('*')
        .eq('innings_id', inningsId)
        .order('wickets', { ascending: false }),
    );
  },
};

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export const stats = {
  async battingLeaders(filter: { tournamentId?: string; organizationId?: string; limit?: number }) {
    let query = supabase.from('player_batting_career').select('*');
    if (filter.tournamentId) query = query.eq('tournament_id', filter.tournamentId);
    if (filter.organizationId) query = query.eq('organization_id', filter.organizationId);
    return unwrap(
      await query.order('runs', { ascending: false }).limit(filter.limit ?? 25),
    ) as BattingCareerRow[];
  },

  async bowlingLeaders(filter: { tournamentId?: string; organizationId?: string; limit?: number }) {
    let query = supabase.from('player_bowling_career').select('*');
    if (filter.tournamentId) query = query.eq('tournament_id', filter.tournamentId);
    if (filter.organizationId) query = query.eq('organization_id', filter.organizationId);
    return unwrap(
      await query.order('wickets', { ascending: false }).limit(filter.limit ?? 25),
    ) as BowlingCareerRow[];
  },

  async playerBatting(playerId: string): Promise<BattingCareerRow[]> {
    return unwrap(await supabase.from('player_batting_career').select('*').eq('player_id', playerId));
  },

  async playerBowling(playerId: string): Promise<BowlingCareerRow[]> {
    return unwrap(await supabase.from('player_bowling_career').select('*').eq('player_id', playerId));
  },
};

// ---------------------------------------------------------------------------
// Chat and notifications
// ---------------------------------------------------------------------------

export const chat = {
  async channelForTournament(tournamentId: string) {
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('tournament_id', tournamentId)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async messages(channelId: string, limit = 60): Promise<(MessageRow & { author: ProfileRow | null })[]> {
    const { data, error } = await supabase
      .from('messages')
      .select('*, profiles(*)')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    return (data ?? [])
      .map((row: any) => ({ ...row, author: row.profiles ?? null }))
      .reverse();
  },

  async send(channelId: string, authorId: string, body: string) {
    return unwrap(
      await supabase
        .from('messages')
        .insert({ channel_id: channelId, author_id: authorId, body })
        .select('*')
        .single(),
    );
  },
};

// ---------------------------------------------------------------------------
// Player self-registration
// ---------------------------------------------------------------------------

export const registrations = {
  /** Apply to join a squad. Creates nothing on the real roster until approved. */
  async apply(input: {
    organizationId: string;
    teamId: string;
    tournamentId?: string | null;
    userId: string;
    fullName: string;
    displayName?: string | null;
    jerseyNumber?: number | null;
    dateOfBirth?: string | null;
    phone?: string | null;
    photoUrl?: string | null;
    role: string;
    battingStyle: string;
    bowlingStyle: string;
    note?: string | null;
  }): Promise<RegistrationRow> {
    return unwrap(
      await supabase
        .from('player_registrations')
        .insert({
          organization_id: input.organizationId,
          team_id: input.teamId,
          tournament_id: input.tournamentId ?? null,
          user_id: input.userId,
          full_name: input.fullName,
          display_name: input.displayName ?? null,
          jersey_number: input.jerseyNumber ?? null,
          date_of_birth: input.dateOfBirth ?? null,
          phone: input.phone ?? null,
          photo_url: input.photoUrl ?? null,
          role: input.role,
          batting_style: input.battingStyle,
          bowling_style: input.bowlingStyle,
          note: input.note ?? null,
        })
        .select('*')
        .single(),
    );
  },

  /** Applications this user has sent, newest first. */
  async mine(userId: string): Promise<(RegistrationRow & { team: TeamRow | null })[]> {
    const { data, error } = await supabase
      .from('player_registrations')
      .select('*, teams(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row: any) => ({ ...row, team: row.teams ?? null }));
  },

  /** The organiser's queue. */
  async pending(organizationId: string): Promise<(RegistrationRow & { team: TeamRow | null })[]> {
    const { data, error } = await supabase
      .from('player_registrations')
      .select('*, teams(*)')
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row: any) => ({ ...row, team: row.teams ?? null }));
  },

  async reviewed(organizationId: string, limit = 30) {
    const { data, error } = await supabase
      .from('player_registrations')
      .select('*, teams(*)')
      .eq('organization_id', organizationId)
      .in('status', ['approved', 'rejected'])
      .order('reviewed_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((row: any) => ({ ...row, team: row.teams ?? null }));
  },

  /**
   * Approve an application. This is a database function rather than a series of
   * writes so creating the player, adding them to the squad and marking the
   * application either all happen or none do.
   */
  async approve(registrationId: string, note?: string): Promise<PlayerRow> {
    const { data, error } = await supabase.rpc('approve_registration', {
      registration: registrationId,
      note: note ?? null,
    });
    if (error) throw error;
    return data as PlayerRow;
  },

  async reject(registrationId: string, note?: string): Promise<void> {
    const { error } = await supabase.rpc('reject_registration', {
      registration: registrationId,
      note: note ?? null,
    });
    if (error) throw error;
  },

  async withdraw(registrationId: string): Promise<void> {
    const { error } = await supabase
      .from('player_registrations')
      .update({ status: 'withdrawn' })
      .eq('id', registrationId);
    if (error) throw error;
  },

  /** How many are waiting, for the badge on the organiser console. */
  async pendingCount(organizationId: string): Promise<number> {
    const { count, error } = await supabase
      .from('player_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'pending');
    if (error) throw error;
    return count ?? 0;
  },
};

// ---------------------------------------------------------------------------
// Following (the fan experience)
// ---------------------------------------------------------------------------

type FollowTarget = { teamId?: string; tournamentId?: string; playerId?: string };

export const follows = {
  async list(userId: string): Promise<FollowRow[]> {
    return unwrap(await supabase.from('follows').select('*').eq('user_id', userId));
  },

  /** Followed teams with their full rows, for the dashboard. */
  async teams(userId: string): Promise<TeamRow[]> {
    const { data, error } = await supabase
      .from('follows')
      .select('teams(*)')
      .eq('user_id', userId)
      .not('team_id', 'is', null);
    if (error) throw error;
    return (data ?? []).map((row: any) => row.teams).filter(Boolean);
  },

  async tournaments(userId: string): Promise<TournamentRow[]> {
    const { data, error } = await supabase
      .from('follows')
      .select('tournaments(*)')
      .eq('user_id', userId)
      .not('tournament_id', 'is', null);
    if (error) throw error;
    return (data ?? []).map((row: any) => row.tournaments).filter(Boolean);
  },

  async players(userId: string): Promise<PlayerRow[]> {
    const { data, error } = await supabase
      .from('follows')
      .select('players(*)')
      .eq('user_id', userId)
      .not('player_id', 'is', null);
    if (error) throw error;
    return (data ?? []).map((row: any) => row.players).filter(Boolean);
  },

  async add(userId: string, target: FollowTarget): Promise<void> {
    const { error } = await supabase.from('follows').insert({
      user_id: userId,
      team_id: target.teamId ?? null,
      tournament_id: target.tournamentId ?? null,
      player_id: target.playerId ?? null,
    });
    if (error) throw error;
  },

  async remove(userId: string, target: FollowTarget): Promise<void> {
    let query = supabase.from('follows').delete().eq('user_id', userId);
    if (target.teamId) query = query.eq('team_id', target.teamId);
    if (target.tournamentId) query = query.eq('tournament_id', target.tournamentId);
    if (target.playerId) query = query.eq('player_id', target.playerId);
    const { error } = await query;
    if (error) throw error;
  },

  /** Fixtures and results involving any team the user follows. */
  async feed(userId: string, limit = 20): Promise<MatchSummaryRow[]> {
    const followedTeams = await follows.teams(userId);
    if (!followedTeams.length) return [];

    const ids = followedTeams.map((t) => t.id);
    const { data, error } = await supabase
      .from('match_summaries')
      .select('*')
      .or(`home_team_id.in.(${ids.join(',')}),away_team_id.in.(${ids.join(',')})`)
      .order('scheduled_at', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },
};

export const notifications = {
  async list(userId: string, limit = 40): Promise<NotificationRow[]> {
    return unwrap(
      await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit),
    );
  },

  async markRead(id: string) {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async markAllRead(userId: string) {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null);
    if (error) throw error;
  },
};

// ---------------------------------------------------------------------------
// Highlights, photographs and streams
// ---------------------------------------------------------------------------

export const media = {
  /** Everything attached to one match, newest first. */
  async forMatch(matchId: string): Promise<MediaRow[]> {
    return unwrap(
      await supabase
        .from('media')
        .select('*')
        .eq('match_id', matchId)
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false }),
    );
  },

  /** Everything across a competition, for the highlights reel. */
  async forTournament(tournamentId: string, limit = 50): Promise<MediaRow[]> {
    return unwrap(
      await supabase
        .from('media')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: false })
        .limit(limit),
    );
  },

  async create(input: {
    organization_id: string;
    match_id?: string | null;
    tournament_id?: string | null;
    kind: MediaKind;
    title: string;
    url: string;
    description?: string | null;
    thumbnail_url?: string | null;
    over_number?: number | null;
  }, userId: string): Promise<MediaRow> {
    return unwrap(
      await supabase
        .from('media')
        .insert({ ...input, created_by: userId })
        .select('*')
        .single(),
    );
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('media').delete().eq('id', id);
    if (error) throw error;
  },
};

// ---------------------------------------------------------------------------
// Rain, reduced overs and revised targets
// ---------------------------------------------------------------------------

export const interruptions = {
  async forMatch(matchId: string) {
    return unwrap(
      await supabase
        .from('match_interruptions')
        .select('*')
        .eq('match_id', matchId)
        .order('created_at', { ascending: false }),
    );
  },

  /**
   * Cut an innings short and set a revised target.
   *
   * Both the new numbers and the reason are written together: an unexplained
   * revised target is how disputes start, so the audit row is not optional.
   */
  async applyRevision(input: {
    matchId: string;
    inningsId: string;
    kind: string;
    oversAfter: number | null;
    targetAfter: number | null;
    oversBefore: number | null;
    targetBefore: number | null;
    runsAtStop: number;
    wicketsAtStop: number;
    ballsAtStop: number;
    note?: string | null;
    method?: 'manual' | 'dls' | 'vjd' | 'none';
    userId: string;
  }) {
    const { error: inningsError } = await supabase
      .from('innings')
      .update({
        reduced_overs: input.oversAfter,
        revised_target: input.targetAfter,
        target: input.targetAfter ?? undefined,
      })
      .eq('id', input.inningsId);
    if (inningsError) throw inningsError;

    return unwrap(
      await supabase
        .from('match_interruptions')
        .insert({
          match_id: input.matchId,
          innings_id: input.inningsId,
          kind: input.kind,
          runs_at_stop: input.runsAtStop,
          wickets_at_stop: input.wicketsAtStop,
          balls_at_stop: input.ballsAtStop,
          overs_before: input.oversBefore,
          overs_after: input.oversAfter,
          target_before: input.targetBefore,
          target_after: input.targetAfter,
          note: input.note ?? null,
          method: input.method ?? 'manual',
          decided_by: input.userId,
        })
        .select('*')
        .single(),
    );
  },
};

// ---------------------------------------------------------------------------
// Push notifications
// ---------------------------------------------------------------------------

export const push = {
  /** Store this device's Expo token so the server can reach it. */
  async registerToken(token: string, platform?: string) {
    const { error } = await supabase.rpc('register_push_token', {
      token,
      device_platform: platform ?? null,
    });
    if (error) throw error;
  },

  async removeToken(token: string) {
    const { error } = await supabase.from('device_sessions').delete().eq('expo_push_token', token);
    if (error) throw error;
  },

  async getPreferences(userId: string) {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async savePreferences(userId: string, patch: Record<string, unknown>) {
    return unwrap(
      await supabase
        .from('notification_preferences')
        .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() })
        .select('*')
        .single(),
    );
  },
};

// ---------------------------------------------------------------------------
// Squad management
// ---------------------------------------------------------------------------

export const squads = {
  /** Everyone in a team, retired players excluded. */
  async forTeam(teamId: string) {
    return unwrap(
      await supabase
        .from('active_squad')
        .select('*')
        .eq('team_id', teamId)
        .order('jersey_number', { nullsFirst: false }),
    );
  },

  /** Players in this organisation who are not yet in the given team. */
  async availableFor(organizationId: string, teamId: string) {
    const [all, inTeam] = await Promise.all([
      supabase.from('players').select('*').eq('organization_id', organizationId).eq('active', true),
      supabase.from('team_members').select('player_id').eq('team_id', teamId),
    ]);
    if (all.error) throw all.error;
    if (inTeam.error) throw inTeam.error;

    const taken = new Set((inTeam.data ?? []).map((r: any) => r.player_id));
    return (all.data ?? []).filter((p: any) => !taken.has(p.id));
  },

  async add(teamId: string, playerId: string) {
    const { error } = await supabase
      .from('team_members')
      .upsert({ team_id: teamId, player_id: playerId });
    if (error) throw error;
  },

  async remove(teamId: string, playerId: string) {
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('player_id', playerId);
    if (error) throw error;
  },

  /**
   * Set the captain. A partial unique index allows only one per team, so the
   * previous captain has to stand down in the same breath.
   */
  async setCaptain(teamId: string, playerId: string) {
    const { error: clear } = await supabase
      .from('team_members')
      .update({ is_captain: false })
      .eq('team_id', teamId)
      .eq('is_captain', true);
    if (clear) throw clear;

    const { error } = await supabase
      .from('team_members')
      .update({ is_captain: true })
      .eq('team_id', teamId)
      .eq('player_id', playerId);
    if (error) throw error;
  },

  async setRole(
    teamId: string,
    playerId: string,
    patch: { is_vice_captain?: boolean; is_wicket_keeper?: boolean },
  ) {
    const { error } = await supabase
      .from('team_members')
      .update(patch)
      .eq('team_id', teamId)
      .eq('player_id', playerId);
    if (error) throw error;
  },

  /** Delete if they never played, retire if they did. Returns which happened. */
  async removePlayer(playerId: string): Promise<'deleted' | 'retired'> {
    const { data, error } = await supabase.rpc('remove_player', { player: playerId });
    if (error) throw error;
    return data as 'deleted' | 'retired';
  },

  /** Only possible while the team has never taken the field. */
  async removeTeam(teamId: string): Promise<void> {
    const { error } = await supabase.rpc('remove_team', { team: teamId });
    if (error) throw error;
  },
};

// ---------------------------------------------------------------------------
// The correction log
// ---------------------------------------------------------------------------

export const corrections = {
  /**
   * Every change made to this match's scoring, newest first.
   *
   * Readable by anyone who can read the match — which is the point. A scorer
   * fixing a mistake should be visible to both teams and to anyone following,
   * because a silently altered score is indistinguishable from a dishonest one.
   */
  async forMatch(matchId: string) {
    return unwrap(
      await supabase
        .from('score_corrections')
        .select('*, profiles:performed_by(full_name)')
        .eq('match_id', matchId)
        .order('created_at', { ascending: false }),
    );
  },

  /** How many corrections a match has had, for a badge. */
  async countForMatch(matchId: string): Promise<number> {
    const { count, error } = await supabase
      .from('score_corrections')
      .select('id', { count: 'exact', head: true })
      .eq('match_id', matchId);
    if (error) throw error;
    return count ?? 0;
  },
};
