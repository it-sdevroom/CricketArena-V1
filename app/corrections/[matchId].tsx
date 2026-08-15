import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

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
  Segmented,
} from '@/components/UI';
import { CorrectionLog } from '@/components/CorrectionLog';
import { C } from '@/constants/theme';
import { scoring } from '@/src/data/repo';
import { useAuth } from '@/src/store/auth';
import { useLiveMatch, useNameLookup } from '@/src/store/useMatch';
import { buildCommentary } from '@/src/domain/commentary';
import { describeError } from '@/src/lib/supabase';

/**
 * Fix a ball recorded earlier in the innings.
 *
 * Undo only ever reached the last delivery, which is no help when a mistake is
 * noticed three overs later — and telling an organiser to undo twenty correct
 * balls to reach one wrong one is how scorecards get abandoned halfway.
 *
 * Every change is written to the correction log with a reason, and that log is
 * public. The point is not to prevent corrections but to make them impossible
 * to make quietly.
 */

const RUN_OPTIONS = [0, 1, 2, 3, 4, 6].map((n) => ({ value: String(n), label: String(n) }));

export default function Corrections() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const live = useLiveMatch(matchId);
  const nameOf = useNameLookup(live.squads);

  const [tab, setTab] = useState<'fix' | 'log'>('fix');
  const [selected, setSelected] = useState<string | null>(null);
  const [runs, setRuns] = useState('0');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (live.loading) return <Loading label="Loading match…" />;

  const state = live.currentState;
  const rules = live.rules;

  if (!live.match || !rules) {
    return (
      <Screen>
        <ErrorNotice message="Match not found." onRetry={live.refetch} />
      </Screen>
    );
  }

  const canCorrect = can.score || can.manageTournaments;
  const deliveries = state ? state.overs.flatMap((o) => o.deliveries) : [];
  const lines = state ? buildCommentary(deliveries, rules, (id) => nameOf(id)) : [];
  const chosen = deliveries.find((d) => d.id === selected) ?? null;

  const apply = async () => {
    if (!chosen || !user) return;
    if (reason.trim().length < 3) {
      setError('Give a short reason. It is shown to both teams.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await scoring.correctDelivery(
        chosen.id,
        { runs_off_bat: Number(runs) },
        { matchId: live.match!.id, userId: user.id, reason: reason.trim() },
      );
      await queryClient.invalidateQueries({ queryKey: ['match-deliveries', live.match!.id] });
      await queryClient.invalidateQueries({ queryKey: ['corrections', live.match!.id] });
      live.refetch();
      setSelected(null);
      setReason('');
      Alert.alert('Corrected', 'The change has been recorded in the public correction log.');
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const removeBall = () => {
    if (!chosen || !user) return;
    if (reason.trim().length < 3) {
      setError('Give a short reason before removing a ball.');
      return;
    }
    Alert.alert('Remove this delivery?', 'The scorecard is recalculated without it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await scoring.deleteDelivery(chosen.id, {
              matchId: live.match!.id,
              userId: user.id,
              reason: reason.trim(),
            });
            await queryClient.invalidateQueries({ queryKey: ['match-deliveries', live.match!.id] });
            await queryClient.invalidateQueries({ queryKey: ['corrections', live.match!.id] });
            live.refetch();
            setSelected(null);
            setReason('');
          } catch (e) {
            setError(describeError(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <View style={s.tabs}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'fix', label: 'Correct a ball' },
            { value: 'log', label: 'History' },
          ]}
        />
      </View>

      {error ? <ErrorNotice message={error} /> : null}

      {tab === 'log' ? (
        <Section title="What has been changed">
          <CorrectionLog matchId={live.match.id} />
        </Section>
      ) : !canCorrect ? (
        <EmptyState
          icon="lock-closed-outline"
          title="Scorers and organisers only"
          message="You can still read the history of every change on the other tab."
        />
      ) : !state || deliveries.length === 0 ? (
        <EmptyState
          icon="baseball-outline"
          title="Nothing to correct"
          message="No deliveries have been recorded in this innings yet."
        />
      ) : (
        <>
          <Section title="Pick the ball">
            <Card style={s.list}>
              <ScrollView style={s.scroll} nestedScrollEnabled>
                {lines.map((line) => {
                  const isChosen = line.deliveryId === selected;
                  return (
                    <Pressable
                      key={line.deliveryId}
                      onPress={() => {
                        setSelected(line.deliveryId);
                        const d = deliveries.find((x) => x.id === line.deliveryId);
                        setRuns(String(d?.runsOffBat ?? 0));
                      }}
                      style={[s.line, isChosen && s.lineChosen]}
                    >
                      <Text style={[s.over, isChosen && s.chosenText]}>{line.over}</Text>
                      <Text style={[s.text, isChosen && s.chosenText]} numberOfLines={2}>
                        {line.text}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Card>
          </Section>

          {chosen ? (
            <Section title="The correction">
              <Card style={s.form}>
                <Text style={s.label}>RUNS OFF THE BAT</Text>
                <ChipGroup value={runs} onChange={setRuns} options={RUN_OPTIONS} />

                <Input
                  label="REASON (SHOWN PUBLICLY)"
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Recorded as 2, both umpires agreed it was 1"
                  multiline
                />

                <Button title="Save correction" onPress={apply} loading={busy} />
                <Button title="Remove this ball entirely" danger secondary onPress={removeBall} />
              </Card>
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  tabs: { marginBottom: 16 },
  list: { padding: 0, overflow: 'hidden' },
  scroll: { maxHeight: 320 },
  line: { flexDirection: 'row', gap: 12, padding: 12, alignItems: 'flex-start' },
  lineChosen: { backgroundColor: C.card2 },
  over: { color: C.muted, fontSize: 12, fontWeight: '800', width: 36 },
  text: { color: C.muted, fontSize: 13, flex: 1, lineHeight: 18 },
  chosenText: { color: C.white },
  form: { gap: 4 },
  label: { color: C.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 8 },
});
