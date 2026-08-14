import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  Button,
  Card,
  EmptyState,
  ErrorNotice,
  Input,
  Screen,
  Section,
} from '@/components/UI';
import { PhotoField } from '@/components/PhotoField';
import { VideoEmbed, youTubeId } from '@/components/VideoEmbed';
import { C } from '@/constants/theme';
import { matches, media } from '@/src/data/repo';
import { uploadMatchPhoto } from '@/src/lib/storage';
import { useAuth } from '@/src/store/auth';
import { describeError } from '@/src/lib/supabase';
import type { MediaKind } from '@/src/data/types';

/**
 * Highlights and photographs for one match.
 *
 * Video is stored as a link rather than a file. An innings of footage would be
 * larger than this entire database, and YouTube already solves transcoding,
 * bandwidth and playback on every device. Photographs are small enough to host
 * ourselves, so those go to the match-media bucket.
 */
export default function Highlights() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { user, memberships } = useAuth();
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<MediaKind>('video');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const matchQuery = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => matches.get(matchId!),
    enabled: !!matchId,
  });

  const mediaQuery = useQuery({
    queryKey: ['media', matchId],
    queryFn: () => media.forMatch(matchId!),
    enabled: !!matchId,
  });

  const match = matchQuery.data;
  const canPost = !!(
    user &&
    match &&
    memberships.some(
      (m) =>
        m.id === match.organization_id &&
        ['tournament_admin', 'stream_operator', 'team_manager'].includes(m.role),
    )
  );

  const add = useMutation({
    mutationFn: async () => {
      if (!user || !match) throw new Error('Not signed in.');

      let finalUrl = url.trim();
      let thumbnail: string | null = null;

      if (kind === 'photo') {
        if (!photo) throw new Error('Choose a photograph first.');
        finalUrl = photo.startsWith('http')
          ? photo
          : await uploadMatchPhoto(match.organization_id, photo);
        thumbnail = finalUrl;
      } else {
        if (!finalUrl) throw new Error('Paste the video or stream link.');
        const id = youTubeId(finalUrl);
        if (id) thumbnail = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
      }

      return media.create(
        {
          organization_id: match.organization_id,
          match_id: match.id,
          tournament_id: match.tournament_id,
          kind,
          title: title.trim() || (kind === 'photo' ? 'Match photograph' : 'Match highlight'),
          url: finalUrl,
          thumbnail_url: thumbnail,
        },
        user.id,
      );
    },
    onSuccess: () => {
      setTitle('');
      setUrl('');
      setPhoto(null);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['media', matchId] });
    },
    onError: (e) => setError(describeError(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => media.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['media', matchId] }),
    onError: (e) => setError(describeError(e)),
  });

  const items = mediaQuery.data ?? [];
  const videos = items.filter((m) => m.kind !== 'photo');
  const photos = items.filter((m) => m.kind === 'photo');

  return (
    <Screen>
      {error ? <ErrorNotice message={error} /> : null}

      {canPost ? (
        <Section title="Add a highlight">
          <Card style={s.form}>
            <View style={s.kinds}>
              {(['video', 'stream', 'photo'] as MediaKind[]).map((k) => (
                <Button
                  key={k}
                  title={k === 'video' ? 'Video' : k === 'stream' ? 'Live stream' : 'Photo'}
                  secondary={kind !== k}
                  onPress={() => setKind(k)}
                  style={s.kindButton}
                />
              ))}
            </View>

            <Input
              label="TITLE"
              value={title}
              onChangeText={setTitle}
              placeholder={kind === 'photo' ? 'Presentation after the match' : 'Last over finish'}
            />

            {kind === 'photo' ? (
              <PhotoField
                label="PHOTOGRAPH"
                value={photo}
                onChange={setPhoto}
                onError={setError}
                shape="square"
                busy={add.isPending}
              />
            ) : (
              <Input
                label={kind === 'stream' ? 'STREAM LINK' : 'VIDEO LINK'}
                value={url}
                onChangeText={setUrl}
                placeholder="https://youtube.com/watch?v=…"
                autoCapitalize="none"
              />
            )}

            <Text style={s.hint}>
              {kind === 'photo'
                ? 'Photographs are stored with the match and resized before upload.'
                : 'Paste a YouTube link and it plays inside the app. Other hosts open in a browser.'}
            </Text>

            <Button
              title="Publish"
              onPress={() => add.mutate()}
              loading={add.isPending}
            />
          </Card>
        </Section>
      ) : null}

      {items.length === 0 && !mediaQuery.isLoading ? (
        <EmptyState
          icon="videocam-outline"
          title="No highlights yet"
          message={
            canPost
              ? 'Add a YouTube link or a photograph and it will appear here for everyone following this match.'
              : 'The organiser has not published any clips from this match.'
          }
        />
      ) : null}

      {videos.length ? (
        <Section title={videos.length === 1 ? 'Video' : 'Videos'}>
          <View style={s.list}>
            {videos.map((item) => (
              <View key={item.id} style={s.item}>
                <VideoEmbed url={item.url} title={item.title} thumbnailUrl={item.thumbnail_url} />
                <View style={s.meta}>
                  <Text style={s.itemTitle}>{item.title}</Text>
                  {canPost ? (
                    <Text style={s.remove} onPress={() => remove.mutate(item.id)}>
                      Remove
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {photos.length ? (
        <Section title="Photographs">
          <View style={s.grid}>
            {photos.map((item) => (
              <View key={item.id} style={s.photoCell}>
                <Image source={{ uri: item.url }} style={s.photo} resizeMode="cover" />
                <Text style={s.photoTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                {canPost ? (
                  <Text style={s.remove} onPress={() => remove.mutate(item.id)}>
                    Remove
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </Section>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  form: { gap: 4 },
  kinds: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  kindButton: { flex: 1 },
  hint: { color: C.muted, fontSize: 12, lineHeight: 17, marginBottom: 12 },
  list: { gap: 20 },
  item: { gap: 9 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemTitle: { color: C.white, fontWeight: '800', flex: 1 },
  remove: { color: C.red, fontWeight: '800', fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  photoCell: { width: '47%', gap: 6 },
  photo: { width: '100%', aspectRatio: 1, borderRadius: 14, backgroundColor: C.card2 },
  photoTitle: { color: C.muted, fontSize: 12 },
});
