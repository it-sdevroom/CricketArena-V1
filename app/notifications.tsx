import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, EmptyState, Loading, Screen } from '@/components/UI';
import { C } from '@/constants/theme';
import { notifications } from '@/src/data/repo';
import { useAuth } from '@/src/store/auth';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  match_start: 'play-circle-outline',
  result: 'trophy-outline',
  fixture: 'calendar-outline',
  general: 'information-circle-outline',
};

export default function Notifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: () => notifications.list(user!.id),
    enabled: !!user,
  });

  if (!user) {
    return (
      <Screen>
        <EmptyState
          icon="notifications-off-outline"
          title="Sign in for notifications"
          message="We will tell you when your team is playing, when a match starts and when a result is in."
          actionLabel="Sign in"
          onAction={() => router.push('/(auth)/sign-in')}
        />
      </Screen>
    );
  }

  const unread = query.data?.filter((n) => !n.read_at) ?? [];

  const markAll = async () => {
    await notifications.markAllRead(user.id);
    await queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
  };

  return (
    <Screen refreshing={query.isFetching} onRefresh={() => void query.refetch()}>
      {unread.length ? (
        <Button title={`Mark all ${unread.length} as read`} secondary onPress={markAll} style={s.markAll} />
      ) : null}

      {query.isLoading ? (
        <Loading />
      ) : query.data?.length ? (
        query.data.map((item) => (
          <Pressable
            key={item.id}
            onPress={async () => {
              if (!item.read_at) {
                await notifications.markRead(item.id);
                await queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
              }
              if (item.match_id) router.push(`/match/${item.match_id}`);
              else if (item.tournament_id) router.push(`/tournament/${item.tournament_id}`);
            }}
            style={({ pressed }) => pressed && s.pressed}
          >
            <Card style={[s.item, !item.read_at && s.unread]}>
              <View style={s.icon}>
                <Ionicons name={ICONS[item.kind] ?? ICONS.general} size={18} color={C.green} />
              </View>
              <View style={s.flex}>
                <Text style={s.title} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.body ? (
                  <Text style={s.body} numberOfLines={2}>
                    {item.body}
                  </Text>
                ) : null}
                <Text style={s.time}>
                  {new Date(item.created_at).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
              {!item.read_at ? <View style={s.dot} /> : null}
            </Card>
          </Pressable>
        ))
      ) : (
        <EmptyState
          icon="notifications-outline"
          title="Nothing yet"
          message="Match reminders and results will land here."
        />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  markAll: { marginBottom: 16 },
  pressed: { opacity: 0.8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 9 },
  unread: { borderColor: `${C.green}66` },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: C.card2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: C.white, fontWeight: '800' },
  body: { color: C.muted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  time: { color: C.muted, fontSize: 11, marginTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green },
});
