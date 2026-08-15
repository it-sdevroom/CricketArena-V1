import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { Card, EmptyState, Loading } from '@/components/UI';
import { C } from '@/constants/theme';
import { corrections } from '@/src/data/repo';

/**
 * Every change made to a match's score, visible to everyone.
 *
 * This is deliberately not an organiser-only screen. Scorers are volunteers
 * with a phone in one hand, and mistakes get made; what turns an honest
 * correction into a suspicious one is nobody being able to see it. Both teams
 * and anyone following can read this, so "they changed the score" stops being
 * an accusation and becomes a link.
 *
 * The before/after is rendered in cricket terms rather than as raw columns —
 * "2 runs → 1 run" means something to a captain; a JSON diff does not.
 */

/** Describe a delivery snapshot the way a scorer would say it aloud. */
function describeSnapshot(state: any): string {
  if (!state) return 'nothing';

  const parts: string[] = [];
  const runs = state.runs_off_bat ?? 0;

  if (state.wide_runs != null) parts.push(`wide (${state.wide_runs})`);
  else if (state.no_ball_runs != null) parts.push(`no ball, ${runs} off the bat`);
  else if (state.byes) parts.push(`${state.byes} bye${state.byes === 1 ? '' : 's'}`);
  else if (state.leg_byes) parts.push(`${state.leg_byes} leg bye${state.leg_byes === 1 ? '' : 's'}`);
  else parts.push(`${runs} run${runs === 1 ? '' : 's'}`);

  if (state.wicket_kind) parts.push(`OUT (${String(state.wicket_kind).replace(/_/g, ' ')})`);
  if (state.penalty_runs) parts.push(`${state.penalty_runs} penalty`);

  return parts.join(', ');
}

const ACTION_LABEL: Record<string, string> = {
  edit: 'Ball corrected',
  delete: 'Ball removed',
  insert: 'Ball added',
};

export function CorrectionLog({ matchId, compact = false }: { matchId: string; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const log = useQuery({
    queryKey: ['corrections', matchId],
    queryFn: () => corrections.forMatch(matchId),
    enabled: !!matchId,
  });

  if (log.isLoading) return <Loading />;

  const entries = (log.data ?? []) as any[];

  if (entries.length === 0) {
    return compact ? null : (
      <EmptyState
        icon="shield-checkmark-outline"
        title="No corrections"
        message="Nothing in this match has been changed after it was recorded."
      />
    );
  }

  const shown = expanded || !compact ? entries : entries.slice(0, 3);

  return (
    <Card style={s.card}>
      <Text style={s.intro}>
        Every change to this scorecard is listed here, with who made it and why. Corrections are
        normal; hiding them is not.
      </Text>

      {shown.map((entry, i) => (
        <View key={entry.id} style={[s.entry, i > 0 && s.entryBorder]}>
          <View style={s.head}>
            <Text style={s.action}>{ACTION_LABEL[entry.action] ?? entry.action}</Text>
            <Text style={s.when}>
              {new Date(entry.created_at).toLocaleString(undefined, {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>

          <View style={s.diff}>
            <Text style={s.before}>{describeSnapshot(entry.before_state)}</Text>
            <Text style={s.arrow}>→</Text>
            <Text style={s.after}>{describeSnapshot(entry.after_state)}</Text>
          </View>

          {entry.reason ? <Text style={s.reason}>“{entry.reason}”</Text> : null}

          <Text style={s.by}>
            {entry.profiles?.full_name ? `by ${entry.profiles.full_name}` : 'by a scorer'}
          </Text>
        </View>
      ))}

      {compact && entries.length > shown.length ? (
        <Text style={s.more} onPress={() => setExpanded(true)}>
          Show all {entries.length} corrections
        </Text>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  card: { gap: 0 },
  intro: { color: C.muted, fontSize: 12, lineHeight: 18, marginBottom: 14 },
  entry: { paddingVertical: 12, gap: 6 },
  entryBorder: { borderTopWidth: 1, borderTopColor: C.line },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  action: { color: C.amber, fontWeight: '900', fontSize: 12, letterSpacing: 0.4 },
  when: { color: C.muted, fontSize: 11 },
  diff: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  before: { color: C.red, fontSize: 13, textDecorationLine: 'line-through' },
  arrow: { color: C.muted, fontSize: 13 },
  after: { color: C.green, fontSize: 13, fontWeight: '700' },
  reason: { color: C.white, fontSize: 12, fontStyle: 'italic', lineHeight: 18 },
  by: { color: C.muted, fontSize: 11 },
  more: { color: C.green, fontWeight: '800', fontSize: 12, paddingTop: 12, textAlign: 'center' },
});
