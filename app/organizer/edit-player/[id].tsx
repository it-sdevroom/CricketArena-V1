import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  Button,
  Card,
  ChipGroup,
  EmptyState,
  ErrorNotice,
  Input,
  Loading,
  Screen,
  Section,
} from '@/components/UI';
import { PhotoField } from '@/components/PhotoField';
import { C } from '@/constants/theme';
import { players } from '@/src/data/repo';
import { uploadAvatar } from '@/src/lib/storage';
import { useAuth } from '@/src/store/auth';
import { describeError } from '@/src/lib/supabase';

/**
 * Correct a player's details after they were created.
 *
 * A misspelt name was previously permanent, which is not a small thing: the
 * name appears on every scorecard that player ever features in, and the only
 * workaround was deleting them — which the delivery foreign key rightly
 * refuses once they have faced a ball.
 *
 * Retiring is offered instead of deletion for exactly that reason. A retired
 * player keeps their history and stops appearing in squad pickers.
 */

const ROLES = [
  { value: 'batter', label: 'Batter' },
  { value: 'bowler', label: 'Bowler' },
  { value: 'all_rounder', label: 'All-rounder' },
  { value: 'wicket_keeper', label: 'Keeper' },
  { value: 'wicket_keeper_batter', label: 'Keeper-bat' },
];

const BATTING = [
  { value: 'right_hand', label: 'Right hand' },
  { value: 'left_hand', label: 'Left hand' },
];

const BOWLING = [
  { value: 'none', label: 'Does not bowl' },
  { value: 'right_arm_fast', label: 'Right fast' },
  { value: 'right_arm_medium', label: 'Right medium' },
  { value: 'right_arm_off_break', label: 'Off break' },
  { value: 'right_arm_leg_break', label: 'Leg break' },
  { value: 'left_arm_fast', label: 'Left fast' },
  { value: 'left_arm_medium', label: 'Left medium' },
  { value: 'left_arm_orthodox', label: 'Left orthodox' },
];

export default function EditPlayer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState('');
  const [jersey, setJersey] = useState('');
  const [role, setRole] = useState('batter');
  const [batting, setBatting] = useState('right_hand');
  const [bowling, setBowling] = useState('none');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const player = useQuery({
    queryKey: ['player', id],
    queryFn: () => players.get(id as string),
    enabled: !!id,
  });

  useEffect(() => {
    const p = player.data;
    if (!p) return;
    setFullName(p.full_name ?? '');
    setJersey(p.jersey_number != null ? String(p.jersey_number) : '');
    setRole(p.role ?? 'batter');
    setBatting(p.batting_style ?? 'right_hand');
    setBowling(p.bowling_style ?? 'none');
    setPhoto(p.photo_url ?? null);
  }, [player.data]);

  if (player.isLoading) return <Loading label="Loading player…" />;

  if (!can.manageTournaments) {
    return (
      <Screen>
        <EmptyState
          icon="lock-closed-outline"
          title="Organisers only"
          message="Only an organiser can change a player's details."
        />
      </Screen>
    );
  }

  const current = player.data;
  if (!current) {
    return (
      <Screen>
        <ErrorNotice message="Player not found." />
      </Screen>
    );
  }

  const save = async () => {
    if (fullName.trim().length < 2) {
      setError('A player needs a name.');
      return;
    }

    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      let photoUrl = current.photo_url ?? null;
      if (photo && !photo.startsWith('http')) {
        photoUrl = await uploadAvatar(current.id, photo);
      } else if (photo === null) {
        photoUrl = null;
      }

      await players.update(current.id, {
        full_name: fullName.trim(),
        jersey_number: jersey.trim() === '' ? null : Number(jersey),
        role: role as never,
        batting_style: batting as never,
        bowling_style: bowling as never,
        photo_url: photoUrl,
      });

      await queryClient.invalidateQueries({ queryKey: ['player', current.id] });
      await queryClient.invalidateQueries({ queryKey: ['players'] });
      setSaved(true);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const retire = () => {
    Alert.alert(
      current.active ? 'Retire this player?' : 'Bring this player back?',
      current.active
        ? 'They keep every run and wicket already recorded, and stop appearing when you pick a squad.'
        : 'They will appear in squad pickers again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: current.active ? 'Retire' : 'Reinstate',
          onPress: async () => {
            setBusy(true);
            try {
              await players.update(current.id, { active: !current.active });
              await queryClient.invalidateQueries({ queryKey: ['player', current.id] });
              await queryClient.invalidateQueries({ queryKey: ['players'] });
              router.back();
            } catch (e) {
              setError(describeError(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Screen>
      {error ? <ErrorNotice message={error} /> : null}
      {saved ? <Text style={s.ok}>Saved. The new name appears on every scorecard.</Text> : null}

      <PhotoField
        label="PHOTO"
        value={photo}
        onChange={setPhoto}
        onError={setError}
        busy={busy}
      />

      <Input label="FULL NAME" value={fullName} onChangeText={setFullName} placeholder="Adnan Rahman" />
      <Input
        label="SQUAD NUMBER"
        value={jersey}
        onChangeText={setJersey}
        keyboardType="number-pad"
        placeholder="7"
      />

      <Section title="Role">
        <ChipGroup value={role} onChange={setRole} options={ROLES} />
      </Section>

      <Section title="Batting">
        <ChipGroup value={batting} onChange={setBatting} options={BATTING} />
      </Section>

      <Section title="Bowling">
        <ChipGroup value={bowling} onChange={setBowling} options={BOWLING} />
      </Section>

      <Button title="Save changes" onPress={save} loading={busy} />

      <Section title={current.active ? 'Squad status' : 'Retired'}>
        <Card style={s.retire}>
          <Text style={s.retireText}>
            {current.active
              ? 'Retiring keeps their scorecards intact but removes them from squad pickers. Use this rather than deleting — a player who has faced a ball cannot be deleted without breaking the matches they played in.'
              : 'This player is retired. Their history is intact and they can be brought back at any time.'}
          </Text>
          <Button
            title={current.active ? 'Retire player' : 'Reinstate player'}
            secondary
            danger={current.active}
            onPress={retire}
          />
        </Card>
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  ok: { color: C.green, fontWeight: '800', marginBottom: 14 },
  retire: { gap: 12 },
  retireText: { color: C.muted, fontSize: 13, lineHeight: 19 },
});
