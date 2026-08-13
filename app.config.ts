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

// A bare "/" means "served from the root" and must become undefined, not "/".
// The deploy workflow sends "/" for user and organisation Pages sites.
const rawBaseUrl = process.env.EXPO_PUBLIC_BASE_URL?.trim();
const baseUrl = !rawBaseUrl || rawBaseUrl === '/' ? undefined : rawBaseUrl.replace(/\/$/, '');

const config: ExpoConfig = {
  name: 'Cricket Arena',
  slug: 'cricket-arena',
  version: '2.1.0',
  orientation: 'portrait',
  scheme: 'cricketarena',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  backgroundColor: '#061713',
  icon: './assets/icon.png',
  // Regenerate the whole set from the theme with: npm run icons
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#061713',
  },

  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.nauman.cricketarena',
    // App Store Connect requires this to increase with every upload.
    buildNumber: '1',
    infoPlist: {
      // Live scoring is used outdoors on patchy mobile data.
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: false },
      // Both strings are shown verbatim in the iOS permission prompt, and
      // review rejects the build if they are vague about why access is needed.
      NSPhotoLibraryUsageDescription:
        'Choose a profile photo for your player registration.',
      NSCameraUsageDescription:
        'Take a profile photo for your player registration.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },

  android: {
    package: 'com.nauman.cricketarena',
    // Google Play requires this to increase with every upload.
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#071A16',
    },
    edgeToEdgeEnabled: true,
    permissions: ['android.permission.READ_MEDIA_IMAGES'],
    // Everything else is derived; blocking the defaults keeps the Play data
    // safety form honest and short.
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
    ],
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
    favicon: './assets/favicon.png',
  },

  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-image-picker',
      {
        photosPermission: 'Choose a profile photo for your player registration.',
        cameraPermission: 'Take a profile photo for your player registration.',
      },
    ],
  ],

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
