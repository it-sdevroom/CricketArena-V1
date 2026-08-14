import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { C } from '@/constants/theme';

/**
 * Play a highlight.
 *
 * On the web build a YouTube link becomes a real inline iframe. On a phone it
 * becomes a thumbnail that opens the YouTube app, which is both cheaper than
 * bundling a video library and better behaved — the native app handles
 * fullscreen, casting and picture-in-picture for free.
 *
 * Anything that is not YouTube falls back to a link, so a Mux or Cloudflare
 * URL still works even though we cannot generate a thumbnail for it.
 */

/** Pull the video id out of any of YouTube's URL shapes. */
export function youTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([A-Za-z0-9_-]{11})/,
    /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export function youTubeThumbnail(id: string): string {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

export function VideoEmbed({
  url,
  title,
  thumbnailUrl,
}: {
  url: string;
  title?: string;
  thumbnailUrl?: string | null;
}) {
  const id = youTubeId(url);

  // Inline playback on the web, where an iframe is native.
  if (id && Platform.OS === 'web') {
    return (
      <View style={s.frame}>
        {/* An intrinsic DOM element: only reachable on react-native-web. */}
        <iframe
          src={`https://www.youtube.com/embed/${id}`}
          title={title ?? 'Match highlight'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
          style={{ width: '100%', height: '100%', border: 'none', borderRadius: 16 }}
        />
      </View>
    );
  }

  const poster = thumbnailUrl ?? (id ? youTubeThumbnail(id) : null);

  return (
    <Pressable style={s.frame} onPress={() => Linking.openURL(url)} accessibilityRole="link">
      {poster ? (
        <Image source={{ uri: poster }} style={s.poster} resizeMode="cover" />
      ) : (
        <View style={[s.poster, s.blank]} />
      )}
      <View style={s.play}>
        <Ionicons name="play" size={26} color="#052117" />
      </View>
      {title ? (
        <View style={s.caption}>
          <Text style={s.captionText} numberOfLines={2}>
            {title}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.line,
    justifyContent: 'center',
    alignItems: 'center',
  },
  poster: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  blank: { backgroundColor: C.card2 },
  play: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    backgroundColor: '#000000AA',
  },
  captionText: { color: C.white, fontWeight: '800', fontSize: 13 },
});
