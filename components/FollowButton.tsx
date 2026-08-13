/**
 * Follow a team, tournament or player.
 *
 * Follows are per-account, so a signed-out fan is sent to sign in rather than
 * being shown a control that cannot work. The button updates optimistically —
 * following is cheap and reversible, and waiting on a round trip for a toggle
 * feels broken.
 */

import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { C } from '@/constants/theme';
import { follows } from '@/src/data/repo';
import { useAuth } from '@/src/store/auth';

type Target = { teamId?: string; tournamentId?: string; playerId?: string };

export function FollowButton({ target, compact = false }: { target: Target; compact?: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  const list = useQuery({
    queryKey: ['follows', user?.id],
    queryFn: () => follows.list(user!.id),
    enabled: !!user,
  });

  const isFollowing =
    optimistic ??
    !!list.data?.some(
      (f) =>
        (target.teamId && f.team_id === target.teamId) ||
        (target.tournamentId && f.tournament_id === target.tournamentId) ||
        (target.playerId && f.player_id === target.playerId),
    );

  const toggle = async () => {
    if (!user) {
      router.push('/(auth)/sign-in');
      return;
    }

    const next = !isFollowing;
    setOptimistic(next);
    try {
      if (next) await follows.add(user.id, target);
      else await follows.remove(user.id, target);
      await queryClient.invalidateQueries({ queryKey: ['follows', user.id] });
      await queryClient.invalidateQueries({ queryKey: ['following-feed', user.id] });
    } catch {
      // Put the button back where it was; the follow simply did not happen.
      setOptimistic(!next);
    }
  };

  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={isFollowing ? 'Unfollow' : 'Follow'}
      accessibilityState={{ selected: isFollowing }}
      style={({ pressed }) => [
        s.button,
        compact && s.compact,
        isFollowing && s.following,
        pressed && s.pressed,
      ]}
    >
      <Ionicons
        name={isFollowing ? 'heart' : 'heart-outline'}
        size={compact ? 14 : 16}
        color={isFollowing ? C.red : C.white}
      />
      {!compact ? (
        <Text style={[s.label, isFollowing && s.labelFollowing]}>
          {isFollowing ? 'Following' : 'Follow'}
        </Text>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card2,
    justifyContent: 'center',
  },
  compact: { paddingHorizontal: 10, minHeight: 34 },
  following: { borderColor: `${C.red}66`, backgroundColor: `${C.red}14` },
  pressed: { opacity: 0.75 },
  label: { color: C.white, fontWeight: '800', fontSize: 13 },
  labelFollowing: { color: C.red },
});
