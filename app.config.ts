import type { ExpoConfig } from 'expo/config';

/**
 * Expo configuration.
 *
 * This is a .ts file rather than app.json because the web build needs a
 * `baseUrl` that depends on where it is being deployed:
 *
 *   - local dev and EAS builds  →  no base path
 *   - GitHub Pages              →  /<repository-name>
 *
 * The deploy workflow sets EXPO_PUBLIC_BASE_URL, so the same source produces a
 * correct bundle in both places without anyone editing a config by hand.
 */

const baseUrl = process.env.EXPO_PUBLIC_BASE_URL?.trim() || undefined;

const config: ExpoConfig = {
  name: 'Cricket Arena',
  slug: 'cricket-arena',
  version: '2.0.0',
  orientation: 'portrait',
  scheme: 'cricketarena',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  backgroundColor: '#061713',

  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.nauman.cricketarena',
    infoPlist: {
      // Live scoring is used outdoors on patchy mobile data.
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: false },
    },
  },

  android: {
    package: 'com.nauman.cricketarena',
    adaptiveIcon: { backgroundColor: '#071A16' },
    edgeToEdgeEnabled: true,
  },

  web: {
    bundler: 'metro',
    // A single-page bundle plus a 404.html fallback is what GitHub Pages can
    // actually serve; static per-route HTML would 404 on dynamic routes such
    // as /match/<id>.
    output: 'single',
    name: 'Cricket Arena',
    shortName: 'Cricket Arena',
    themeColor: '#20D78A',
    backgroundColor: '#061713',
    description: 'Run local cricket tournaments: live ball-by-ball scoring, fixtures, tables and stats.',
    lang: 'en',
    display: 'standalone',
    orientation: 'portrait',
  },

  plugins: ['expo-router', 'expo-secure-store'],

  experiments: {
    typedRoutes: true,
    baseUrl,
  },

  extra: {
    eas: {
      // Filled in by `eas init`. Left null so the config is valid before then.
      projectId: process.env.EAS_PROJECT_ID ?? undefined,
    },
  },
};

export default config;
