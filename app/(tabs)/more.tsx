import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Pill, Screen, Section } from '@/components/UI';
import { C } from '@/constants/theme';
import { pendingCount, subscribeToQueue } from '@/src/data/queue';
import { tournaments } from '@/src/data/repo';
import { useAuth } from '@/src/store/auth';

const ROLE_LABEL: Record<string, string> = {
  platform_admin: 'Platform admin',
  tournament_admin: 'Tournament admin',
  scorer: 'Scorer',
  umpire: 'Umpire',
  team_manager: 'Team manager',
  captain: 'Captain',
  player: 'Player',
  fan: 'Fan',
  stream_operator: 'Stream operator',
};

export default function More() {
  const { user, profile, memberships, activeOrg, role, can, setActiveOrg, signOut } = useAuth();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    void pendingCount().then(setPending);
    return subscribeToQueue((items) => setPending(items.length));
  }, []);

  const leagues = useQuery({ queryKey: ['tournaments'], queryFn: () => tournaments.list() });
  const firstLeague = leagues.data?.[0];

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You can keep following scores without an account.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  return (
    <Screen>
      <Text style={s.title}>More</Text>

      {user ? (
        <Pressable onPress={() => router.push('/profile')} style={({ pressed }) => pressed && s.pressed}>
          <Card style={s.profileCard}>
            <View style={s.avatar}>
              <Text style={s.initials}>
                {(profile?.full_name || user.email || '?').slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={s.flex}>
              <Text style={s.profileName} numberOfLines={1}>
                {profile?.full_name || 'Your profile'}
              </Text>
              <Text style={s.profileMeta} numberOfLines={1}>
                {user.email ?? user.phone ?? ''}
              </Text>
            </View>
            {role ? <Pill text={ROLE_LABEL[role] ?? role} tone="green" /> : null}
          </Card>
        </Pressable>
      ) : (
        <Card style={s.signedOut}>
          <Text style={s.signedOutTitle}>You are browsing as a guest</Text>
          <Text style={s.signedOutText}>
            Sign in to score matches, manage squads or run a competition.
          </Text>
          <Button title="Sign in" onPress={() => router.push('/(auth)/sign-in')} />
        </Card>
      )}

      {pending > 0 ? (
        <Card style={s.pendingCard}>
          <View style={s.pendingHead}>
            <Ionicons name="cloud-offline-outline" size={17} color={C.amber} />
            <Text style={s.pendingTitle}>
              {pending} ball{pending === 1 ? '' : 's'} waiting to sync
            </Text>
          </View>
          <Text style={s.pendingText}>
            Recorded on this device and safe. They upload automatically as soon as you have a
            connection.
          </Text>
        </Card>
      ) : null}

      {memberships.length > 1 ? (
        <Section title="Your organisations">
          {memberships.map((org) => (
            <Pressable key={org.id} onPress={() => void setActiveOrg(org.id)}>
              <Card style={[s.orgRow, org.id === activeOrg?.id && s.orgRowActive]}>
                <View style={s.flex}>
                  <Text style={s.orgName}>{org.name}</Text>
                  <Text style={s.orgRole}>{ROLE_LABEL[org.role] ?? org.role}</Text>
                </View>
                {org.id === activeOrg?.id ? (
                  <Ionicons name="checkmark-circle" size={20} color={C.green} />
                ) : null}
              </Card>
            </Pressable>
          ))}
        </Section>
      ) : null}

      <Section title="For players and fans">
        <MenuItem
          icon="person-add-outline"
          label="Register as a player"
          detail="Join a squad — an organiser confirms you"
          onPress={() => router.push('/join-team')}
        />
        <MenuItem
          icon="heart-outline"
          label="Following"
          detail="Your teams, competitions and players"
          onPress={() => router.push('/following')}
        />
      </Section>

      <Section title="Manage">
        <MenuItem
          icon="construct-outline"
          label="Organiser console"
          detail="Competitions, squads, officials"
          onPress={() => router.push('/organizer')}
        />
        {can.manageTournaments ? (
          <>
            <MenuItem
              icon="checkmark-done-outline"
              label="Player registrations"
              detail="Approve people applying to join a squad"
              onPress={() => router.push('/organizer/approvals')}
            />
            <MenuItem
              icon="clipboard-outline"
              label="Scorers & umpires"
              detail="Appoint officials to a fixture"
              onPress={() => router.push('/organizer/officials')}
            />
          </>
        ) : null}
        {can.manageSquads ? (
          <MenuItem
            icon="people-outline"
            label="Teams & players"
            detail="Build squads and rosters"
            onPress={() => router.push('/organizer/squads')}
          />
        ) : null}
        {firstLeague ? (
          <MenuItem
            icon="chatbubbles-outline"
            label="Tournament chat"
            detail={firstLeague.name}
            onPress={() => router.push(`/chat/${firstLeague.id}`)}
          />
        ) : null}
        <MenuItem
          icon="notifications-outline"
          label="Notifications"
          onPress={() => router.push('/notifications')}
        />
      </Section>

      <Section title="About">
        <Card style={s.about}>
          <Text style={s.aboutTitle}>Cricket Arena</Text>
          <Text style={s.aboutText}>
            Every score in this app is derived from the ball-by-ball record, so scorecards, points
            tables and career figures can never drift apart. Scoring works offline and syncs when
            you are back in signal.
          </Text>
        </Card>
      </Section>

      {user ? (
        <Button title="Sign out" secondary icon="log-out-outline" onPress={confirmSignOut} style={s.signOut} />
      ) : null}
    </Screen>
  );
}

function MenuItem({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && s.pressed}>
      <Card style={s.menuItem}>
        <View style={s.menuIcon}>
          <Ionicons name={icon} size={19} color={C.green} />
        </View>
        <View style={s.flex}>
          <Text style={s.menuLabel}>{label}</Text>
          {detail ? (
            <Text style={s.menuDetail} numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={17} color={C.muted} />
      </Card>
    </Pressable>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  title: { color: C.white, fontSize: 26, fontWeight: '900', marginTop: 34, marginBottom: 18 },
  pressed: { opacity: 0.8 },

  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: C.card2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { color: C.lime, fontWeight: '900', fontSize: 18 },
  profileName: { color: C.white, fontWeight: '900', fontSize: 16 },
  profileMeta: { color: C.muted, fontSize: 12, marginTop: 3 },

  signedOut: { gap: 12 },
  signedOutTitle: { color: C.white, fontWeight: '900', fontSize: 16 },
  signedOutText: { color: C.muted, lineHeight: 20 },

  pendingCard: { marginTop: 12, borderColor: `${C.amber}55`, gap: 7 },
  pendingHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pendingTitle: { color: C.amber, fontWeight: '900', fontSize: 13 },
  pendingText: { color: C.muted, fontSize: 12, lineHeight: 18 },

  orgRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  orgRowActive: { borderColor: C.green },
  orgName: { color: C.white, fontWeight: '800' },
  orgRole: { color: C.muted, fontSize: 12, marginTop: 3 },

  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, paddingVertical: 14 },
  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: C.card2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { color: C.white, fontWeight: '800' },
  menuDetail: { color: C.muted, fontSize: 12, marginTop: 3 },

  about: { gap: 8 },
  aboutTitle: { color: C.white, fontWeight: '900' },
  aboutText: { color: C.muted, lineHeight: 20, fontSize: 13 },

  signOut: { marginTop: 26 },
});
