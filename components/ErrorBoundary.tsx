import { Component, ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { C } from '@/constants/theme';

/**
 * Catch anything thrown while the app starts up or renders, and put it on the
 * screen.
 *
 * A development build shows a red box. A release build shows nothing at all —
 * the process simply exits, which from the outside looks like "the app won't
 * open" and gives whoever is holding the phone no way to report what happened.
 * On a ground with no laptop and no USB cable, an error you can read and
 * photograph is the difference between a fixable report and a shrug.
 *
 * Two sources are covered:
 *
 *  - React render errors, via componentDidCatch.
 *  - Uncaught errors and rejections anywhere else, via the global handler that
 *    React Native installs as ErrorUtils. Without this, a failure during module
 *    initialisation — before any component mounts — never reaches a boundary.
 */

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  source: 'render' | 'global' | null;
}

type ErrorUtilsShape = {
  getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, source: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, source: 'render' };
  }

  componentDidMount() {
    const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsShape }).ErrorUtils;
    if (!errorUtils?.setGlobalHandler) return;

    const previous = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error, isFatal) => {
      // Only take over for fatal errors; a warning should not replace the app.
      if (isFatal) {
        const normalised = error instanceof Error ? error : new Error(String(error));
        this.setState({ error: normalised, source: 'global' });
      }
      previous?.(error, isFatal);
    });
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // Keep the component stack with the error so the report is useful.
    if (info.componentStack) {
      error.stack = `${error.stack ?? ''}\n\nComponent stack:${info.componentStack}`;
    }
  }

  render() {
    const { error, source } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={s.page}>
        <ScrollView contentContainerStyle={s.content}>
          <Text style={s.badge}>CRICKET ARENA COULD NOT START</Text>

          <Text style={s.title}>{error.message || 'Unknown error'}</Text>

          <Text style={s.help}>
            Photograph this screen and send it on — the text below says exactly what failed.
          </Text>

          <View style={s.card}>
            <Text style={s.cardLabel}>WHERE</Text>
            <Text style={s.mono}>
              {source === 'render' ? 'While drawing the screen' : 'While starting up'}
              {'\n'}
              {Platform.OS} {Platform.Version ? `(${String(Platform.Version)})` : ''}
            </Text>
          </View>

          <View style={s.card}>
            <Text style={s.cardLabel}>DETAIL</Text>
            <Text style={s.mono} selectable>
              {(error.stack ?? String(error)).slice(0, 4000)}
            </Text>
          </View>

          <Pressable style={s.button} onPress={() => this.setState({ error: null, source: null })}>
            <Text style={s.buttonText}>Try again</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  content: { padding: 22, paddingTop: 70, paddingBottom: 60, gap: 16 },
  badge: { color: C.red, fontWeight: '900', fontSize: 11, letterSpacing: 1.2 },
  title: { color: C.white, fontWeight: '900', fontSize: 20, lineHeight: 27 },
  help: { color: C.muted, fontSize: 13, lineHeight: 19 },
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    padding: 14,
    gap: 8,
  },
  cardLabel: { color: C.green, fontWeight: '900', fontSize: 10, letterSpacing: 1 },
  mono: { color: C.muted, fontSize: 11, lineHeight: 16, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  button: {
    backgroundColor: C.green,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonText: { color: '#052117', fontWeight: '900', fontSize: 15 },
});
