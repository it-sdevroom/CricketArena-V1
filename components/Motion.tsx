import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';

import { C } from '@/constants/theme';

/**
 * Movement, used sparingly.
 *
 * The rule here is that animation should explain something. A list fading in
 * shows what arrived; a score counting up shows that it changed; a wicket
 * flashing red says something happened while you were looking away. Motion that
 * only decorates gets in the way of a scorer trying to record the next ball,
 * so there is none of it.
 *
 * Everything uses the native driver, so it keeps running while JavaScript is
 * busy folding two hundred deliveries into a scorecard.
 */

/**
 * Fade and lift, optionally staggered by position in a list.
 *
 * The stagger is capped: with forty rows, an index-proportional delay would
 * leave the last one arriving a second and a half late, which reads as broken
 * rather than considered.
 */
export function FadeIn({
  children,
  index = 0,
  delay = 0,
  style,
}: {
  children: ReactNode;
  index?: number;
  delay?: number;
  style?: ViewStyle;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const stagger = Math.min(index * 45, 270);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      delay: delay + stagger,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, index, delay]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * A number that counts to its new value.
 *
 * Used for the score: seeing 128 become 134 tells you a boundary was hit, where
 * a number that simply changes tells you nothing. The count is quick — long
 * enough to notice, short enough that the real figure is never in doubt.
 */
export function CountUp({
  value,
  style,
  duration = 420,
}: {
  value: number;
  style?: TextStyle;
  duration?: number;
}) {
  const animated = useRef(new Animated.Value(value)).current;
  const previous = useRef(value);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (previous.current === value) return;

    // Jumping backwards means a correction, not a run: show it immediately
    // rather than animating down, which would look like runs being taken away.
    if (value < previous.current) {
      animated.setValue(value);
      setShown(value);
      previous.current = value;
      return;
    }

    const animation = Animated.timing(animated, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    });

    const listener = animated.addListener(({ value: v }) => setShown(Math.round(v)));
    animation.start(() => {
      animated.removeListener(listener);
      setShown(value);
    });

    previous.current = value;
    return () => {
      animated.removeListener(listener);
      animation.stop();
    };
  }, [value, animated, duration, setShown]);

  return <Text style={style}>{shown}</Text>;
}

/**
 * Flash a colour when something happens — a wicket, a boundary.
 * Fires once per change of `trigger` and fades out on its own.
 */
export function Flash({
  trigger,
  colour = C.green,
  children,
  style,
}: {
  trigger: unknown;
  colour?: string;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const first = useRef(true);

  useEffect(() => {
    // Do not flash on first render: nothing has happened yet.
    if (first.current) {
      first.current = false;
      return;
    }

    progress.setValue(1);
    const animation = Animated.timing(progress, {
      toValue: 0,
      duration: 900,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [trigger, progress]);

  return (
    <Animated.View
      style={[
        style,
        {
          backgroundColor: progress.interpolate({
            inputRange: [0, 1],
            outputRange: ['transparent', colour + '33'],
          }),
          borderRadius: 12,
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * A live indicator that actually pulses, so a glance tells you the match is
 * running rather than stale.
 */
export function LivePulse({ size = 8, colour = C.red }: { size?: number; colour?: string }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 900,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  return (
    <View style={[s.pulseWrap, { width: size * 2.4, height: size * 2.4 }]}>
      <Animated.View
        style={[
          s.pulseRing,
          {
            width: size * 2.4,
            height: size * 2.4,
            borderRadius: size * 1.2,
            backgroundColor: colour,
            opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
            transform: [
              { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.25] }) },
            ],
          },
        ]}
      />
      <View
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colour }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  pulseWrap: { alignItems: 'center', justifyContent: 'center' },
  pulseRing: { position: 'absolute' },
});
