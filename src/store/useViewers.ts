import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/src/lib/supabase';
import { newIdempotencyKey } from '@/src/data/queue';

/**
 * Who is watching a match, now and in total.
 *
 * The live number comes from Supabase Realtime presence rather than the
 * database. People join a channel when they open a match and drop off it when
 * they close the app, lose signal or walk out of the ground — the server
 * notices without anybody telling it. A "live" count kept in a table would
 * count a phone that died an hour ago, which is worse than no number at all.
 *
 * The lifetime number does need to persist, so that one is a row per device,
 * upserted, and read back as an aggregate. It counts people rather than visits:
 * refreshing a scorecard eleven times is one interested spectator.
 */

const DEVICE_KEY = 'cricket-arena:device-key';

/** A stable random id for this install. Not tied to a person or an advertiser. */
async function deviceKey(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const created = newIdempotencyKey();
  await AsyncStorage.setItem(DEVICE_KEY, created);
  return created;
}

export interface Viewers {
  /** People with the match open right now. */
  live: number;
  /** Distinct devices that have ever opened it. */
  total: number;
  /** Whether the live figure is trustworthy yet. */
  connected: boolean;
}

export function useViewers(matchId: string | undefined, isLive: boolean): Viewers {
  const [live, setLive] = useState(0);
  const [connected, setConnected] = useState(false);

  // Lifetime count, and the record of this visit.
  const totals = useQuery({
    queryKey: ['match-views', matchId],
    queryFn: async () => {
      const key = await deviceKey();
      // Fire and forget: failing to be counted must never block the scorecard.
      void supabase.rpc('record_match_view', { p_match_id: matchId, p_device_key: key });

      const { data } = await supabase
        .from('match_view_counts')
        .select('total_viewers')
        .eq('match_id', matchId)
        .maybeSingle();
      return data?.total_viewers ?? 0;
    },
    enabled: !!matchId,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!matchId) return;

    // Presence is only worth the connection while something is happening.
    if (!isLive) {
      setLive(0);
      setConnected(false);
      return;
    }

    let cancelled = false;
    const channel = supabase.channel(`match-viewers:${matchId}`, {
      config: { presence: { key: '' } },
    });

    const count = () => {
      if (cancelled) return;
      const state = channel.presenceState();
      setLive(Object.keys(state).length);
    };

    channel
      .on('presence', { event: 'sync' }, count)
      .on('presence', { event: 'join' }, count)
      .on('presence', { event: 'leave' }, count)
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED' || cancelled) return;
        const key = await deviceKey();
        await channel.track({ device: key, at: Date.now() });
        setConnected(true);
        count();
      });

    return () => {
      cancelled = true;
      void channel.unsubscribe();
    };
  }, [matchId, isLive]);

  return { live, total: totals.data ?? 0, connected };
}

/** "1 watching" / "24 watching", or null when there is nothing worth saying. */
export function describeViewers(viewers: Viewers): string | null {
  if (viewers.live > 0) {
    return `${viewers.live} watching`;
  }
  if (viewers.total > 0) {
    return `${viewers.total} ${viewers.total === 1 ? 'person has' : 'people have'} followed this match`;
  }
  return null;
}
