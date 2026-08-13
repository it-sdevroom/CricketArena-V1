/**
 * Names the playing eleven for both sides before a match can be scored.
 *
 * The batting order set here seeds the "who is in next" suggestions in the
 * scoring console, so it is worth getting right, but it is not binding — the
 * scorer can send anyone in at any point.
 */

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, ErrorNotice, Loading, Segmented } from '@/components/UI';
import { C } from '@/constants/theme';
import { matches, teams } from '@/src/data/repo';
import type { MatchRow } from '@/src/data/types';
import { describeError } from '@/src/lib/supabase';

export function XiPicker({ match, onDone }: { match: MatchRow; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<'home' | 'away'>('home');
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teamId = side === 'home' ? match.home_team_id : match.away_team_id;

  const squad = useQuery({
    queryKey: ['squad', teamId],
    queryFn: () => teams.squad(teamId as string),
    enabled: !!teamId && open,
  });

  const homeTeam = useQuery({
    queryKey: ['team', match.home_team_id],
    queryFn: () => teams.get(match.home_team_id as string),
    enabled: !!match.home_team_id,
  });
  const awayTeam = useQuery({
    queryKey: ['team', match.away_team_id],
    queryFn: () => teams.get(match.away_team_id as string),
    enabled: !!match.away_team_id,
  });

  if (!open) {
    return (
      <Button
        title="Name the playing elevens"
        icon="people-outline"
        onPress={() => setOpen(true)}
      />
    );
  }

  const chosen = (teamId && selected[teamId]) || [];
  const limit = match.players_per_side || 11;

  const toggle = (playerId: string) => {
    if (!teamId) return;
    const current = selected[teamId] ?? [];
    const next = current.includes(playerId)
      ? current.filter((x) => x !== playerId)
      : current.length >= limit
        ? current
        : [...current, playerId];
    setSelected({ ...selected, [teamId]: next });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      for (const [team, playerIds] of Object.entries(selected)) {
        if (!playerIds.length) continue;
        await matches.setPlayingXi(
          match.id,
          team,
          playerIds.map((playerId, index) => ({ playerId, battingOrder: index + 1 })),
        );
      }
      setOpen(false);
      onDone();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const bothNamed =
    !!match.home_team_id &&
    !!match.away_team_id &&
    (selected[match.home_team_id]?.length ?? 0) >= 2 &&
    (selected[match.away_team_id]?.length ?? 0) >= 2;

  return (
    <Card style={s.card}>
      <Text style={s.title}>Name the playing elevens</Text>
      <Text style={s.lead}>
        Tap players in batting order. You need at least two per side to start, and up to {limit}.
      </Text>

      <Segmented
        value={side}
        onChange={setSide}
        options={[
          { value: 'home', label: homeTeam.data?.short_name ?? 'Home' },
          { value: 'away', label: awayTeam.data?.short_name ?? 'Away' },
        ]}
      />

      {error ? <ErrorNotice message={error} /> : null}

      <Text style={s.count}>
        {chosen.length} of {limit} selected
      </Text>

      {squad.isLoading ? (
        <Loading />
      ) : squad.data?.length ? (
        <View style={s.list}>
          {squad.data.map((player) => {
            const index = chosen.indexOf(player.id);
            const picked = index >= 0;
            return (
              <Pressable
                key={player.id}
                onPress={() => toggle(player.id)}
                style={({ pressed }) => [s.row, picked && s.rowPicked, pressed && s.pressed]}
              >
                <View style={[s.order, picked && s.orderPicked]}>
                  <Text style={[s.orderText, picked && s.orderTextPicked]}>
                    {picked ? index + 1 : '·'}
                  </Text>
                </View>
                <View style={s.flex}>
                  <Text style={s.name} numberOfLines={1}>
                    {player.display_name || player.full_name}
                  </Text>
                  <Text style={s.meta}>
                    {player.role.replace(/_/g, ' ')}
                    {player.is_captain ? ' • captain' : ''}
                    {player.is_wicket_keeper ? ' • keeper' : ''}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={s.meta}>
          This team has no squad yet. Add players under Teams &amp; players first.
        </Text>
      )}

      <View style={s.actions}>
        <Button title="Cancel" secondary onPress={() => setOpen(false)} style={s.flex} />
        <Button title="Save elevens" onPress={save} loading={busy} disabled={!bothNamed} style={s.flex} />
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  card: { gap: 12 },
  flex: { flex: 1 },
  title: { color: C.white, fontWeight: '900', fontSize: 16 },
  lead: { color: C.muted, fontSize: 12, lineHeight: 18 },
  count: { color: C.green, fontSize: 12, fontWeight: '800' },
  list: { gap: 7 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 11,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card2,
  },
  rowPicked: { borderColor: C.green, backgroundColor: `${C.green}14` },
  pressed: { opacity: 0.75 },
  order: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderPicked: { backgroundColor: C.green },
  orderText: { color: C.muted, fontWeight: '900', fontSize: 12 },
  orderTextPicked: { color: '#052117' },
  name: { color: C.white, fontWeight: '800', fontSize: 13 },
  meta: { color: C.muted, fontSize: 11, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
});
