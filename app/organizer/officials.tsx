import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { matchDateLabel } from '@/components/MatchCard';
import {
  Button,
  Card,
  ChipGroup,
  EmptyState,
  ErrorNotice,
  Loading,
  Pill,
  Screen,
  Section,
} from '@/components/UI';
import { C } from '@/constants/theme';
import { matches, organizations } from '@/src/data/repo';
import { useAuth } from '@/src/store/auth';
import { describeError } from '@/src/lib/supabase';

/**
 * Assign a scorer to a match.
 *
 * This is what makes the `scorer` role mean anything: the RLS policy on
 * `deliveries` only lets someone record a ball if they are an administrator of
 * the organisation or named in `match_officials` for that specific match. Until
 * a scorer is assigned here, only admins can score.
 */
export default function Officials() {
  const { activeOrg, can } = useAuth();
  const queryClient = useQueryClient();
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const upcoming = useQuery({
    queryKey: ['org-fixtures', activeOrg?.id],
    queryFn: () =>
      matches.summaries({
        organizationId: activeOrg!.id,
        // Completed matches are included so officials can still be
        // recorded afterwards, which is normal when a game is scored on paper.
        status: ['scheduled', 'toss', 'live', 'innings_break', 'completed'],
        limit: 40,
      }),
    enabled: !!activeOrg,
  });

  const members = useQuery({
    queryKey: ['org-members', activeOrg?.id],
    queryFn: () => organizations.members(activeOrg!.id),
    enabled: !!activeOrg,
  });

  const assigned = useQuery({
    queryKey: ['match-officials', selectedMatch],
    queryFn: () => matches.officials(selectedMatch as string),
    enabled: !!selectedMatch,
  });

  if (!activeOrg) {
    return (
      <Screen>
        <EmptyState icon="business-outline" title="No organisation" message="Create one first." />
      </Screen>
    );
  }

  if (!can.manageTournaments) {
    return (
      <Screen>
        <EmptyState
          icon="lock-closed-outline"
          title="Not permitted"
          message="Only a tournament administrator can appoint officials."
        />
      </Screen>
    );
  }

  const assign = async (userId: string, role: 'scorer' | 'umpire' | 'stream_operator') => {
    if (!selectedMatch) return;
    setBusy(true);
    setError(null);
    try {
      // Give them the organisation-level role too, so the app shows them the
      // scoring entry point at all.
      if (role === 'scorer') {
        const existing = members.data?.find((m) => m.id === userId);
        if (existing && existing.role === 'fan') {
          await organizations.addMember(activeOrg.id, userId, 'scorer');
          await queryClient.invalidateQueries({ queryKey: ['org-members', activeOrg.id] });
        }
      }
      await matches.assignOfficial(selectedMatch, userId, role);
      await queryClient.invalidateQueries({ queryKey: ['match-officials', selectedMatch] });

      const who = members.data?.find((m) => m.id === userId)?.full_name ?? 'They';
      setNotice(`${who} can now ${role === 'scorer' ? 'score this match' : 'umpire this match'}.`);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const match = upcoming.data?.find((m) => m.match_id === selectedMatch);
  const assignedIds = new Set((assigned.data ?? []).map((o: any) => o.profiles?.id));

  return (
    <Screen refreshing={upcoming.isFetching} onRefresh={() => void upcoming.refetch()}>
      <Text style={s.lead}>
        A scorer can only record balls in matches they are named on. Pick a fixture, then choose who
        is scoring it.
      </Text>

      {error ? <ErrorNotice message={error} /> : null}

      <Section title="Fixture">
        {upcoming.isLoading ? (
          <Loading />
        ) : upcoming.data?.length ? (
          <View style={s.fixtures}>
            {upcoming.data.map((fixture) => {
              const active = fixture.match_id === selectedMatch;
              return (
                <Pressable
                  key={fixture.match_id}
                  onPress={() => setSelectedMatch(active ? null : fixture.match_id)}
                  style={({ pressed }) => [s.fixture, active && s.fixtureActive, pressed && s.pressed]}
                >
                  <View style={s.flex}>
                    <Text style={s.fixtureTeams} numberOfLines={1}>
                      {fixture.home_team_short ?? 'TBC'} v {fixture.away_team_short ?? 'TBC'}
                    </Text>
                    <Text style={s.fixtureMeta} numberOfLines={1}>
                      {fixture.label ?? 'Match'} • {matchDateLabel(fixture.scheduled_at)}
                    </Text>
                  </View>
                  {fixture.status !== 'scheduled' ? <Pill text="LIVE" tone="red" /> : null}
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={19}
                    color={active ? C.green : C.muted}
                  />
                </Pressable>
              );
            })}
          </View>
        ) : (
          <EmptyState
            icon="calendar-outline"
            title="No fixtures"
            message="Generate a fixture list for a tournament first."
          />
        )}
      </Section>

      {notice ? <Text style={s.notice}>{notice}</Text> : null}

      {!selectedMatch ? (
        <Card style={s.noneCard}>
          <Text style={s.noneText}>
            Tap a fixture above first. Appointments are per match, so a scorer can be given one
            game without being given every game.
          </Text>
        </Card>
      ) : null}

      {selectedMatch ? (
        <>
          <Section title="Currently appointed">
            {assigned.isLoading ? (
              <Loading />
            ) : assigned.data?.length ? (
              <Card>
                {assigned.data.map((official: any, index: number) => (
                  <View key={`${official.profiles?.id}-${official.role}`} style={s.officialRow}>
                    <Ionicons
                      name={official.role === 'scorer' ? 'baseball-outline' : 'eye-outline'}
                      size={17}
                      color={C.green}
                    />
                    <Text style={s.officialName}>{official.profiles?.full_name || 'Unnamed'}</Text>
                    <Pill text={official.role.replace('_', ' ').toUpperCase()} tone="muted" />
                  </View>
                ))}
              </Card>
            ) : (
              <Card style={s.noneCard}>
                <Text style={s.noneText}>
                  Nobody is appointed. Only organisation administrators can score this match.
                </Text>
              </Card>
            )}
          </Section>

          <Section title="Appoint a scorer">
            {members.isLoading ? (
              <Loading />
            ) : members.data?.length ? (
              <ChipGroup
                value={null}
                onChange={(userId) => void assign(userId, 'scorer')}
                options={members.data.map((member) => ({
                  value: member.id,
                  label: member.full_name || 'Unnamed',
                  sublabel: assignedIds.has(member.id) ? 'already appointed' : member.role.replace(/_/g, ' '),
                  disabled: busy || assignedIds.has(member.id),
                }))}
              />
            ) : (
              <EmptyState
                icon="people-outline"
                title="No members yet"
                message="People appear here once they sign up and join your organisation — for example by registering as a player."
              />
            )}
          </Section>

          <Section title="Appoint an umpire">
            {members.data?.length ? (
              <ChipGroup
                tone="blue"
                value={null}
                onChange={(userId) => void assign(userId, 'umpire')}
                options={members.data.map((member) => ({
                  value: member.id,
                  label: member.full_name || 'Unnamed',
                  disabled: busy,
                }))}
              />
            ) : null}
          </Section>
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  notice: { color: C.green, fontWeight: '800', fontSize: 13, marginBottom: 12 },
  flex: { flex: 1 },
  lead: { color: C.muted, lineHeight: 21 },
  pressed: { opacity: 0.75 },
  fixtures: { gap: 8 },
  fixture: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
  },
  fixtureActive: { borderColor: C.green, backgroundColor: `${C.green}12` },
  fixtureTeams: { color: C.white, fontWeight: '800' },
  fixtureMeta: { color: C.muted, fontSize: 12, marginTop: 3 },
  officialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  officialName: { color: C.white, fontWeight: '800', flex: 1 },
  noneCard: { backgroundColor: C.card2 },
  noneText: { color: C.muted, fontSize: 12, lineHeight: 18 },
});
