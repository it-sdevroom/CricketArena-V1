import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { FollowButton } from '@/components/FollowButton';
import { Button, Card, EmptyState, ErrorNotice, ListRow, Loading, Pill, Screen, Section } from '@/components/UI';
import { C } from '@/constants/theme';
import { teams } from '@/src/data/repo';

export default function TeamDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const team = useQuery({ queryKey: ['team', id], queryFn: () => teams.get(id as string), enabled: !!id });
  const squad = useQuery({ queryKey: ['squad', id], queryFn: () => teams.squad(id as string), enabled: !!id });

  if (team.isLoading) return <Loading />;
  if (!team.data) {
    return (
      <Screen>
        <ErrorNotice message="Team not found." onRetry={() => void team.refetch()} />
      </Screen>
    );
  }

  const t = team.data;
  const keepers = squad.data?.filter((p) => p.is_wicket_keeper) ?? [];
  const captain = squad.data?.find((p) => p.is_captain);

  return (
    <Screen refreshing={squad.isFetching} onRefresh={() => void squad.refetch()}>
      <Card style={s.header}>
        <View style={[s.crest, { backgroundColor: `${t.primary_color}22`, borderColor: t.primary_color }]}>
          <Text style={[s.crestText, { color: t.primary_color }]}>{t.short_name}</Text>
        </View>
        <Text style={s.name}>{t.name}</Text>
        <View style={s.chips}>
          <Pill text={`${squad.data?.length ?? 0} players`} tone="muted" />
          {captain ? <Pill text={`Captain: ${captain.full_name.split(' ')[0]}`} tone="green" /> : null}
          {keepers.length ? <Pill text={`${keepers.length} keeper`} tone="muted" /> : null}
        </View>
        <FollowButton target={{ teamId: t.id }} />
      </Card>

      <Button
        title="Register to play for this team"
        secondary
        icon="person-add-outline"
        onPress={() => router.push('/join-team')}
        style={s.join}
      />

      <Section title="Squad">
        {squad.isLoading ? (
          <Loading />
        ) : squad.data?.length ? (
          <Card>
            {squad.data.map((player) => (
              <ListRow
                key={player.id}
                title={`${player.display_name || player.full_name}${player.is_captain ? ' (c)' : ''}${
                  player.is_wicket_keeper ? ' †' : ''
                }`}
                subtitle={`${player.role.replace(/_/g, ' ')} • ${player.batting_style.replace('_', ' ')}${
                  player.bowling_style !== 'none' ? ` • ${player.bowling_style.replace(/_/g, ' ')}` : ''
                }`}
                right={player.jersey_number ? `#${player.jersey_number}` : undefined}
                onPress={() => router.push(`/player/${player.id}`)}
              />
            ))}
          </Card>
        ) : (
          <EmptyState
            icon="person-add-outline"
            title="No players yet"
            message="Add players to this squad from Teams & players."
            actionLabel="Manage squads"
            onAction={() => router.push('/organizer/squads')}
          />
        )}
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { alignItems: 'center', gap: 12 },
  crest: {
    width: 68,
    height: 68,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crestText: { fontWeight: '900', fontSize: 21 },
  name: { color: C.white, fontWeight: '900', fontSize: 21, textAlign: 'center' },
  chips: { flexDirection: 'row', gap: 7, flexWrap: 'wrap', justifyContent: 'center' },
  join: { marginTop: 12 },
});
