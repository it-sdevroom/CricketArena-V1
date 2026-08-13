/**
 * Backend configuration.
 *
 * Expo inlines any `EXPO_PUBLIC_*` variable at build time on every platform, so
 * a single .env file covers the phone builds and the web export. The anon key
 * is designed to be public — row level security is what actually protects the
 * data — so shipping it in the bundle is expected.
 *
 * When the values are missing the app does not crash. `isConfigured` is false
 * and the UI routes to the setup screen instead, which matters because a fresh
 * clone has no project attached yet.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

function looksLikeSupabaseUrl(value: string): boolean {
  return /^https?:\/\/.+/.test(value);
}

export const env = {
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  /** True once both values are present and plausible. */
  isConfigured: looksLikeSupabaseUrl(url) && anonKey.length > 20,
};

/** Human-readable reason the backend is not usable, or null when it is. */
export function configurationProblem(): string | null {
  if (!url && !anonKey) return 'No Supabase project is connected yet.';
  if (!url) return 'EXPO_PUBLIC_SUPABASE_URL is missing.';
  if (!looksLikeSupabaseUrl(url)) return 'EXPO_PUBLIC_SUPABASE_URL does not look like a URL.';
  if (!anonKey) return 'EXPO_PUBLIC_SUPABASE_ANON_KEY is missing.';
  if (anonKey.length <= 20) return 'EXPO_PUBLIC_SUPABASE_ANON_KEY looks truncated.';
  return null;
}
