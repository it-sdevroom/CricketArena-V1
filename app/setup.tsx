import { Ionicons } from '@expo/vector-icons';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Screen } from '@/components/UI';
import { C } from '@/constants/theme';
import { configurationProblem } from '@/src/lib/env';

/**
 * Shown when no Supabase project is connected. Rather than crashing on the
 * first query, the app explains exactly what is missing and how to fix it —
 * this is the first screen anyone sees after cloning the repository.
 */
export default function Setup() {
  const problem = configurationProblem();

  const steps: { title: string; detail: string }[] = [
    {
      title: 'Create a free Supabase project',
      detail: 'Go to supabase.com, create a project, and wait for it to finish provisioning.',
    },
    {
      title: 'Run the migrations',
      detail:
        'Open the SQL editor and paste the contents of supabase/migrations in filename order, then supabase/seed.sql for demo data.',
    },
    {
      title: 'Copy your keys',
      detail: 'Project settings → API. You need the Project URL and the anon public key.',
    },
    {
      title: 'Fill in .env',
      detail:
        'Copy .env.example to .env, paste both values, then restart with: npx expo start --clear',
    },
  ];

  return (
    <Screen>
      <View style={s.badge}>
        <Ionicons name="link-outline" size={22} color={C.amber} />
      </View>
      <Text style={s.title}>Connect your backend</Text>
      <Text style={s.lead}>
        Cricket Arena stores every ball in your own Supabase project so scores sync live between
        phones. {problem}
      </Text>

      {steps.map((step, index) => (
        <Card key={step.title} style={s.step}>
          <View style={s.stepHead}>
            <View style={s.stepNumber}>
              <Text style={s.stepNumberText}>{index + 1}</Text>
            </View>
            <Text style={s.stepTitle}>{step.title}</Text>
          </View>
          <Text style={s.stepDetail}>{step.detail}</Text>
        </Card>
      ))}

      <Card style={s.env}>
        <Text style={s.envLabel}>.env</Text>
        <Text style={s.code}>EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co</Text>
        <Text style={s.code}>EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi…</Text>
      </Card>

      <Button
        title="Open supabase.com"
        icon="open-outline"
        onPress={() => Linking.openURL('https://supabase.com/dashboard')}
      />
      <Text style={s.footnote}>
        The anon key is safe to ship in the app. Row level security in the migrations is what
        protects your data.
      </Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  badge: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: `${C.amber}22`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: C.white, fontSize: 26, fontWeight: '900', marginTop: 16 },
  lead: { color: C.muted, lineHeight: 22, marginTop: 10, marginBottom: 22 },
  step: { marginBottom: 10 },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: C.card2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { color: C.green, fontWeight: '900', fontSize: 12 },
  stepTitle: { color: C.white, fontWeight: '800', flex: 1 },
  stepDetail: { color: C.muted, lineHeight: 20, marginTop: 8 },
  env: { marginTop: 12, marginBottom: 20, gap: 6 },
  envLabel: { color: C.green, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  code: { color: C.white, fontFamily: 'monospace', fontSize: 12 },
  footnote: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 16, textAlign: 'center' },
});
