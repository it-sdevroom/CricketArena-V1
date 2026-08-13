/**
 * The Supabase client.
 *
 * Session storage differs by platform. On the web the SDK's default
 * localStorage is right. On a phone we keep the refresh token in the OS
 * keystore via expo-secure-store, which caps each entry at 2 KB — a Supabase
 * session with a large JWT can exceed that, so the adapter below splits the
 * value across numbered chunks and reassembles it on read.
 */

import 'react-native-url-polyfill/auto';

import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { env } from './env';

const CHUNK_SIZE = 1800;

const secureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    const head = await SecureStore.getItemAsync(`${key}_0`);
    if (head == null) {
      // Fall back to a value written before chunking, if any.
      return SecureStore.getItemAsync(key);
    }
    let value = head;
    for (let i = 1; ; i++) {
      const part = await SecureStore.getItemAsync(`${key}_${i}`);
      if (part == null) break;
      value += part;
    }
    return value;
  },

  async setItem(key: string, value: string): Promise<void> {
    await this.removeItem(key);
    const chunks = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < chunks; i++) {
      await SecureStore.setItemAsync(`${key}_${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
  },

  async removeItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key).catch(() => undefined);
    for (let i = 0; i < 20; i++) {
      const part = await SecureStore.getItemAsync(`${key}_${i}`);
      if (part == null) break;
      await SecureStore.deleteItemAsync(`${key}_${i}`);
    }
  },
};

function build(): SupabaseClient {
  // A placeholder URL keeps `createClient` from throwing when the app is opened
  // before a project is connected; every call is gated on env.isConfigured.
  const url = env.isConfigured ? env.supabaseUrl : 'http://localhost:54321';
  const key = env.isConfigured ? env.supabaseAnonKey : 'public-anon-key-placeholder';

  return createClient(url, key, {
    auth: {
      storage: Platform.OS === 'web' ? undefined : secureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      // The native app has no URL bar to read an OAuth fragment from.
      detectSessionInUrl: Platform.OS === 'web',
    },
    realtime: {
      params: { eventsPerSecond: 20 },
    },
  });
}

export const supabase = build();

// Refresh tokens only tick while the app is in the foreground; without this a
// scorer returning to a backgrounded app gets a 401 on their next ball.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

/** Narrow a PostgREST error into something worth showing a human. */
export function describeError(error: unknown): string {
  if (!error) return 'Something went wrong.';
  const e = error as { message?: string; code?: string; details?: string };

  if (e.code === 'PGRST301' || e.message?.includes('JWT')) {
    return 'Your session expired. Sign in again.';
  }
  if (e.code === '42501' || e.message?.toLowerCase().includes('row-level security')) {
    return 'You do not have permission to do that.';
  }
  if (e.code === '23505') {
    return 'That already exists.';
  }
  if (e.message?.includes('Failed to fetch') || e.message?.includes('Network request failed')) {
    return 'No connection. Your changes are saved and will sync when you are back online.';
  }
  return e.message ?? 'Something went wrong.';
}
