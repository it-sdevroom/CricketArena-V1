import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { C } from '@/constants/theme';
import { buildCommentary, groupByOver } from '@/src/domain/commentary';
import type { CommentaryLine } from '@/src/domain/commentary';
import type { Delivery, MatchRules } from '@/src/domain/types';

/**
 * Ball-by-ball commentary.
 *
 * Reads newest first, grouped by over with a summary line for each completed
 * over, which is how a follower catches up: "that over went for 14" first,
 * then the balls that made it up.
 *
 * Only the most recent few overs render until asked for more. A long innings is
 * 240-plus deliveries and there is no reason to lay out all of them on a phone.
 */

const TONE: Record<CommentaryLine['tone'], string> = {
  normal: C.muted,
  boundary: C.green,
  six: C.lime,
  wicket: C.red,
  extra: C.amber,
};

const INITIAL_OVERS = 6;

export function Commentary({
  deliveries,
  rules,
  nameOf,
}: {
  deliveries: Delivery[];
  rules: MatchRules;
  nameOf: (id: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);

  const overs = useMemo(
    () => groupByOver(buildCommentary(deliveries, rules, nameOf)),
    [deliveries, rules, nameOf],
  );

  if (overs.length === 0) {
    return <Text style={s.empty}>Commentary appears here as soon as the first ball is bowled.</Text>;
  }

  const shown = expanded ? overs : overs.slice(0, INITIAL_OVERS);
  const hidden = overs.length - shown.length;

  return (
    <View style={s.wrap}>
      {shown.map((over) => (
        <View key={over.overNumber} style={s.over}>
          <View style={s.overHead}>
            <Text style={s.overLabel}>Over {over.overNumber + 1}</Text>
            <Text style={s.overSummary}>
              {over.runs} run{over.runs === 1 ? '' : 's'}
              {over.wickets > 0 ? ` · ${over.wickets} wicket${over.wickets === 1 ? '' : 's'}` : ''}
            </Text>
          </View>

          {over.lines.map((line) => (
            <View key={line.deliveryId} style={s.line}>
              <Text style={s.ball}>{line.over}</Text>
              <Text style={[s.text, { color: TONE[line.tone] }]}>{line.text}</Text>
            </View>
          ))}
        </View>
      ))}

      {hidden > 0 ? (
        <Pressable onPress={() => setExpanded(true)} style={s.more}>
          <Text style={s.moreText}>
            Show {hidden} earlier over{hidden === 1 ? '' : 's'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 18 },
  empty: { color: C.muted, fontSize: 13, lineHeight: 19 },
  over: { gap: 9 },
  overHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 7,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  overLabel: { color: C.white, fontWeight: '900', fontSize: 13 },
  overSummary: { color: C.muted, fontSize: 12, fontWeight: '700' },
  line: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  ball: {
    color: C.muted,
    fontSize: 12,
    fontWeight: '800',
    width: 38,
    fontVariant: ['tabular-nums'],
  },
  text: { flex: 1, fontSize: 13, lineHeight: 19 },
  more: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
  },
  moreText: { color: C.green, fontWeight: '800', fontSize: 13 },
});
