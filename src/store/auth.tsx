/**
 * Session and permissions.
 *
 * Holds the Supabase session, the user's profile, and which organisation they
 * are acting in. Screens ask `can.manageTournaments` rather than inspecting
 * roles themselves, so the permission rules live in one place and match the RLS
 * policies in the migrations.
 *
 * Signing in is optional. Fans browse fixtures, live scores and tables without
 * an account, exactly as the read policies allow.
 */

import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { auth as authRepo, organizations } from '@/src/data/repo';
import type { AppRole, OrganizationRow, ProfileRow } from '@/src/data/types';
import { env } from '@/src/lib/env';
import { supabase } from '@/src/lib/supabase';

const ACTIVE_ORG_KEY = 'cricket-arena:active-org';

interface Capabilities {
  /** Create and configure competitions, generate fixtures, assign officials. */
  manageTournaments: boolean;
  /** Add or edit teams and players. */
  manageSquads: boolean;
  /** Record balls in a match they are assigned to. */
  score: boolean;
  /** Post in tournament channels. */
  chat: boolean;
}

interface AuthValue {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: ProfileRow | null;
  /** Organisations the user belongs to, with their role in each. */
  memberships: (OrganizationRow & { role: AppRole })[];
  activeOrg: (OrganizationRow & { role: AppRole }) | null;
  role: AppRole | null;
  can: Capabilities;
  setActiveOrg: (organizationId: string) => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const NO_CAPABILITIES: Capabilities = {
  manageTournaments: false,
  manageSquads: false,
  score: false,
  chat: false,
};

const AuthContext = createContext<AuthValue>({
  loading: true,
  session: null,
  user: null,
  profile: null,
  memberships: [],
  activeOrg: null,
  role: null,
  can: NO_CAPABILITIES,
  setActiveOrg: async () => undefined,
  refresh: async () => undefined,
  signOut: async () => undefined,
});

function capabilitiesFor(role: AppRole | null, isPlatformAdmin: boolean): Capabilities {
  if (isPlatformAdmin) {
    return { manageTournaments: true, manageSquads: true, score: true, chat: true };
  }
  switch (role) {
    case 'tournament_admin':
      return { manageTournaments: true, manageSquads: true, score: true, chat: true };
    case 'team_manager':
      return { manageTournaments: false, manageSquads: true, score: false, chat: true };
    case 'scorer':
      // Whether they may score *this* match is still enforced by RLS via
      // match_officials; this only decides whether to show the entry point.
      return { manageTournaments: false, manageSquads: false, score: true, chat: true };
    case 'umpire':
    case 'captain':
    case 'player':
    case 'stream_operator':
    case 'fan':
      return { ...NO_CAPABILITIES, chat: true };
    default:
      return NO_CAPABILITIES;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [memberships, setMemberships] = useState<(OrganizationRow & { role: AppRole })[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  const loadUserContext = useCallback(async (nextSession: Session | null) => {
    if (!nextSession?.user) {
      setProfile(null);
      setMemberships([]);
      return;
    }
    try {
      const [nextProfile, nextMemberships] = await Promise.all([
        authRepo.getProfile(nextSession.user.id),
        organizations.mine(nextSession.user.id),
      ]);
      setProfile(nextProfile);
      setMemberships(nextMemberships);

      const stored = await AsyncStorage.getItem(ACTIVE_ORG_KEY);
      const valid = nextMemberships.find((m) => m.id === stored);
      setActiveOrgId(valid?.id ?? nextMemberships[0]?.id ?? null);
    } catch (error) {
      // A profile that will not load must not lock the user out of the app;
      // they simply see it as a signed-out experience until it recovers.
      console.warn('Could not load user context', error);
    }
  }, []);

  useEffect(() => {
    if (!env.isConfigured) {
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadUserContext(data.session);
      if (active) setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      await loadUserContext(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadUserContext]);

  const setActiveOrg = useCallback(async (organizationId: string) => {
    setActiveOrgId(organizationId);
    await AsyncStorage.setItem(ACTIVE_ORG_KEY, organizationId);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await loadUserContext(data.session);
  }, [loadUserContext]);

  const signOut = useCallback(async () => {
    await authRepo.signOut();
    setSession(null);
    setProfile(null);
    setMemberships([]);
    setActiveOrgId(null);
    await AsyncStorage.removeItem(ACTIVE_ORG_KEY);
  }, []);

  const value = useMemo<AuthValue>(() => {
    const activeOrg = memberships.find((m) => m.id === activeOrgId) ?? null;
    const role = activeOrg?.role ?? null;
    return {
      loading,
      session,
      user: session?.user ?? null,
      profile,
      memberships,
      activeOrg,
      role,
      can: capabilitiesFor(role, profile?.is_platform_admin ?? false),
      setActiveOrg,
      refresh,
      signOut,
    };
  }, [loading, session, profile, memberships, activeOrgId, setActiveOrg, refresh, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  return useContext(AuthContext);
}
