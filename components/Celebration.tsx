import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { C } from '@/constants/theme';
import type { Delivery } from '@/src/domain/types';

/**
 * A brief celebration when something happens on the field.
 *
 * A cricket crowd reacts to a six; an app that changes a number silently does
 * not. This makes a four, a six and a wicket land the way they do at a ground —
 * a flash of colour, the word, and gone.
 *
 * Kept deliberately short (1.4s) and non-blocking: nothing is dismissed by
 * tapping, nothing sits over a button, and it never interrupts scoring. A
 * scorer with a phone in one hand cannot afford a modal between deliveries, so
 * this floats above and disappears on its own.
 */

type Event = { kind: 'four' | 'six' | 'wicket'; id: string };

const STYLES = {
  four: { word: 'FOUR', colour: C.green, sub: 'Cracked away' },
  six: { word: 'SIX', colour: C.lime, sub: 'Out of the ground' },
  wicket: { word: 'WICKET', colour: C.red, sub: 'Got him' },
} as const;

/** Work out whether the newest delivery is worth celebrating. */
function eventFor(delivery: Delivery | null): Event | null {
  if (!delivery?.id) return null;

  if (delivery.wicket && delivery.wicket.kind !== 'retired_not_out') {
    return { kind: 'wicket', id: delivery.id };
  }
  if (delivery.runsOffBat === 6) return { kind: 'six', id: delivery.id };
  if (delivery.runsOffBat === 4) return { kind: 'four', id: delivery.id };
  return null;
}

export function Celebration({ latest }: { latest: Delivery | null }) {
  const [event, setEvent] = useState<Event | null>(null);
  const seen = useRef<string | null>(null);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const next = eventFor(latest);
    if (!next) return;

    // Only fire once per delivery. Re-rendering, refetching or a realtime echo
    // must not replay a celebration that has already happened.
    if (seen.current === next.id) return;

    // On first load there is a "latest" delivery from before the screen opened;
    // celebrating history would be wrong.
    if (seen.current === null) {
      seen.current = next.id;
      return;
    }

    seen.current = next.id;
    setEvent(next);

    progress.setValue(0);
    Animated.sequence([
      Animated.timing(progress, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.back(1.6)),
        useNativeDriver: true,
      }),
      Animated.delay(800),
      Animated.timing(progress, {
        toValue: 0,
        duration: 260,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setEvent(null);
    });
  }, [latest, progress]);

  if (!event) return null;

  const style = STYLES[event.kind];

  return (
    <View style={s.layer} pointerEvents="none">
      <Animated.View
        style={[
          s.badge,
          {
            borderColor: style.colour,
            opacity: progress,
            transform: [
              { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
            ],
          },
        ]}
      >
        <Text style={[s.word, { color: style.colour }]}>{style.word}</Text>
        <Text style={s.sub}>{style.sub}</Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  badge: {
    backgroundColor: '#04120Ef2',
    borderWidth: 2,
    borderRadius: 22,
    paddingHorizontal: 34,
    paddingVertical: 22,
    alignItems: 'center',
    gap: 4,
  },
  word: { fontSize: 40, fontWeight: '900', letterSpacing: 2 },
  sub: { color: C.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
});
