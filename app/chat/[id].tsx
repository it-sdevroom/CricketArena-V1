import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { EmptyState, ErrorNotice, Loading } from '@/components/UI';
import { C } from '@/constants/theme';
import { chat } from '@/src/data/repo';
import { useAuth } from '@/src/store/auth';
import { describeError, supabase } from '@/src/lib/supabase';

export default function TournamentChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channel = useQuery({
    queryKey: ['channel', id],
    queryFn: () => chat.channelForTournament(id as string),
    enabled: !!id,
  });

  const channelId = channel.data?.id;

  const messages = useQuery({
    queryKey: ['messages', channelId],
    queryFn: () => chat.messages(channelId as string),
    enabled: !!channelId,
  });

  // New messages arrive over realtime rather than by polling.
  useEffect(() => {
    if (!channelId) return;
    const subscription = supabase
      .channel(`chat:${channelId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        () => queryClient.invalidateQueries({ queryKey: ['messages', channelId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(subscription);
    };
  }, [channelId, queryClient]);

  const send = async () => {
    if (!channelId || !user || !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      await chat.send(channelId, user.id, draft.trim());
      setDraft('');
      await messages.refetch();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSending(false);
    }
  };

  if (channel.isLoading) return <Loading />;

  if (!channelId) {
    return (
      <View style={s.page}>
        <EmptyState
          icon="chatbubbles-outline"
          title="No channel for this tournament"
          message="A chat channel is created with the tournament. Ask the organiser to add one."
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={s.list}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.isLoading ? (
          <Loading />
        ) : messages.data?.length ? (
          messages.data.map((message) => {
            const mine = message.author_id === user?.id;
            return (
              <View key={message.id} style={[s.bubbleRow, mine && s.bubbleRowMine]}>
                <View style={[s.bubble, mine && s.bubbleMine]}>
                  {!mine ? (
                    <Text style={s.author}>{message.author?.full_name || 'Someone'}</Text>
                  ) : null}
                  <Text style={[s.body, mine && s.bodyMine]}>{message.body}</Text>
                  <Text style={[s.time, mine && s.timeMine]}>
                    {new Date(message.created_at).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
            );
          })
        ) : (
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title="No messages yet"
            message="Officials, captains and organisers can coordinate here."
          />
        )}
        {error ? <ErrorNotice message={error} /> : null}
      </ScrollView>

      {user ? (
        <View style={s.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={`Message as ${profile?.full_name?.split(' ')[0] ?? 'you'}…`}
            placeholderTextColor={C.muted}
            style={s.input}
            multiline
            maxLength={4000}
          />
          <Pressable
            onPress={send}
            disabled={sending || !draft.trim()}
            style={[s.send, (!draft.trim() || sending) && s.sendDisabled]}
            accessibilityLabel="Send message"
          >
            <Ionicons name="send" size={17} color="#052117" />
          </Pressable>
        </View>
      ) : (
        <View style={s.composer}>
          <Text style={s.signedOut}>Sign in to join the conversation.</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  list: { padding: 16, paddingBottom: 24, gap: 10 },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '82%',
    backgroundColor: C.card,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 16,
    borderBottomLeftRadius: 5,
    padding: 12,
  },
  bubbleMine: { backgroundColor: C.green, borderColor: C.green, borderBottomLeftRadius: 16, borderBottomRightRadius: 5 },
  author: { color: C.green, fontWeight: '900', fontSize: 11, marginBottom: 5 },
  body: { color: C.white, lineHeight: 20 },
  bodyMine: { color: '#052117', fontWeight: '600' },
  time: { color: C.muted, fontSize: 10, marginTop: 6, textAlign: 'right' },
  timeMine: { color: '#052117AA' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 9,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: '#09201A',
  },
  input: {
    flex: 1,
    backgroundColor: C.card,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: C.white,
    maxHeight: 110,
    minHeight: 46,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
  signedOut: { color: C.muted, textAlign: 'center', flex: 1, paddingVertical: 12 },
});
