import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { flushQueue } from '@/src/data/queue';
import { markActive, shouldSignOutOnLaunch } from '@/src/lib/session-policy';
import { supabase } from '@/src/lib/supabase';
import { AuthProvider } from '@/src/store/auth';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { C } from '@/constants/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Live scores arrive over realtime, so aggressive refetching is wasted
      // work; anything not on a realtime channel is refreshed on focus.
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

/**
 * Try to drain the offline scoring queue whenever the app comes back to the
 * foreground. Balls recorded in a dead spot reach the server as soon as the
 * scorer has signal again, without them having to do anything.
 */
function useQueueDrain() {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void flushQueue();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flushQueue();
    });

    timer.current = setInterval(() => {
      void flushQueue();
    }, 20_000);

    return () => {
      subscription.remove();
      if (timer.current) clearInterval(timer.current);
    };
  }, []);
}

/**
 * The boundary has to sit above everything that can fail, including the queue
 * drain and the providers. So the root component does nothing except mount it,
 * and all the real work happens in the child below.
 */
export default function RootLayout() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

/**
 * Honour the "sign out when the app closes" setting, if it is on.
 *
 * Runs once on a cold start, before anything renders, so a shared phone never
 * flashes the previous user's data. Backgrounding is not closing: the policy
 * allows a short grace period so a phone call does not sign a scorer out.
 */
function useSessionPolicy(onResolved: () => void) {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (await shouldSignOutOnLaunch()) {
          await supabase.auth.signOut();
        }
      } catch {
        // A failure here must not stop the app starting.
      } finally {
        await markActive();
        if (!cancelled) onResolved();
      }
    })();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' || state === 'background') void markActive();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [onResolved]);
}

function App() {
  useQueueDrain();
  const [ready, setReady] = useState(false);

  useSessionPolicy(useCallback(() => setReady(true), []));
  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: C.bg },
              headerTintColor: C.white,
              headerTitleStyle: { fontWeight: '800' },
              contentStyle: { backgroundColor: C.bg },
              headerShadowVisible: false,
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="setup" options={{ title: 'Connect your backend' }} />
            <Stack.Screen name="match/[id]" options={{ title: 'Match centre' }} />
            <Stack.Screen
              name="scorer/[id]"
              options={{ title: 'Scoring console', presentation: 'fullScreenModal' }}
            />
            <Stack.Screen name="tournament/[id]" options={{ title: 'Tournament' }} />
            <Stack.Screen name="team/[id]" options={{ title: 'Team' }} />
            <Stack.Screen name="player/[id]" options={{ title: 'Player' }} />
            <Stack.Screen name="organizer/index" options={{ title: 'Organiser console' }} />
            <Stack.Screen name="organizer/new-tournament" options={{ title: 'New tournament' }} />
            <Stack.Screen name="organizer/team/[id]" options={{ title: 'Manage team' }} />
            <Stack.Screen name="organizer/squads" options={{ title: 'Teams & players' }} />
            <Stack.Screen name="organizer/approvals" options={{ title: 'Player registrations' }} />
            <Stack.Screen name="organizer/enter-card/[matchId]" options={{ title: 'Type up the card' }} />
            <Stack.Screen name="organizer/committee" options={{ title: 'Tournament committee' }} />
            <Stack.Screen name="organizer/officials" options={{ title: 'Scorers & umpires' }} />
            <Stack.Screen name="join-team" options={{ title: 'Register as a player' }} />
            <Stack.Screen name="following" options={{ title: 'Following' }} />
            <Stack.Screen name="chat/[id]" options={{ title: 'Tournament chat' }} />
            <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
            <Stack.Screen name="profile" options={{ title: 'Your profile' }} />
            <Stack.Screen name="notification-settings" options={{ title: 'Notifications' }} />
            <Stack.Screen name="organizer/edit-player/[id]" options={{ title: 'Edit player' }} />
            <Stack.Screen name="corrections/[matchId]" options={{ title: 'Corrections' }} />
            <Stack.Screen name="highlights/[matchId]" options={{ title: 'Highlights' }} />
            <Stack.Screen name="legal/privacy" options={{ title: 'Privacy policy' }} />
            <Stack.Screen name="legal/delete-account" options={{ title: 'Delete account' }} />
          </Stack>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
