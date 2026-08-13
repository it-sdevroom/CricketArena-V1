import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  ErrorNotice,
  Input,
  Loading,
  Pill,
  Screen,
  Segmented,
} from '@/components/UI';
import { C } from '@/constants/theme';
import { registrations } from '@/src/data/repo';
import type { RegistrationRow, TeamRow } from '@/src/data/types';
import { useAuth } from '@/src/store/auth';
import { describeError } from '@/src/lib/supabase';

type Tab = 'pending' | 'reviewed';

/**
 * The organiser's queue for player self-registrations.
 *
 * Approving calls a database function rather than writing the tables from here:
 * creating the player, adding them to the squad and closing the application
 * have to succeed or fail together, and the check that the caller really is an
 * administrator belongs next to the writes it guards.
 */
export default function Approvals() {
  const { activeOrg, can } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('pending');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const pending = useQuery({
    queryKey: ['registrations-pending', activeOrg?.id],
    queryFn: () => registrations.pending(activeOrg!.id),
    enabled: !!activeOrg,
  });

  const reviewed = useQuery({
    queryKey: ['registrations-reviewed', activeOrg?.id],
    queryFn: () => registrations.reviewed(activeOrg!.id),
    enabled: !!activeOrg && tab === 'reviewed',
  });

  if (!activeOrg) {
    return (
      <Screen>
        <EmptyState
          icon="business-outline"
          title="No organisation"
          message="Create an organisation before you can receive player registrations."
        />
      </Screen>
    );
  }

  if (!can.manageTournaments) {
    return (
      <Screen>
        <EmptyState
          icon="lock-closed-outline"
          title="Not permitted"
          message="Only a tournament administrator can approve player registrations."
        />
      </Screen>
    );
  }

  const refreshAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ['registrations-pending', activeOrg.id] });
    await queryClient.invalidateQueries({ queryKey: ['registrations-reviewed', activeOrg.id] });
    await queryClient.invalidateQueries({ queryKey: ['players', activeOrg.id] });
  };

  const approve = async (application: RegistrationRow, note: string) => {
    setBusyId(application.id);
    setError(null);
    try {
      await registrations.approve(application.id, note.trim() || undefined);
      await refreshAll();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusyId(null);
    }
  };

  const reject = (application: RegistrationRow, note: string) => {
    Alert.alert(
      'Reject this registration?',
      `${application.full_name} will be told, and can apply again later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setBusyId(application.id);
            setError(null);
            try {
              await registrations.reject(application.id, note.trim() || undefined);
              await refreshAll();
            } catch (e) {
              setError(describeError(e));
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  const list = tab === 'pending' ? pending : reviewed;

  return (
    <Screen refreshing={list.isFetching} onRefresh={() => void list.refetch()}>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'pending', label: `Waiting${pending.data?.length ? ` (${pending.data.length})` : ''}` },
          { value: 'reviewed', label: 'Decided' },
        ]}
      />

      {error ? <ErrorNotice message={error} /> : null}

      <View style={s.list}>
        {list.isLoading ? (
          <Loading />
        ) : list.data?.length ? (
          list.data.map((application) => (
            <ApplicationCard
              key={application.id}
              application={application}
              busy={busyId === application.id}
              readOnly={tab === 'reviewed'}
              onApprove={(note) => void approve(application, note)}
              onReject={(note) => reject(application, note)}
            />
          ))
        ) : (
          <EmptyState
            icon={tab === 'pending' ? 'checkmark-done-outline' : 'archive-outline'}
            title={tab === 'pending' ? 'Nothing waiting' : 'Nothing decided yet'}
            message={
              tab === 'pending'
                ? 'When a player registers for one of your teams, their application lands here.'
                : 'Approved and rejected applications are kept here as a record.'
            }
          />
        )}
      </View>
    </Screen>
  );
}

function ApplicationCard({
  application,
  busy,
  readOnly,
  onApprove,
  onReject,
}: {
  application: RegistrationRow & { team: TeamRow | null };
  busy: boolean;
  readOnly: boolean;
  onApprove: (note: string) => void;
  onReject: (note: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState('');

  const age = application.date_of_birth
    ? Math.floor(
        (Date.now() - new Date(application.date_of_birth).getTime()) / (365.25 * 24 * 3600 * 1000),
      )
    : null;

  return (
    <Card style={s.card}>
      <Pressable onPress={() => setExpanded((open) => !open)} style={s.head}>
        {application.photo_url ? (
          <Image source={{ uri: application.photo_url }} style={s.avatar} />
        ) : (
          <View style={[s.avatar, s.avatarEmpty]}>
            <Text style={s.initials}>{application.full_name.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}

        <View style={s.flex}>
          <Text style={s.name} numberOfLines={1}>
            {application.full_name}
          </Text>
          <Text style={s.meta} numberOfLines={1}>
            {application.team?.name ?? 'Team'} • {application.role.replace(/_/g, ' ')}
            {application.jersey_number != null ? ` • #${application.jersey_number}` : ''}
          </Text>
        </View>

        {readOnly ? (
          <Pill
            text={application.status.toUpperCase()}
            tone={application.status === 'approved' ? 'green' : 'red'}
          />
        ) : (
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={C.muted} />
        )}
      </Pressable>

      {expanded || readOnly ? (
        <View style={s.detail}>
          <Detail label="Batting" value={application.batting_style.replace('_', ' ')} />
          <Detail
            label="Bowling"
            value={
              application.bowling_style === 'none'
                ? 'Does not bowl'
                : application.bowling_style.replace(/_/g, ' ')
            }
          />
          {age != null ? <Detail label="Age" value={`${age}`} /> : null}
          {application.phone ? <Detail label="Phone" value={application.phone} /> : null}
          <Detail label="Applied" value={new Date(application.created_at).toLocaleDateString()} />

          {application.note ? (
            <View style={s.noteBox}>
              <Text style={s.noteLabel}>THEIR NOTE</Text>
              <Text style={s.noteText}>{application.note}</Text>
            </View>
          ) : null}

          {application.review_note ? (
            <View style={s.noteBox}>
              <Text style={s.noteLabel}>YOUR NOTE</Text>
              <Text style={s.noteText}>{application.review_note}</Text>
            </View>
          ) : null}

          {!readOnly ? (
            <>
              <Input
                label="NOTE BACK TO THEM (OPTIONAL)"
                value={note}
                onChangeText={setNote}
                placeholder="Welcome — training is Thursdays at 7."
                multiline
                style={s.textarea}
              />
              <View style={s.actions}>
                <Button
                  title="Reject"
                  secondary
                  onPress={() => onReject(note)}
                  disabled={busy}
                  style={s.flex}
                />
                <Button
                  title="Approve"
                  icon="checkmark"
                  onPress={() => onApprove(note)}
                  loading={busy}
                  style={s.flex}
                />
              </View>
              <Text style={s.approveHint}>
                Approving creates their player record, adds them to the squad and links their
                account so their statistics accumulate.
              </Text>
            </>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  list: { marginTop: 18, gap: 10 },
  card: { gap: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 16, backgroundColor: C.card2 },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: C.lime, fontWeight: '900', fontSize: 18 },
  name: { color: C.white, fontWeight: '900' },
  meta: { color: C.muted, fontSize: 12, marginTop: 3, textTransform: 'capitalize' },

  detail: { marginTop: 16, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 14, gap: 9 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  detailLabel: { color: C.muted, fontSize: 12 },
  detailValue: { color: C.white, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },

  noteBox: { backgroundColor: C.card2, borderRadius: 12, padding: 12, marginTop: 6 },
  noteLabel: { color: C.muted, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, marginBottom: 5 },
  noteText: { color: C.white, fontSize: 13, lineHeight: 19 },

  textarea: { minHeight: 68, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: 10 },
  approveHint: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 10 },
});
