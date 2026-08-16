import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  Button,
  Card,
  EmptyState,
  ErrorNotice,
  Input,
  Loading,
  Screen,
  Section,
  Segmented,
} from '@/components/UI';
import { C } from '@/constants/theme';
import { performances, players as playersRepo, scoring } from '@/src/data/repo';
import { useAuth } from '@/src/store/auth';
import { describeError } from '@/src/lib/supabase';

/**
 * Type up the card for a match that was scored on paper.
 *
 * The team totals already give a points table; this is what turns a season into
 * a leaderboard, because "most runs" needs a name against a number.
 *
 * Only offered for innings with no deliveries. Once a ball has been scored in
 * the app the real record is authoritative and typing over it would be a way to
 * quietly rewrite a scorecard.
 */

export default function EnterCard() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { can, activeOrg } = useAuth();
  const queryClient = useQueryClient();

  const [side, setSide] = useState<'first' | 'second'>('first');
  const [name, setName] = useState('');
  const [runs, setRuns] = useState('');
  const [balls, setBalls] = useState('');
  const [fours, setFours] = useState('');
  const [sixes, setSixes] = useState('');
  const [wkts, setWkts] = useState('');
  const [conceded, setConceded] = useState('');
  const [overs, setOvers] = useState('');
  const [mode, setMode] = useState<'batting' | 'bowling'>('batting');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const innings = useQuery({
    queryKey: ['innings', matchId],
    queryFn: () => scoring.innings(matchId as string),
    enabled: !!matchId,
  });

  const squad = useQuery({
    queryKey: ['players', activeOrg?.id],
    queryFn: () => playersRepo.list(activeOrg!.id),
    enabled: !!activeOrg,
  });

  const cards = useQuery({
    queryKey: ['summary-cards', matchId],
    queryFn: () => performances.forMatch(matchId as string),
    enabled: !!matchId,
  });

  if (innings.isLoading) return <Loading label="Loading match…" />;

  if (!can.manageTournaments && !can.score) {
    return (
      <Screen>
        <EmptyState
          icon="lock-closed-outline"
          title="Scorers and organisers only"
          message="Only an official can type up a scorecard."
        />
      </Screen>
    );
  }

  const list = innings.data ?? [];
  const chosen = side === 'first' ? list[0] : list[1];

  if (list.length < 2) {
    return (
      <Screen>
        <EmptyState
          icon="document-outline"
          title="No result recorded yet"
          message="Record the match result first — the team totals — then come back to type in who scored what."
        />
      </Screen>
    );
  }

  /** Accepts "7.1" and converts to balls, because cards are written in overs. */
  const oversToBalls = (value: string): number => {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const [whole, part] = trimmed.split('.');
    return Number(whole || 0) * 6 + Number(part || 0);
  };

  const findPlayer = () => {
    const target = name.trim().toLowerCase();
    return (squad.data ?? []).find(
      (p) => p.full_name.toLowerCase() === target || p.full_name.toLowerCase().includes(target),
    );
  };

  const add = async () => {
    if (!chosen) return;
    const player = findPlayer();
    if (!player) {
      setError(`No player called "${name.trim()}" in this organisation. Add them first.`);
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'batting') {
        await performances.saveBatting({
          innings_id: chosen.id,
          player_id: player.id,
          runs: Number(runs || 0),
          balls: Number(balls || 0),
          fours: Number(fours || 0),
          sixes: Number(sixes || 0),
          is_out: Number(wkts || 0) > 0 ? true : false,
        });
        setNotice(`${player.full_name}: ${runs || 0} off ${balls || 0}`);
      } else {
        await performances.saveBowling({
          innings_id: chosen.id,
          player_id: player.id,
          legal_balls: oversToBalls(overs),
          runs_conceded: Number(conceded || 0),
          wickets: Number(wkts || 0),
        });
        setNotice(`${player.full_name}: ${wkts || 0}/${conceded || 0}`);
      }

      await queryClient.invalidateQueries({ queryKey: ['summary-cards', matchId] });
      setName(''); setRuns(''); setBalls(''); setFours(''); setSixes('');
      setWkts(''); setConceded(''); setOvers('');
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const entered = (cards.data ?? []).filter((c: any) => c.innings_id === chosen?.id);

  return (
    <Screen>
      {error ? <ErrorNotice message={error} /> : null}
      {notice ? <Text style={s.ok}>Saved — {notice}</Text> : null}

      <Text style={s.intro}>
        Type in the figures from the paper card. The leaderboards and averages are computed from
        these, so a season can mix matches scored in the app with matches written up afterwards.
      </Text>

      <View style={s.tabs}>
        <Segmented
          value={side}
          onChange={setSide}
          options={[
            { value: 'first', label: '1st innings' },
            { value: 'second', label: '2nd innings' },
          ]}
        />
      </View>

      <View style={s.tabs}>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'batting', label: 'Batting' },
            { value: 'bowling', label: 'Bowling' },
          ]}
        />
      </View>

      <Section title={mode === 'batting' ? 'Add a batter' : 'Add a bowler'}>
        <Card style={s.form}>
          <Input
            label="PLAYER NAME"
            value={name}
            onChangeText={setName}
            placeholder="Start typing a name from the squad"
          />

          {mode === 'batting' ? (
            <>
              <View style={s.row}>
                <Input label="RUNS" value={runs} onChangeText={setRuns} keyboardType="number-pad" style={s.half} />
                <Input label="BALLS" value={balls} onChangeText={setBalls} keyboardType="number-pad" style={s.half} />
              </View>
              <View style={s.row}>
                <Input label="FOURS" value={fours} onChangeText={setFours} keyboardType="number-pad" style={s.half} />
                <Input label="SIXES" value={sixes} onChangeText={setSixes} keyboardType="number-pad" style={s.half} />
              </View>
              <Input
                label="OUT? 1 FOR OUT, BLANK FOR NOT OUT"
                value={wkts}
                onChangeText={setWkts}
                keyboardType="number-pad"
                placeholder="1"
              />
            </>
          ) : (
            <>
              <View style={s.row}>
                <Input label="OVERS (e.g. 3.4)" value={overs} onChangeText={setOvers} style={s.half} />
                <Input label="RUNS" value={conceded} onChangeText={setConceded} keyboardType="number-pad" style={s.half} />
              </View>
              <Input label="WICKETS" value={wkts} onChangeText={setWkts} keyboardType="number-pad" />
            </>
          )}

          <Button title="Add to the card" onPress={add} loading={busy} />
        </Card>
      </Section>

      <Section title={`Entered so far (${entered.length})`}>
        {entered.length === 0 ? (
          <EmptyState icon="list-outline" title="Nothing yet" message="Add players above." />
        ) : (
          <Card style={s.list}>
            {entered.map((c: any, i: number) => (
              <View key={`${c.kind}-${c.player_id}`} style={[s.entry, i > 0 && s.entryBorder]}>
                <Text style={s.entryName}>{c.full_name}</Text>
                <Text style={s.entryFigures}>
                  {c.kind === 'batting'
                    ? `${c.runs}${c.is_out ? '' : '*'} (${c.balls})`
                    : `${c.wickets}/${c.runs_conceded}`}
                </Text>
              </View>
            ))}
          </Card>
        )}
      </Section>
    </Screen>
  );
}

const s = StyleSheet.create({
  ok: { color: C.green, fontWeight: '800', marginBottom: 12 },
  intro: { color: C.muted, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  tabs: { marginBottom: 12 },
  form: { gap: 4 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  list: { gap: 0 },
  entry: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11 },
  entryBorder: { borderTopWidth: 1, borderTopColor: C.line },
  entryName: { color: C.white, fontWeight: '700', fontSize: 14 },
  entryFigures: { color: C.green, fontWeight: '900', fontSize: 14 },
});
