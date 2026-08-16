import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { MatchCard } from '@/components/MatchCard';
import { EmptyState, ErrorNotice, Loading, Screen, Segmented } from '@/components/UI';
import { FadeIn } from '@/components/Motion';
import { SkeletonList, SkeletonMatchCard } from '@/components/Skeleton';
import { C } from '@/constants/theme';
import { matches } from '@/src/data/repo';
import { describeError } from '@/src/lib/supabase';

type Filter = 'live' | 'upcoming' | 'results';

const STATUS: Record<Filter, string[]> = {
  live: ['live', 'innings_break', 'toss'],
  upcoming: ['scheduled'],
  results: ['completed', 'walkover', 'abandoned'],
};

export default function Matches() {
  const [filter, setFilter] = useState<Filter>('live');

  const query = useQuery({
    queryKey: ['matches', filter],
    queryFn: () => matches.summaries({ status: STATUS[filter], limit: 60 }),
  });

  const list = query.data ?? [];
  // Results read best newest first; fixtures read best soonest first.
  const ordered =
    filter === 'results'
      ? [...list].sort((a, z) => (z.scheduled_at ?? '').localeCompare(a.scheduled_at ?? ''))
      : list;

  return (
    <Screen safeTop refreshing={query.isFetching} onRefresh={() => void query.refetch()}>
      <Text style={s.title}>Matches</Text>

      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'live', label: 'Live' },
          { value: 'upcoming', label: 'Fixtures' },
          { value: 'results', label: 'Results' },
        ]}
      />

      <Text style={s.count}>
        {query.isLoading ? ' ' : `${ordered.length} match${ordered.length === 1 ? '' : 'es'}`}
      </Text>

      {query.error ? (
        <ErrorNotice message={describeError(query.error)} onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <Loading />
      ) : ordered.length ? (
        ordered.map((match, i) => (
          <FadeIn key={match.match_id} index={i}>
            <MatchCard match={match} />
          </FadeIn>
        ))
      ) : (
        <EmptyState
          icon={filter === 'live' ? 'radio-outline' : filter === 'upcoming' ? 'calendar-outline' : 'trophy-outline'}
          title={
            filter === 'live'
              ? 'Nothing live right now'
              : filter === 'upcoming'
                ? 'No fixtures scheduled'
                : 'No completed matches yet'
          }
          message={
            filter === 'live'
              ? 'When a scorer opens the console and records the first ball, the match appears here instantly.'
              : filter === 'upcoming'
                ? 'Generate a fixture list from the organiser console to fill this in.'
                : 'Results are published the moment a match is completed.'
          }
        />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  title: { color: C.white, fontSize: 26, fontWeight: '900', marginTop: 34, marginBottom: 18 },
  count: { color: C.muted, fontSize: 12, marginTop: 16, marginBottom: 12 },
});
