import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Button,
  Card,
  ChipGroup,
  EmptyState,
  ErrorNotice,
  Input,
  ListRow,
  Loading,
  Screen,
  Section,
  Segmented,
} from '@/components/UI';
import { PhotoField } from '@/components/PhotoField';
import { C } from '@/constants/theme';
import { uploadTeamLogo } from '@/src/lib/storage';
import { players, teams, tournaments } from '@/src/data/repo';
import { useAuth } from '@/src/store/auth';
import { describeError } from '@/src/lib/supabase';

const ROLES = [
  { value: 'batter', label: 'Batter' },
  { value: 'bowler', label: 'Bowler' },
  { value: 'all_rounder', label: 'All-rounder' },
  { value: 'wicket_keeper_batter', label: 'Keeper-batter' },
];

const COLORS = ['#20D78A', '#6E8BFF', '#FFBF47', '#FF5D67', '#B8F34A', '#7C5CFF'];

export default function Squads() {
  const { activeOrg, can } = useAuth();
  const [tab, setTab] = useState<'teams' | 'players'>('teams');

  if (!activeOrg) {
    return (
      <Screen>
        <EmptyState
          icon="business-outline"
          title="No organisation"
          message="Create an organisation from the organiser console before adding teams."
          actionLabel="Organiser console"
          onAction={() => router.replace('/organizer')}
        />
      </Screen>
    );
  }

  if (!can.manageSquads) {
    return (
      <Screen>
        <EmptyState
          icon="lock-closed-outline"
          title="Not permitted"
          message="Adding teams and players needs the tournament admin or team manager role."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'teams', label: 'Teams' },
          { value: 'players', label: 'Players' },
        ]}
      />
      {tab === 'teams' ? <TeamsPanel organizationId={activeOrg.id} /> : <PlayersPanel organizationId={activeOrg.id} />}
    </Screen>
  );
}

