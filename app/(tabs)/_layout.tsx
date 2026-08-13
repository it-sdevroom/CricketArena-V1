import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { C } from '@/constants/theme';
import { env } from '@/src/lib/env';

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home',
  matches: 'radio',
  tournaments: 'trophy',
  stats: 'stats-chart',
  more: 'grid',
};

export default function TabsLayout() {
  // Nothing in the app works without a backend, so route to the setup guide
  // before any screen has a chance to fire a query.
  if (!env.isConfigured) return <Redirect href="/setup" />;

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: C.green,
        tabBarInactiveTintColor: C.muted,
        tabBarStyle: {
          height: 72,
          paddingTop: 8,
          backgroundColor: '#09201A',
          borderTopColor: C.line,
        },
        tabBarLabelStyle: { fontWeight: '700', paddingBottom: 7 },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={icons[route.name] ?? 'ellipse'} color={color} size={size} />
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="matches" options={{ title: 'Matches' }} />
      <Tabs.Screen name="tournaments" options={{ title: 'Tournaments' }} />
      <Tabs.Screen name="stats" options={{ title: 'Stats' }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}
