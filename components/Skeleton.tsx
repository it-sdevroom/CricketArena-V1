import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, ViewStyle } from 'react-native';

import { C } from '@/constants/theme';

/**
 * Loading placeholders shaped like the content they replace.
 *
 * A spinner says "something is happening"; a skeleton says "a scorecard is
 * coming, and it will be about this big". The screen stops jumping when data
 * lands, which is the actual benefit — perceived speed is mostly about layout
 * not moving.
 *
 * Uses the built-in Animated with `useNativeDriver`, so the shimmer runs on the
 * UI thread and keeps going while JavaScript is busy parsing the response it is
 * waiting for. A shimmer that stutters exactly when the app is working hardest
 * would be worse than none.
 */

function useShimmer() {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  return progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 0.75, 0.35] });
}

export function SkeletonBox({
  width = '100%',
  height = 16,
  radius = 8,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const opacity = useShimmer();
  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: C.card2, opacity }, style]}
    />
  );
}

/** A line of text that has not arrived yet. */
export function SkeletonText({
  lines = 1,
  width = '100%',
  lastWidth = '60%',
}: {
  lines?: number;
  width?: `${number}%`;
  lastWidth?: `${number}%`;
}) {
  return (
    <View style={s.stack}>
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonBox
          key={i}
          width={i === lines - 1 && lines > 1 ? lastWidth : width}
          height={12}
          radius={6}
        />
      ))}
    </View>
  );
}

/** The shape of a match card, so the list does not reflow when data lands. */
export function SkeletonMatchCard() {
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <SkeletonBox width="40%" height={10} radius={5} />
        <SkeletonBox width={54} height={18} radius={9} />
      </View>
      <View style={s.team}>
        <SkeletonBox width={30} height={30} radius={15} />
        <SkeletonBox width="45%" height={14} />
        <SkeletonBox width={52} height={16} style={s.right} />
      </View>
      <View style={s.team}>
        <SkeletonBox width={30} height={30} radius={15} />
        <SkeletonBox width="38%" height={14} />
        <SkeletonBox width={52} height={16} style={s.right} />
      </View>
      <SkeletonBox width="55%" height={10} radius={5} />
    </View>
  );
}

/** A points-table row. */
export function SkeletonTableRow() {
  return (
    <View style={s.row}>
      <SkeletonBox width={22} height={12} radius={6} />
      <SkeletonBox width="38%" height={13} />
      <View style={s.rowNumbers}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonBox key={i} width={22} height={12} radius={6} />
        ))}
      </View>
    </View>
  );
}

/** A batting or bowling card line. */
export function SkeletonPlayerRow() {
  return (
    <View style={s.playerRow}>
      <SkeletonBox width={32} height={32} radius={16} />
      <View style={s.playerText}>
        <SkeletonBox width="55%" height={13} />
        <SkeletonBox width="30%" height={10} radius={5} />
      </View>
      <SkeletonBox width={40} height={16} />
    </View>
  );
}

/** Several of a thing, with the right spacing between them. */
export function SkeletonList({
  count = 3,
  children,
}: {
  count?: number;
  children: () => React.ReactNode;
}) {
  return <View style={s.list}>{Array.from({ length: count }, (_, i) => <View key={i}>{children()}</View>)}</View>;
}

const s = StyleSheet.create({
  stack: { gap: 8 },
  list: { gap: 12 },
  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    padding: 16,
    gap: 12,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  team: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  right: { marginLeft: 'auto' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  rowNumbers: { flexDirection: 'row', gap: 14, marginLeft: 'auto' },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  playerText: { flex: 1, gap: 6 },
});