function TeamsPanel({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [logo, setLogo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({ queryKey: ['teams', organizationId], queryFn: () => teams.list(organizationId) });
  const leagues = useQuery({ queryKey: ['tournaments', organizationId], queryFn: () => tournaments.list(organizationId) });

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      // Upload first: a team row with a broken logo URL is worse than one
      // created a second later.
      let logoUrl: string | null = null;
      if (logo && !logo.startsWith('http')) {
        logoUrl = await uploadTeamLogo(organizationId, logo);
      } else if (logo) {
        logoUrl = logo;
      }

      await teams.create({
        organization_id: organizationId,
        name: name.trim(),
        short_name: shortName.trim().toUpperCase() || name.trim().slice(0, 3).toUpperCase(),
        primary_color: color,
        logo_url: logoUrl,
      });
      await queryClient.invalidateQueries({ queryKey: ['teams', organizationId] });
      setName('');
      setShortName('');
      setLogo(null);
      setAdding(false);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const register = async (teamId: string, tournamentId: string) => {
    try {
      await tournaments.addTeam(tournamentId, teamId);
      await queryClient.invalidateQueries({ queryKey: ['tournament-teams', tournamentId] });
    } catch (e) {
      setError(describeError(e));
    }
  };

  const activeLeague = leagues.data?.find((t) => t.status === 'active') ?? leagues.data?.[0];

  return (
    <>
      {error ? <ErrorNotice message={error} /> : null}

      {adding ? (
        <Card style={s.form}>
          <Text style={s.formTitle}>New team</Text>
          <PhotoField
            label="TEAM CREST"
            value={logo}
            onChange={setLogo}
            onError={setError}
            shape="square"
            busy={busy}
            hint="Optional. Shown on fixtures, the points table and scorecards."
          />
          <Input label="TEAM NAME" value={name} onChangeText={setName} placeholder="Riyadh Falcons" />
          <Input
            label="SHORT NAME"
            value={shortName}
            onChangeText={setShortName}
            placeholder="RF"
            maxLength={4}
            autoCapitalize="characters"
          />
          <Text style={s.label}>COLOUR</Text>
          <View style={s.colorRow}>
            {COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[s.swatch, { backgroundColor: c }, color === c && s.swatchActive]}
                accessibilityLabel={`Colour ${c}`}
              />
            ))}
          </View>
          <View style={s.formActions}>
            <Button title="Cancel" secondary onPress={() => setAdding(false)} style={s.flex} />
            <Button title="Add team" onPress={create} loading={busy} disabled={name.trim().length < 2} style={s.flex} />
          </View>
        </Card>
      ) : (
        <Button title="Add a team" icon="add" onPress={() => setAdding(true)} style={s.addButton} />
      )}

      <Section title={`Teams (${list.data?.length ?? 0})`}>
        {list.isLoading ? (
          <Loading />
        ) : list.data?.length ? (
          <Card>
            {list.data.map((team) => (
              <View key={team.id} style={s.teamRow}>
                <ListRow
                  title={team.name}
                  subtitle={team.short_name}
                  leadingColor={team.primary_color}
                  onPress={() => router.push(`/organizer/team/${team.id}`)}
                />
                {activeLeague ? (
                  <Pressable onPress={() => void register(team.id, activeLeague.id)} hitSlop={8} style={s.register}>
                    <Ionicons name="add-circle-outline" size={19} color={C.green} />
                    <Text style={s.registerText}>Register</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </Card>
        ) : (
          <EmptyState icon="shirt-outline" title="No teams yet" message="Add your first team to get started." />
        )}
      </Section>
    </>
  );
}

function PlayersPanel({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [fullName, setFullName] = useState('');
  const [jersey, setJersey] = useState('');
  const [role, setRole] = useState('batter');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({ queryKey: ['players', organizationId], queryFn: () => players.list(organizationId) });
  const teamList = useQuery({ queryKey: ['teams', organizationId], queryFn: () => teams.list(organizationId) });

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await players.create({
        organization_id: organizationId,
        full_name: fullName.trim(),
        jersey_number: jersey ? Number(jersey) : null,
        role,
      });
      // Adding a player straight into a squad saves a second trip through the UI.
      if (teamId) await teams.addPlayer(teamId, created.id);

      await queryClient.invalidateQueries({ queryKey: ['players', organizationId] });
      if (teamId) await queryClient.invalidateQueries({ queryKey: ['squad', teamId] });
      setFullName('');
      setJersey('');
      setAdding(false);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error ? <ErrorNotice message={error} /> : null}

      {adding ? (
        <Card style={s.form}>
          <Text style={s.formTitle}>New player</Text>
          <Input label="FULL NAME" value={fullName} onChangeText={setFullName} placeholder="Adnan Rahman" />
          <Input
            label="SQUAD NUMBER"
            value={jersey}
            onChangeText={setJersey}
            placeholder="7"
            keyboardType="number-pad"
            maxLength={3}
          />
          <Text style={s.label}>ROLE</Text>
          <ChipGroup value={role} onChange={setRole} options={ROLES} />

          {teamList.data?.length ? (
            <>
              <Text style={s.label}>ADD TO TEAM (OPTIONAL)</Text>
              <ChipGroup
                tone="blue"
                value={teamId}
                onChange={(next) => setTeamId(next === teamId ? null : next)}
                options={teamList.data.map((t) => ({ value: t.id, label: t.short_name }))}
              />
            </>
          ) : null}

          <View style={s.formActions}>
            <Button title="Cancel" secondary onPress={() => setAdding(false)} style={s.flex} />
            <Button
              title="Add player"
              onPress={create}
              loading={busy}
              disabled={fullName.trim().length < 2}
              style={s.flex}
            />
          </View>
        </Card>
      ) : (
        <Button title="Add a player" icon="add" onPress={() => setAdding(true)} style={s.addButton} />
      )}

      <Section title={`Players (${list.data?.length ?? 0})`}>
        {list.isLoading ? (
          <Loading />
        ) : list.data?.length ? (
          <Card>
            {list.data.map((player) => (
              <ListRow
                key={player.id}
                title={player.full_name}
                subtitle={`${player.role.replace(/_/g, ' ')}${player.jersey_number ? ` • #${player.jersey_number}` : ''}`}
                onPress={() => router.push(`/player/${player.id}`)}
              />
            ))}
          </Card>
        ) : (
          <EmptyState icon="person-outline" title="No players yet" message="Add players, then assign them to teams." />
        )}
      </Section>
    </>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  addButton: { marginTop: 18 },
  form: { marginTop: 18, gap: 4 },
  formTitle: { color: C.white, fontWeight: '900', fontSize: 16, marginBottom: 10 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  label: { color: C.muted, fontWeight: '800', fontSize: 12, marginBottom: 9, marginTop: 6, letterSpacing: 0.4 },
  colorRow: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  swatch: { width: 34, height: 34, borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: C.white },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  register: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  registerText: { color: C.green, fontSize: 12, fontWeight: '800' },
});
