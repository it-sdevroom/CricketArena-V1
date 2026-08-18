import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, ErrorNotice } from '@/components/UI';
import { C } from '@/constants/theme';
import { matches, scoring } from '@/src/data/repo';
import { describeError } from '@/src/lib/supabase';
import type { MatchRow } from '@/src/data/types';

/**
 * The toss, and starting the match.
 *
 * Every match begins the same way and the app was skipping it: the scoring
 * console simply asked who was batting, losing the fact of who won the toss and
 * what they chose. That is on every scorecard ever printed, and it decides
 * which side bats first — so it belongs here, before a ball is bowled, not as
 * an afterthought.
 *
 * Two taps: who won it, and what they chose. The batting order follows from
 * those, so nobody has to work it out under pressure.
 */
export function TossDialog({
  visible,
  onClose,
  onStarted,
  match,
  homeName,
  awayName,
}: {
  visible: boolean;
  onClose: () => void;
  onStarted: () => void;
  match: MatchRow;
  homeName: string;
  awayName: string;
}) {
  const [winner, setWinner] = useState<string | null>(null);
  const [decision, setDecision] = useState<'bat' | 'bowl' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameFor = (id: string | null) =>
    id === match.home_team_id ? homeName : id === match.away_team_id ? awayName : 'Team';

  // Whoever won the toss bats if they chose to; otherwise the other side does.
  const battingFirst =
    winner && decision
      ? decision === 'bat'
        ? winner
        : winner === match.home_team_id
          ? match.away_team_id
          : match.home_team_id
      : null;

  const start = async () => {
    if (!winner || !decision || !battingFirst) return;

    setBusy(true);
    setError(null);
    try {
      await matches.update(match.id, {
        toss_winner_team_id: winner,
        toss_decision: decision,
        status: 'live',
      });

      await scoring.startInnings({
        matchId: match.id,
        inningsNumber: 1,
        battingTeamId: battingFirst,
        bowlingTeamId:
          battingFirst === match.home_team_id ? match.away_team_id! : match.home_team_id!,
      });

      onStarted();
      onClose();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <ScrollView contentContainerStyle={s.content}>
            <Text style={s.title}>Start the match</Text>
            <Text style={s.sub}>
              {homeName} v {awayName}
            </Text>

            {error ? <ErrorNotice message={error} /> : null}

            <Text style={s.label}>WHO WON THE TOSS?</Text>
            <View style={s.choices}>
              {[match.home_team_id, match.away_team_id].map((id) =>
                id ? (
                  <Button
                    key={id}
                    title={nameFor(id)}
                    secondary={winner !== id}
                    onPress={() => setWinner(id)}
                    style={s.choice}
                  />
                ) : null,
              )}
            </View>

            {winner ? (
              <>
                <Text style={s.label}>AND THEY CHOSE TO</Text>
                <View style={s.choices}>
                  <Button
                    title="Bat first"
                    secondary={decision !== 'bat'}
                    onPress={() => setDecision('bat')}
                    style={s.choice}
                  />
                  <Button
                    title="Bowl first"
                    secondary={decision !== 'bowl'}
                    onPress={() => setDecision('bowl')}
                    style={s.choice}
                  />
                </View>
              </>
            ) : null}

            {battingFirst ? (
              <Card style={s.summary}>
                <Text style={s.summaryLine}>
                  <Text style={s.strong}>{nameFor(winner)}</Text> won the toss and chose to{' '}
                  <Text style={s.strong}>{decision}</Text>.
                </Text>
                <Text style={s.summaryLine}>
                  <Text style={s.strong}>{nameFor(battingFirst)}</Text> bat first.
                </Text>
              </Card>
            ) : null}

            <Button
              title="Start match"
              onPress={start}
              loading={busy}
              disabled={!winner || !decision}
            />
            <Button title="Not yet" secondary onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000BB', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '90%',
    borderTopWidth: 1,
    borderColor: C.line,
  },
  content: { padding: 22, paddingBottom: 40, gap: 10 },
  title: { color: C.white, fontWeight: '900', fontSize: 21 },
  sub: { color: C.muted, fontSize: 14, marginBottom: 10 },
  label: { color: C.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginTop: 8 },
  choices: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  choice: { flex: 1 },
  summary: { gap: 6, marginVertical: 10 },
  summaryLine: { color: C.muted, fontSize: 14, lineHeight: 20 },
  strong: { color: C.white, fontWeight: '800' },
});
