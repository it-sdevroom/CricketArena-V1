import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, ChipGroup, ErrorNotice, Input } from '@/components/UI';
import { C } from '@/constants/theme';
import { interruptions } from '@/src/data/repo';
import { describeError } from '@/src/lib/supabase';
import { formatOvers } from '@/src/domain/scoring';
import type { InningsState, MatchRules } from '@/src/domain/types';

/**
 * Record a stoppage and, if the innings is being cut short, the revised target.
 *
 * Deliberately *manual*. The real Duckworth-Lewis-Stern tables are licensed by
 * the ICC and cannot be reimplemented here, so the app does what club cricket
 * actually does: the organiser and both captains agree a number, and the app
 * records it along with who decided and why. An unexplained revised target is
 * how disputes start, so the note travels with the numbers.
 */

const KINDS = [
  { value: 'rain', label: 'Rain' },
  { value: 'bad_light', label: 'Bad light' },
  { value: 'ground_conditions', label: 'Ground' },
  { value: 'injury', label: 'Injury' },
  { value: 'other', label: 'Other' },
];

export function RainDialog({
  visible,
  onClose,
  onApplied,
  matchId,
  inningsId,
  state,
  rules,
  currentMaxOvers,
  userId,
}: {
  visible: boolean;
  onClose: () => void;
  onApplied: () => void;
  matchId: string;
  inningsId: string;
  state: InningsState;
  rules: MatchRules;
  currentMaxOvers: number | null;
  userId: string;
}) {
  const [kind, setKind] = useState('rain');
  const [overs, setOvers] = useState(String(currentMaxOvers ?? ''));
  const [target, setTarget] = useState(state.target != null ? String(state.target) : '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const oversNumber = overs.trim() === '' ? null : Number(overs);
  const targetNumber = target.trim() === '' ? null : Number(target);

  const oversValid =
    oversNumber === null ||
    (Number.isFinite(oversNumber) &&
      oversNumber > 0 &&
      oversNumber * rules.ballsPerOver >= state.legalBalls);

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      await interruptions.applyRevision({
        matchId,
        inningsId,
        kind,
        oversAfter: oversNumber,
        targetAfter: targetNumber,
        oversBefore: currentMaxOvers,
        targetBefore: state.target,
        runsAtStop: state.runs,
        wicketsAtStop: state.wickets,
        ballsAtStop: state.legalBalls,
        note: note.trim() || null,
        method: 'manual',
        userId,
      });
      onApplied();
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
            <Text style={s.title}>Stoppage</Text>
            <Text style={s.sub}>
              Play stopped at {state.runs}/{state.wickets} after{' '}
              {formatOvers(state.legalBalls, rules.ballsPerOver)} overs.
            </Text>

            {error ? <ErrorNotice message={error} /> : null}

            <Text style={s.label}>REASON</Text>
            <ChipGroup value={kind} onChange={setKind} options={KINDS} />

            <Input
              label="INNINGS REDUCED TO (OVERS)"
              value={overs}
              onChangeText={setOvers}
              keyboardType="number-pad"
              placeholder={String(currentMaxOvers ?? 20)}
            />
            {!oversValid ? (
              <Text style={s.warn}>
                That is fewer overs than have already been bowled (
                {formatOvers(state.legalBalls, rules.ballsPerOver)}).
              </Text>
            ) : null}

            {state.target != null ? (
              <Input
                label="REVISED TARGET"
                value={target}
                onChangeText={setTarget}
                keyboardType="number-pad"
                placeholder={String(state.target)}
              />
            ) : null}

            <Input
              label="NOTE (WHO AGREED, AND HOW)"
              value={note}
              onChangeText={setNote}
              placeholder="Agreed with both captains — DLS par 96"
              multiline
            />

            <Text style={s.hint}>
              Cricket Arena does not calculate Duckworth-Lewis-Stern: those tables are licensed and
              cannot be included. Enter the figure you and the captains agreed, and it is recorded
              against your name.
            </Text>

            <Button title="Apply" onPress={apply} loading={busy} disabled={!oversValid} />
            <Button title="Cancel" secondary onPress={onClose} />
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
    maxHeight: '92%',
    borderTopWidth: 1,
    borderColor: C.line,
  },
  content: { padding: 22, paddingBottom: 40, gap: 4 },
  title: { color: C.white, fontWeight: '900', fontSize: 20 },
  sub: { color: C.muted, fontSize: 13, marginBottom: 14, lineHeight: 19 },
  label: { color: C.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 8 },
  warn: { color: C.amber, fontSize: 12, marginTop: -10, marginBottom: 12, lineHeight: 17 },
  hint: { color: C.muted, fontSize: 12, lineHeight: 18, marginBottom: 16, marginTop: 4 },
});
