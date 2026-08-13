import { Stack } from 'expo-router';

import { C } from '@/constants/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.white,
        contentStyle: { backgroundColor: C.bg },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
      <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
    </Stack>
  );
}
