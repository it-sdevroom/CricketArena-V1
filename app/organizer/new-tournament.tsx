import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, ChipGroup, ErrorNotice, Input, Screen, Segmented } from '@/components/UI';
import { C } from '@/constants/theme';
import { tournaments } from '@/src/data/repo';
import { RULE_PRESETS } from '@/src/domain/types';
import { useAuth } from '@/src/store/auth';
import { describeError } from '@/src/lib/supabase';

const FORMATS = [
  { value: 'round_robin', label: 'Round robin', detail: 'Every side plays every other once.' },
  { value: 'double_round_robin', label: 'Double round robin', detail: 'Home and away against everyone.' },
  { value: 'groups', label: 'Group stage', detail: 'Split into balanced groups.' },
  { value: 'knockout', label: 'Knockout', detail: 'Straight elimination bracket.' },
  { value: 'league_playoffs', label: 'League + play-offs', detail: 'League, then qualifiers and a final.' },
] as const;

const MATCH_FORMATS = [
  { value: 'T10', label: 'T10' },
  { value: 'T20', label: 'T20' },
  { value: 'ODI', label: 'ODI' },
  { value: 'TAPE_BALL', label: 'Tape ball' },
] as const;

export default function NewTournament() {
  const { user, activeOrg } = useAuth();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [season, setSeason] = useState(String(new Date().getFullYear()));
  const [format, setFormat] = useState<(typeof FORMATS)[number]['value']>('round_robin');
  const [matchFormat, setMatchFormat] = useState<(typeof MATCH_FORMATS)[number]['value']>('T20');
  const [description, setDescription] = useState('');
  const [groupCount, setGroupCount] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rules = RULE_PRESETS[matchFormat];
  const slug = `${name} ${season}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const create = async () => {
    if (!activeOrg || !user) return;
    setBusy(true);
    setError(null);
    try {
      const created = await tournaments.create({
        organization_id: activeOrg.id,
        name: name.trim(),
        slug,
        season: season.trim() || null,
        format,
        match_format: matchFormat,
        description: description.trim() || null,
        status: 'active',
        is_public: true,
        // Only meaningful for the group format; one group elsewhere keeps the
        // fixture generator's arithmetic honest.
        group_count: format === 'groups' ? groupCount : 1,
        start_date: new Date().toISOString().slice(0, 10),
        // Playing conditions come from the chosen format so the scoring engine
        // and the database agree from the first ball.
        overs_per_innings: rules.oversPerInnings,
        balls_per_over: rules.ballsPerOver,
        wide_runs: rules.wideRuns,
        no_ball_runs: rules.noBallRuns,
        free_hit_after_no_ball: rules.freeHitAfterNoBall,
        players_per_side: rules.playersPerSide,
        max_overs_per_bowler: rules.maxOversPerBowler,
        created_by: user.id,
      });
      await queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      router.replace(`/tournament/${created.id}`);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!activeOrg) {
    return (
      <Screen>
        <ErrorNotice message="Create an organisation first from the organiser console." />
        <Button title="Organiser console" onPress={() => router.replace('/organizer')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={s.lead}>
        Playing conditions are set from the match format you pick, and every fixture inherits them.
      </Text>

      {error ? <ErrorNotice message={error} /> : null}

      <Input
        label="TOURNAMENT NAME"
        value={name}
        onChangeText={setName}
        placeholder="Riyadh Premier League"
      />
      <Input label="SEASON" value={season} onChangeText={setSeason} placeholder="2026" />

      <Text style={s.label}>MATCH FORMAT</Text>
      <Segmented
        value={matchFormat}
        onChange={setMatchFormat}
        options={MATCH_FORMATS.map((f) => ({ value: f.value, label: f.label }))}
      />

      <Card style={s.rulesCard}>
        <Text style={s.rulesTitle}>Playing conditions</Text>
        <View style={s.ruleRow}>
          <Text style={s.ruleLabel}>Overs an innings</Text>
          <Text style={s.ruleValue}>{rules.oversPerInnings ?? 'Unlimited'}</Text>
        </View>
        <View style={s.ruleRow}>
          <Text style={s.ruleLabel}>Max overs per bowler</Text>
          <Text style={s.ruleValue}>{rules.maxOversPerBowler ?? 'No limit'}</Text>
        </View>
        <View style={s.ruleRow}>
          <Text style={s.ruleLabel}>Free hit after a no ball</Text>
          <Text style={s.ruleValue}>{rules.freeHitAfterNoBall ? 'Yes' : 'No'}</Text>
        </View>
        <View style={s.ruleRow}>
          <Text style={s.ruleLabel}>Players a side</Text>
          <Text style={s.ruleValue}>{rules.playersPerSide}</Text>
        </View>
      </Card>

      <Text style={s.label}>TOURNAMENT STRUCTURE</Text>
      <ChipGroup
        value={format}
        onChange={setFormat}
        options={FORMATS.map((f) => ({ value: f.value, label: f.label }))}
      />
      <Text style={s.hint}>{FORMATS.find((f) => f.value === format)?.detail}</Text>

      {format === 'groups' ? (
        <>
          <Text style={s.label}>NUMBER OF GROUPS</Text>
          <Segmented
            value={String(groupCount)}
            onChange={(v) => setGroupCount(Number(v))}
            options={[2, 3, 4, 6, 8].map((n) => ({ value: String(n), label: String(n) }))}
          />
          <Text style={s.hint}>
            Teams are shared out with a snake draft, so the groups stay balanced however many you
            enter. With {groupCount} groups, 16 teams gives {16 / groupCount} per group and{' '}
            {groupCount * (((16 / groupCount) * (16 / groupCount - 1)) / 2)} group matches.
          </Text>
        </>
      ) : null}

      <Input
        label="DESCRIPTION (OPTIONAL)"
        value={description}
        onChangeText={setDescription}
        placeholder="Six-team T20 league played across two grounds."
        multiline
        numberOfLines={3}
        style={s.textarea}
      />

      <Button
        title="Create tournament"
        onPress={create}
        loading={busy}
        disabled={name.trim().length < 3}
      />
      <Text style={s.footnote}>
        Next: register your teams, then generate the fixture list from the tournament page.
      </Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  lead: { color: C.muted, lineHeight: 21, marginBottom: 22 },
  label: { color: C.muted, fontWeight: '800', fontSize: 12, marginBottom: 9, marginTop: 8, letterSpacing: 0.4 },
  hint: { color: C.muted, fontSize: 12, marginTop: 9, marginBottom: 18 },
  rulesCard: { marginTop: 14, marginBottom: 8, gap: 9 },
  rulesTitle: { color: C.white, fontWeight: '900', fontSize: 13, marginBottom: 2 },
  ruleRow: { flexDirection: 'row', justifyContent: 'space-between' },
  ruleLabel: { color: C.muted, fontSize: 12 },
  ruleValue: { color: C.white, fontSize: 12, fontWeight: '800' },
  textarea: { minHeight: 84, textAlignVertical: 'top' },
  footnote: { color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 16, lineHeight: 18 },
});
