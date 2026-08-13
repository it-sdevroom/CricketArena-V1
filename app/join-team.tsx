import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AvatarPicker } from '@/components/AvatarPicker';
import {
  Button,
  Card,
  ChipGroup,
  EmptyState,
  ErrorNotice,
  Input,
  Loading,
  Pill,
  Screen,
  Section,
  Segmented,
} from '@/components/UI';
import { C } from '@/constants/theme';
import { organizations, registrations, teams } from '@/src/data/repo';
import { useAuth } from '@/src/store/auth';
import { describeError } from '@/src/lib/supabase';

const ROLES = [
  { value: 'batter', label: 'Batter' },
  { value: 'bowler', label: 'Bowler' },
  { value: 'all_rounder', label: 'All-rounder' },
  { value: 'wicket_keeper_batter', label: 'Keeper-batter' },
  { value: 'wicket_keeper', label: 'Wicket keeper' },
];

const BOWLING = [
  { value: 'none', label: "Doesn't bowl" },
  { value: 'right_arm_fast', label: 'Right arm fast' },
  { value: 'right_arm_medium', label: 'Right arm medium' },
  { value: 'right_arm_off_break', label: 'Off break' },
  { value: 'right_arm_leg_break', label: 'Leg break' },
  { value: 'left_arm_fast', label: 'Left arm fast' },
  { value: 'left_arm_medium', label: 'Left arm medium' },
  { value: 'left_arm_orthodox', label: 'Left arm orthodox' },
];

const STATUS_TONE = {
  pending: 'amber',
  approved: 'green',
  rejected: 'red',
  withdrawn: 'muted',
} as const;

/**
 * A cricketer applies to join a squad themselves.
 *
 * Nothing here touches the real roster. The application sits in
 * `player_registrations` until an organiser approves it, at which point a
 * database function creates the player, adds them to the squad and links the
 * record to this account — all in one transaction.
 */
