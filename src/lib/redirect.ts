import { Platform } from 'react-native';

/**
 * Where Supabase should send someone after they click a link in an email.
 *
 * Supabase defaults its Site URL to http://localhost:3000, so a confirmation
 * link opened on a phone tries to reach a dev server on the phone itself and
 * hangs forever. Sending an explicit redirect with every email means the app
 * works even if that dashboard setting is wrong — though it must still be set,
 * because Supabase only honours redirects that appear on its allow list.
 *
 * On the web this resolves to wherever the app is actually served from,
 * including the /CricketArena-V1 base path on GitHub Pages. On a phone build it
 * resolves to the cricketarena:// scheme, which reopens the installed app.
 */
export function authRedirectUrl(path = '/'): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { origin, pathname } = window.location;
    // Keep the base path (/CricketArena-V1) but drop the current route, so the
    // link returns to the app root rather than to whatever page sent it.
    const base = pathname.replace(/\/+$/, '');
    const baseUrl = process.env.EXPO_PUBLIC_BASE_URL?.replace(/\/+$/, '') ?? '';
    const prefix = baseUrl || (base.startsWith('/') ? base.split('/').slice(0, 2).join('/') : '');
    return `${origin}${prefix}${path === '/' ? '/' : path}`;
  }
  // Native builds are reopened through the app's custom scheme.
  return `cricketarena://${path.replace(/^\//, '')}`;
}
