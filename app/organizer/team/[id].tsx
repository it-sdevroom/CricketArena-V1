import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import {
  Button,
  Card,
  EmptyState,
  ErrorNotice,
  Input,
  Loading,
  Screen,
  Section,
} from '@/components/UI';
import { PhotoField } from '@/components/PhotoField';
import { C } from '@/constants/theme';
import { squads, teams } from '@/src/data/repo';
import { uploadTeamLogo } from '@/src/lib/storage';
import { useAuth } from '@/src/store/auth';
import { describeError } from '@/src/lib/supabase';

/**
 * Manage one team: its details, its squad, and who leads it.
 *
 * This is the screen the organiser lives in. Most club cricketers never sign
 * in, so everything here works without the player having an account — the
 * organiser adds them, puts them in a squad and names a captain on their
 * behalf. Self-registration is a convenience on top, not the only route in.
 */
export default function ManageTeam() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);

  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [logo, setLogo] = useState<string | null>(null);

  const team = useQuery({ queryKey: ['team', id], queryFn: () => teams.get(id!), enabled: !!id });
  const squad = useQuery({ queryKey: ['squad', id], queryFn: () => squads.forTeam(id!), enabled: !!id });
  const available = useQuery({
    queryKey: ['available-players', team.data?.organization_id, id],
    queryFn: () => squads.availableFor(team.data!.organization_id, id!),
    enabled: !!team.data && picking,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['squad', id] });
    queryClient.invalidateQueries({ queryKey: ['available-players'] });
    queryClient.invalidateQueries({ queryKey: ['team', id] });
  };

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      refresh();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  if (team.isLoading) return <Loading label="Loading team…" />;
  if (!team.data) {
    return (
      <Screen>
        <ErrorNotice message="Team not found." onRetry={() => team.refetch()} />
      </Screen>
    );
  }

  const t = team.data;
  const members = squad.data ?? [];

  const startEdit = () => {
    setName(t.name);
    setShortName(t.short_name);
    setLogo(t.logo_url);
    setEditing(true);
  };

  const saveTeam = () =>
    run(async () => {
      let logoUrl = t.logo_url;
      if (logo && !logo.startsWith('http')) {
        logoUrl = await uploadTeamLogo(t.organization_id, logo);
      } else if (logo === null) {
        logoUrl = null;
      }
      await teams.update(t.id, {
        name: name.trim(),
        short_name: shortName.trim().toUpperCase(),
        logo_url: logoUrl,
      });
      setEditing(false);
    });

  const confirmDeleteTeam = () => {
    Alert.alert(
      `Delete ${t.name}?`,
      'This removes the team and its squad list. A team that has already played cannot be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            run(async () => {
              await squads.removeTeam(t.id);
              router.back();
            }),
        },
      ],
    );
  };

  const confirmRemovePlayer = (playerId: string, playerName: string) => {
    Alert.alert(`Remove ${playerName}?`, 'Take them out of this squad.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove from squad',
        onPress: () => run(() => squads.remove(t.id, playerId)),
      },
      {
        text: 'Delete player entirely',
        style: 'destructive',
        onPress: () =>
          run(async () => {
            const outcome = await squads.removePlayer(playerId);
            if (outcome === 'retired') {
              Alert.alert(
                'Player retired',
                `${playerName} has already played, so their scorecards are kept. They have been retired and will no longer appear in squads.`,
              );
            }
          }),
      },
    ]);
  };

  if (!can.manageTournaments) {
    return (
      <Screen>
        <EmptyState
          icon="lock-closed-outline"
          title="Organisers only"
          message="You need to be an administrator of this competition to manage squads."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {error ? <ErrorNotice message={error} /> : null}

      {/* ---------------------------------------------------------- team card */}
      {editing ? (
        <Card style={s.form}>
          <Text style={s.formTitle}>Edit team</Text>
          <PhotoField
            label="TEAM CREST"
            value={logo}
            onChange={setLogo}
            onError={setError}
            shape="square"
            busy={busy}
          />
          <Input label="TEAM NAME" value={name} onChangeText={setName} />
          <Input
            label="SHORT NAME"
            value={shortName}
            onChangeText={setShortName}
            maxLength={4}
            autoCapitalize="characters"
          />
          <View style={s.row}>
            <Button title="Cancel" secondary onPress={() => setEditing(false)} style={s.flex} />
            <Button title="Save" onPress={saveTeam} loading={busy} style={s.flex} />
          </View>
        </Card>
      ) : (
        <Card style={s.teamCard}>
          <View style={s.teamHead}>
            {t.logo_url ? (
              <Image source={{ uri: t.logo_url }} style={s.crest} />
            ) : (
              <View style={[s.crest, s.crestBlank, { borderColor: t.primary_color }]}>
                <Text style={[s.crestText, { color: t.primary_color }]}>{t.short_name}</Text>
              </View>
            )}
            <View style={s.flex}>
              <Text style={s.teamName}>{t.name}</Text>
              <Text style={s.teamMeta}>
                {t.short_name} · {members.length} player{members.length === 1 ? '' : 's'}
              </Text>
            </View>
          </View>
          <View style={s.row}>
            <Button title="Edit" secondary icon="create-outline" onPress={startEdit} style={s.flex} />
            <Button title="Delete" danger icon="trash-outline" onPress={confirmDeleteTeam} style={s.flex} />
          </View>
        </Card>
      )}

      {/* -------------------------------------------------------------- squad */}
      <Section title={`Squad (${members.length})`}>
        {squad.isLoading ? (
          <Loading />
        ) : members.length ? (
          <Card style={s.list}>
            {members.map((m: any, i: number) => (
              <View key={m.player_id} style={[s.member, i > 0 && s.memberBorder]}>
                <View style={s.avatarWrap}>
                  {m.photo_url ? (
                    <Image source={{ uri: m.photo_url }} style={s.avatar} />
                  ) : (
                    <View style={[s.avatar, s.avatarBlank]}>
                      <Text style={s.avatarText}>
                        {(m.display_name || m.full_name || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={s.flex}>
                  <Text style={s.memberName} numberOfLines={1}>
                    {m.display_name || m.full_name}
                    {m.jersey_number != null ? <Text style={s.jersey}>  #{m.jersey_number}</Text> : null}
                  </Text>
                  <View style={s.badges}>
                    <Text style={s.memberRole}>{String(m.role).replace(/_/g, ' ')}</Text>
                    {m.is_captain ? <Text style={s.badgeC}>CAPTAIN</Text> : null}
                    {m.is_vice_captain ? <Text style={s.badge}>VICE</Text> : null}
                    {m.is_wicket_keeper ? <Text style={s.badge}>KEEPER</Text> : null}
                  </View>
                </View>

                <View style={s.actions}>
                  <IconAction
                    icon="ribbon-outline"
                    active={m.is_captain}
                    onPress={() => run(() => squads.setCaptain(t.id, m.player_id))}
                  />
                  <IconAction
                    icon="hand-left-outline"
                    active={m.is_wicket_keeper}
                    onPress={() =>
                      run(() =>
                        squads.setRole(t.id, m.player_id, { is_wicket_keeper: !m.is_wicket_keeper }),
                      )
                    }
                  />
                  <IconAction
                    icon="close"
                    danger
                    onPress={() => confirmRemovePlayer(m.player_id, m.display_name || m.full_name)}
                  />
                </View>
              </View>
            ))}
          </Card>
        ) : (
          <EmptyState
            icon="people-outline"
            title="No players yet"
            message="Add players to this squad before generating fixtures."
          />
        )}
      </Section>

      {/* ------------------------------------------------------ add from pool */}
      {picking ? (
        <Section title="Add an existing player">
          {available.isLoading ? (
            <Loading />
          ) : available.data?.length ? (
            <Card style={s.list}>
              {available.data.map((p: any, i: number) => (
                <Pressable
                  key={p.id}
                  style={[s.member, i > 0 && s.memberBorder]}
                  onPress={() => run(() => squads.add(t.id, p.id))}
                >
                  <Ionicons name="add-circle-outline" size={22} color={C.green} />
                  <View style={s.flex}>
                    <Text style={s.memberName}>{p.display_name || p.full_name}</Text>
                    <Text style={s.memberRole}>{String(p.role).replace(/_/g, ' ')}</Text>
                  </View>
                </Pressable>
              ))}
            </Card>
          ) : (
            <EmptyState
              icon="person-add-outline"
              title="Everyone is already in this squad"
              message="Create a new player from Teams & players first."
            />
          )}
          <Button title="Done" secondary onPress={() => setPicking(false)} />
        </Section>
      ) : (
        <View style={s.bottom}>
          <Button title="Add existing player" icon="person-add-outline" onPress={() => setPicking(true)} />
          <Button
            title="Create a new player"
            secondary
            icon="add"
            onPress={() => router.push('/organizer/squads')}
          />
        </View>
      )}
    </Screen>
  );
}

function IconAction({
  icon,
  onPress,
  active = false,
  danger = false,
}: {
  icon: any;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.iconButton, active && s.iconButtonActive, danger && s.iconButtonDanger]}
      hitSlop={6}
    >
      <Ionicons name={icon} size={16} color={danger ? C.red : active ? '#052117' : C.muted} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  form: { gap: 4, marginBottom: 16 },
  formTitle: { color: C.white, fontWeight: '900', fontSize: 16, marginBottom: 10 },
  teamCard: { gap: 14, marginBottom: 16 },
  teamHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  crest: { width: 54, height: 54, borderRadius: 12, backgroundColor: C.card2 },
  crestBlank: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  crestText: { fontWeight: '900', fontSize: 15 },
  teamName: { color: C.white, fontWeight: '900', fontSize: 17 },
  teamMeta: { color: C.muted, fontSize: 12, marginTop: 3 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  list: { gap: 0 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  memberBorder: { borderTopWidth: 1, borderTopColor: C.line },
  avatarWrap: { width: 38 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.card2 },
  avatarBlank: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.green, fontWeight: '900' },
  memberName: { color: C.white, fontWeight: '800', fontSize: 14 },
  jersey: { color: C.muted, fontWeight: '700', fontSize: 12 },
  badges: { flexDirection: 'row', gap: 7, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' },
  memberRole: { color: C.muted, fontSize: 11, textTransform: 'capitalize' },
  badge: {
    color: C.blue, fontSize: 9, fontWeight: '900', letterSpacing: 0.5,
    borderWidth: 1, borderColor: C.line, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4,
  },
  badgeC: {
    color: '#052117', backgroundColor: C.lime, fontSize: 9, fontWeight: '900',
    letterSpacing: 0.5, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4,
  },
  actions: { flexDirection: 'row', gap: 6 },
  iconButton: {
    width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.line, backgroundColor: C.card2,
  },
  iconButtonActive: { backgroundColor: C.lime, borderColor: C.lime },
  iconButtonDanger: { borderColor: C.red + '55' },
  bottom: { gap: 10, marginTop: 8 },
});
