/**
 * How long a session survives.
 *
 * You asked for sign-out when the app closes. That is the right default on a
 * shared or borrowed phone, and the wrong one for the person scoring a match:
 * a scorer whose app is backgrounded by a phone call would come back signed
 * out, mid-over, possibly with balls still queued offline. Losing that is worse
 * than the risk it guards against.
 *
 * So it is a setting rather than a rule. It is off by default, and anyone who
 * shares a device can turn it on. Scorers see a warning if they enable it while
 * a match is in progress.
 *
 * "Closed" means fully closed, not backgrounded — Android backgrounds an app
 * for a notification shade pull, and signing out for that would be absurd. We
 * record when the app was last active and sign out on a cold start if the gap
 * is longer than the grace period.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const ENABLED_KEY = 'cricket-arena:sign-out-on-close';
const LAST_ACTIVE_KEY = 'cricket-arena:last-active';

/**
 * How long the app may be away before a cold start counts as "closed".
 * Two minutes covers answering a call or checking a message.
 */
const GRACE_MS = 2 * 60 * 1000;

export async function isSignOutOnCloseEnabled(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(ENABLED_KEY);
  return raw === 'true';
}

export async function setSignOutOnClose(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
  // Starting the clock now stops an immediate sign-out on the next launch.
  await markActive();
}

/** Call whenever the app is foregrounded or interacted with. */
export async function markActive(): Promise<void> {
  await AsyncStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
}

/**
 * Decide, on a cold start, whether this session should be ended.
 * Returns false whenever the setting is off, so the common path is cheap.
 */
export async function shouldSignOutOnLaunch(): Promise<boolean> {
  if (!(await isSignOutOnCloseEnabled())) return false;

  const raw = await AsyncStorage.getItem(LAST_ACTIVE_KEY);
  if (!raw) return true;

  const elapsed = Date.now() - Number(raw);
  return Number.isFinite(elapsed) ? elapsed > GRACE_MS : true;
}

export async function clearSessionMarkers(): Promise<void> {
  await AsyncStorage.removeItem(LAST_ACTIVE_KEY);
}
