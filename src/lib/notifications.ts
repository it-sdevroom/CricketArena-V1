/**
 * Push notifications.
 *
 * Two hard constraints shape this:
 *
 *  1. Push does not work in Expo Go on Android any more. It needs a real build,
 *     which is what scripts/build-apk.sh produces. Calling this from Expo Go
 *     fails in a confusing way, so we detect it and say so plainly instead.
 *
 *  2. There is no push on the web build. The browser has its own notification
 *     API with a different permission model, and a fan on the website does not
 *     expect a system notification. Every function here is a safe no-op there.
 *
 * Delivery is queued server-side: a database trigger writes to `push_queue`
 * whenever an in-app notification is created, and an Edge Function drains it.
 * That means a failed send is visible and retryable rather than silently lost.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { push } from '@/src/data/repo';

/** Show notifications while the app is open, rather than swallowing them. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

export interface PushRegistration {
  token: string | null;
  /** Why registration did not happen, for showing an honest message. */
  reason?: 'web' | 'simulator' | 'expo-go' | 'denied' | 'error';
  message?: string;
}

const isExpoGo = Constants.appOwnership === 'expo';

/**
 * Ask for permission and register this device's token.
 *
 * Safe to call repeatedly — Android returns the existing token, and the server
 * upserts on (user, token).
 */
export async function registerForPush(): Promise<PushRegistration> {
  if (Platform.OS === 'web') {
    return { token: null, reason: 'web', message: 'Push notifications are only available in the phone app.' };
  }

  if (!Device.isDevice) {
    return { token: null, reason: 'simulator', message: 'Push notifications need a real device.' };
  }

  if (isExpoGo) {
    return {
      token: null,
      reason: 'expo-go',
      message: 'Push notifications need the installed app, not Expo Go.',
    };
  }

  try {
    // Android needs a channel before anything will appear.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('match-updates', {
        name: 'Match updates',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#20D78A',
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;

    if (status !== 'granted') {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }

    if (status !== 'granted') {
      return {
        token: null,
        reason: 'denied',
        message: 'Notifications are switched off for Cricket Arena in your phone settings.',
      };
    }

    // The project id comes from app.config; without it Expo cannot mint a token.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;

    const result = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    await push.registerToken(result.data, Platform.OS);
    return { token: result.data };
  } catch (error) {
    return {
      token: null,
      reason: 'error',
      message: error instanceof Error ? error.message : 'Could not register for notifications.',
    };
  }
}

/** Stop this device receiving pushes, without touching other devices. */
export async function unregisterPush(token: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await push.removeToken(token);
}

/**
 * Subscribe to taps on a notification. Returns an unsubscribe function.
 * The payload carries matchId/tournamentId so the app can open the right screen.
 */
export function onNotificationTapped(
  handler: (data: Record<string, unknown>) => void,
): () => void {
  if (Platform.OS === 'web') return () => {};

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    handler(response.notification.request.content.data ?? {});
  });

  return () => subscription.remove();
}

/** Clear the badge count, e.g. once the notification list has been read. */
export async function clearBadge(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch {
    // Badges are unsupported on some Android launchers; not worth surfacing.
  }
}