export default function JoinTeam() {
  const { user, profile, refresh } = useAuth();
  const queryClient = useQueryClient();

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [jersey, setJersey] = useState('');
  const [role, setRole] = useState('batter');
  const [batting, setBatting] = useState<'right_hand' | 'left_hand'>('right_hand');
  const [bowling, setBowling] = useState('none');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(profile?.avatar_url ?? null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const orgs = useQuery({ queryKey: ['organizations'], queryFn: () => organizations.list() });
  const teamList = useQuery({
    queryKey: ['teams', organizationId],
    queryFn: () => teams.list(organizationId as string),
    enabled: !!organizationId,
  });
  const mine = useQuery({
    queryKey: ['my-registrations', user?.id],
    queryFn: () => registrations.mine(user!.id),
    enabled: !!user,
  });

  if (!user) {
    return (
      <Screen>
        <EmptyState
          icon="person-add-outline"
          title="Sign in to register"
          message="Registering as a player links your career statistics to your account, so we need to know who you are."
          actionLabel="Sign in or create an account"
          onAction={() => router.push('/(auth)/sign-in')}
        />
      </Screen>
    );
  }

  const alreadyPending = mine.data?.find((r) => r.status === 'pending' && r.team_id === teamId);

  const submit = async () => {
    if (!organizationId || !teamId) return;
    setBusy(true);
    setError(null);
    try {
      await registrations.apply({
        organizationId,
        teamId,
        userId: user.id,
        fullName: fullName.trim(),
        jerseyNumber: jersey ? Number(jersey) : null,
        phone: phone.trim() || null,
        photoUrl,
        role,
        battingStyle: batting,
        bowlingStyle: bowling,
        note: note.trim() || null,
      });
      await queryClient.invalidateQueries({ queryKey: ['my-registrations', user.id] });
      await refresh();
      setDone(true);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Screen>
        <View style={s.successIcon}>
          <Ionicons name="checkmark-circle" size={44} color={C.green} />
        </View>
        <Text style={s.successTitle}>Application sent</Text>
        <Text style={s.successText}>
          The tournament organiser has been notified. You will get a notification here as soon as
          they approve it, and your name will appear in the squad.
        </Text>
        <Button title="Back to home" onPress={() => router.replace('/(tabs)')} />
        <Button
          title="Apply to another team"
          secondary
          style={s.spaced}
          onPress={() => {
            setDone(false);
            setTeamId(null);
            setNote('');
          }}
        />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.flex}>
      <Screen>
        <Text style={s.lead}>
          Pick the club and team you play for, fill in your details, and the organiser will confirm
          you. Your statistics start counting from your first match.
        </Text>

        {mine.data?.length ? (
          <Section title="Your applications">
            {mine.data.slice(0, 4).map((application) => (
              <Card key={application.id} style={s.applicationRow}>
                <View style={s.flex}>
                  <Text style={s.applicationTeam}>{application.team?.name ?? 'Team'}</Text>
                  <Text style={s.applicationMeta}>
                    {new Date(application.created_at).toLocaleDateString()}
                    {application.review_note ? ` — ${application.review_note}` : ''}
                  </Text>
                </View>
                <Pill
                  text={application.status.toUpperCase()}
                  tone={STATUS_TONE[application.status] ?? 'muted'}
                />
              </Card>
            ))}
          </Section>
        ) : null}

        {error ? <ErrorNotice message={error} /> : null}

        <Section title="Your photo">
          <Card style={s.photoCard}>
            <AvatarPicker userId={user.id} value={photoUrl} onChange={setPhotoUrl} onError={setError} />
            <Text style={s.photoHint}>
              Optional, but it helps the organiser recognise you and appears on the scorecard.
            </Text>
          </Card>
        </Section>

        <Section title="Which club?">
          {orgs.isLoading ? (
            <Loading />
          ) : orgs.data?.length ? (
            <ChipGroup
              value={organizationId}
              onChange={(next) => {
                setOrganizationId(next);
                setTeamId(null);
              }}
              options={orgs.data.map((o) => ({
                value: o.id,
                label: o.name,
                sublabel: o.city ?? undefined,
              }))}
            />
          ) : (
            <EmptyState
              icon="business-outline"
              title="No clubs yet"
              message="Nobody has set up an organisation on this instance yet."
            />
          )}
        </Section>

        {organizationId ? (
          <Section title="Which team?">
            {teamList.isLoading ? (
              <Loading />
            ) : teamList.data?.length ? (
              <ChipGroup
                tone="blue"
                value={teamId}
                onChange={setTeamId}
                options={teamList.data.map((t) => ({ value: t.id, label: t.name, sublabel: t.short_name }))}
              />
            ) : (
              <EmptyState icon="shirt-outline" title="No teams" message="This club has no teams yet." />
            )}
          </Section>
        ) : null}

        {teamId ? (
          <>
            {alreadyPending ? (
              <Card style={s.warning}>
                <Text style={s.warningText}>
                  You already have an application pending for this team. Wait for the organiser to
                  review it, or withdraw it first.
                </Text>
              </Card>
            ) : null}

            <Section title="Your details">
              <Input label="FULL NAME" value={fullName} onChangeText={setFullName} placeholder="Adnan Rahman" />
              <Input
                label="PREFERRED SQUAD NUMBER"
                value={jersey}
                onChangeText={setJersey}
                keyboardType="number-pad"
                maxLength={3}
                placeholder="7"
                hint="The organiser may change this if it is taken."
              />
              <Input
                label="PHONE (OPTIONAL)"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="+966 5X XXX XXXX"
              />
            </Section>

            <Section title="How do you play?">
              <Text style={s.label}>ROLE</Text>
              <ChipGroup value={role} onChange={setRole} options={ROLES} />

              <Text style={s.label}>BATTING</Text>
              <Segmented
                value={batting}
                onChange={setBatting}
                options={[
                  { value: 'right_hand', label: 'Right hand' },
                  { value: 'left_hand', label: 'Left hand' },
                ]}
              />

              <Text style={s.label}>BOWLING</Text>
              <ChipGroup tone="blue" value={bowling} onChange={setBowling} options={BOWLING} />
            </Section>

            <Input
              label="A NOTE FOR THE ORGANISER (OPTIONAL)"
              value={note}
              onChangeText={setNote}
              placeholder="I played for the same club last season."
              multiline
              numberOfLines={3}
              maxLength={500}
              style={s.textarea}
            />

            <Button
              title="Send registration"
              icon="paper-plane-outline"
              onPress={submit}
              loading={busy}
              disabled={!!alreadyPending || fullName.trim().length < 2}
            />
            <Text style={s.footnote}>
              The organiser reviews every application before anyone joins a squad, so nobody can add
              themselves to a league's statistics.
            </Text>
          </>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.bg },
  lead: { color: C.muted, lineHeight: 21, marginBottom: 6 },
  label: { color: C.muted, fontWeight: '800', fontSize: 12, marginTop: 18, marginBottom: 9, letterSpacing: 0.4 },
  photoCard: { alignItems: 'center', gap: 12, paddingVertical: 22 },
  photoHint: { color: C.muted, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  applicationRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  applicationTeam: { color: C.white, fontWeight: '800' },
  applicationMeta: { color: C.muted, fontSize: 12, marginTop: 3 },
  warning: { borderColor: `${C.amber}66`, marginTop: 14 },
  warningText: { color: C.amber, fontSize: 12, lineHeight: 18 },
  textarea: { minHeight: 84, textAlignVertical: 'top' },
  footnote: { color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 14, lineHeight: 18 },
  successIcon: { alignItems: 'center', marginTop: 30 },
  successTitle: { color: C.white, fontSize: 24, fontWeight: '900', textAlign: 'center', marginTop: 16 },
  successText: { color: C.muted, lineHeight: 21, textAlign: 'center', marginTop: 10, marginBottom: 28 },
  spaced: { marginTop: 10 },
});
