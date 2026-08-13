/**
 * Live match state.
 *
 * Combines three sources into the single `InningsState` the scoring console and
 * the match centre render from:
 *
 *   1. balls already stored in Supabase,
 *   2. balls sitting in the offline queue that have not synced yet,
 *   3. realtime inserts arriving from whoever else is watching or scoring.
 *
 * A locally queued ball is dropped from the optimistic list as soon as the same
 * idempotency key comes back from the server, so a ball never appears twice.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { rulesFromMatch, toDelivery } from '@/src/data/mappers';
import { subscribeToQueue, type QueuedDelivery } from '@/src/data/queue';
import { matches, scoring } from '@/src/data/repo';
import type { DeliveryRow, InningsRow, MatchRow, PlayerRow, PlayingXiRow } from '@/src/data/types';
import { buildInnings } from '@/src/domain/scoring';
import type { Delivery, InningsState, MatchRules } from '@/src/domain/types';
import { supabase } from '@/src/lib/supabase';

export interface LiveMatch {
  loading: boolean;
  error: unknown;
  match: MatchRow | null;
  rules: MatchRules | null;
  innings: InningsRow[];
  /** The innings currently being played, or the last one if the match is over. */
  currentInnings: InningsRow | null;
  /** Derived state of every innings, in order. */
  states: InningsState[];
  currentState: InningsState | null;
  squads: (PlayingXiRow & { player: PlayerRow })[];
  /** Balls recorded on this device that have not reached the server yet. */
  pendingCount: number;
  refetch: () => void;
}

function queuedToDelivery(item: QueuedDelivery, rules: MatchRules, index: number): Delivery {
  const p = item.payload;
  return {
    id: `pending-${p.idempotency_key}`,
    sequence: 1_000_000 + index,
    strikerId: p.striker_id,
    nonStrikerId: p.non_striker_id,
    bowlerId: p.bowler_id,
    runsOffBat: p.runs_off_bat,
    wide: p.wide_runs != null ? Math.max(0, p.wide_runs - rules.wideRuns) : null,
    noBall: p.no_ball_runs != null,
    byes: p.byes,
    legByes: p.leg_byes,
    penaltyRuns: p.penalty_runs,
    wicket: p.wicket_kind
      ? {
          kind: p.wicket_kind as Delivery['wicket'] extends null ? never : any,
          playerOutId: p.player_out_id as string,
          fielderId: p.fielder_id,
        }
      : null,
    freeHit: p.free_hit,
    idempotencyKey: p.idempotency_key,
  };
}

export function useLiveMatch(matchId: string | undefined): LiveMatch {
  const queryClient = useQueryClient();
  const [queued, setQueued] = useState<QueuedDelivery[]>([]);

  useEffect(() => subscribeToQueue(setQueued), []);

  const matchQuery = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => matches.get(matchId as string),
    enabled: !!matchId,
  });

  const xiQuery = useQuery({
    queryKey: ['match-xi', matchId],
    queryFn: () => matches.playingXi(matchId as string),
    enabled: !!matchId,
  });

  const inningsQuery = useQuery({
    queryKey: ['match-innings', matchId],
    queryFn: () => scoring.innings(matchId as string),
    enabled: !!matchId,
  });

  const inningsIds = (inningsQuery.data ?? []).map((i) => i.id);

  const deliveriesQuery = useQuery({
    queryKey: ['match-deliveries', matchId, inningsIds.join(',')],
    queryFn: async () => {
      const rows = await Promise.all(inningsIds.map((id) => scoring.deliveries(id)));
      const byInnings: Record<string, DeliveryRow[]> = {};
      inningsIds.forEach((id, index) => {
        byInnings[id] = rows[index];
      });
      return byInnings;
    },
    enabled: inningsIds.length > 0,
  });

  // --- realtime -----------------------------------------------------------
  useEffect(() => {
    if (!matchId) return;

    const channel = supabase
      .channel(`match:${matchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deliveries', filter: `match_id=eq.${matchId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['match-deliveries', matchId] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'innings', filter: `match_id=eq.${matchId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['match-innings', matchId] });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['match', matchId] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [matchId, queryClient]);

  const match = matchQuery.data ?? null;
  const rules = match ? rulesFromMatch(match) : null;
  const inningsList = useMemo(() => inningsQuery.data ?? [], [inningsQuery.data]);

  const pendingForMatch = useMemo(
    () => queued.filter((item) => item.payload.match_id === matchId),
    [queued, matchId],
  );

  const states = useMemo<InningsState[]>(() => {
    if (!match || !rules) return [];
    const byInnings = deliveriesQuery.data ?? {};

    return inningsList.map((innings) => {
      const serverRows = byInnings[innings.id] ?? [];
      const serverKeys = new Set(serverRows.map((row) => row.idempotency_key));
      const serverDeliveries = serverRows.map((row) => toDelivery(row, rules));

      // Only keep queued balls the server has not confirmed yet.
      const optimistic = pendingForMatch
        .filter((item) => item.payload.innings_id === innings.id)
        .filter((item) => !serverKeys.has(item.payload.idempotency_key))
        .map((item, index) => queuedToDelivery(item, rules, index));

      return buildInnings([...serverDeliveries, ...optimistic], {
        battingTeamId: innings.batting_team_id,
        bowlingTeamId: innings.bowling_team_id,
        rules,
        target: innings.target,
        reducedOvers: innings.reduced_overs,
        forcedEnd: innings.closed ? (innings.end_reason as any) ?? 'declared' : null,
      });
    });
  }, [match, rules, inningsList, deliveriesQuery.data, pendingForMatch]);

  const currentIndex = useMemo(() => {
    const open = inningsList.findIndex((i) => !i.closed);
    return open >= 0 ? open : inningsList.length - 1;
  }, [inningsList]);

  const refetch = useCallback(() => {
    void matchQuery.refetch();
    void inningsQuery.refetch();
    void deliveriesQuery.refetch();
    void xiQuery.refetch();
  }, [matchQuery, inningsQuery, deliveriesQuery, xiQuery]);

  return {
    loading: matchQuery.isLoading || inningsQuery.isLoading,
    error: matchQuery.error ?? inningsQuery.error ?? deliveriesQuery.error,
    match,
    rules,
    innings: inningsList,
    currentInnings: currentIndex >= 0 ? inningsList[currentIndex] ?? null : null,
    states,
    currentState: currentIndex >= 0 ? states[currentIndex] ?? null : null,
    squads: xiQuery.data ?? [],
    pendingCount: pendingForMatch.length,
    refetch,
  };
}

/** Convenience lookup: player id -> display name, for scorecards. */
export function useNameLookup(squads: (PlayingXiRow & { player: PlayerRow })[]) {
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of squads) {
      map.set(entry.player_id, entry.player.display_name || entry.player.full_name);
    }
    return (id: string | null | undefined) => (id ? map.get(id) ?? 'Unknown' : '—');
  }, [squads]);
}
