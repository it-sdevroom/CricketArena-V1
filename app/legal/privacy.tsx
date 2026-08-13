import { StyleSheet, Text, View } from 'react-native';

import { Card, Screen, Section } from '@/components/UI';
import { C } from '@/constants/theme';
import { env } from '@/src/lib/env';

/**
 * The privacy policy.
 *
 * Both stores require a reachable policy URL, and Google's Data safety form
 * has to match what the app actually does. Keeping the text in the app — and
 * reachable on the public web build at /legal/privacy — means the URL you
 * submit and the behaviour you ship come from the same place.
 */

const UPDATED = 'August 2026';

export default function Privacy() {
  return (
    <Screen>
      <Text style={s.updated}>Last updated {UPDATED}</Text>

      <Text style={s.lead}>
        Cricket Arena runs local cricket competitions. This policy explains what the app stores,
        why, and how to remove it.
      </Text>

      <Section title="What is collected">
        <Card style={s.card}>
          <Row
            label="Account"
            body="Your email address or phone number, and a password held as a hash by our authentication provider. We never see your password."
          />
          <Row
            label="Profile"
            body="Your name, and optionally your city, date of birth, phone number and a profile photo — only what you type in yourself."
          />
          <Row
            label="Cricket activity"
            body="Squads you join, and every ball recorded in matches you take part in or score. This is the competition's record, not personal browsing data."
          />
          <Row
            label="Diagnostics"
            body="Nothing. There is no analytics SDK, no advertising identifier and no third-party tracker in this app."
          />
        </Card>
      </Section>

      <Section title="What is public">
        <Card style={s.card}>
          <Text style={s.body}>
            Cricket is played in public and its results are public. Your player name, squad,
            profile photo and match statistics are visible to anyone who opens a competition you
            appear in, including people who are not signed in. Your email address, phone number
            and date of birth are never shown to other users.
          </Text>
          <Text style={s.body}>
            A tournament marked private is visible only to members of the organisation running it.
          </Text>
        </Card>
      </Section>

      <Section title="Who it is shared with">
        <Card style={s.card}>
          <Text style={s.body}>
            Nobody. Data is not sold, rented or shared with advertisers. It is stored in a Supabase
            project operated by whoever runs this installation of the app, and access is enforced
            by database-level security rules rather than by the app alone.
          </Text>
          {env.isConfigured ? (
            <Text style={s.mono}>{env.supabaseUrl}</Text>
          ) : null}
        </Card>
      </Section>

      <Section title="Your control">
        <Card style={s.card}>
          <Row label="Correct it" body="Edit your profile at any time from the profile screen." />
          <Row
            label="Delete it"
            body="Profile → Danger zone → Delete my account. Your login, profile, follows and notifications are removed immediately."
          />
          <Row
            label="What survives deletion"
            body="Scorecards of matches already played. Those runs belong to the match and to the other players in it, so they remain — detached from your account and from your contact details."
          />
        </Card>
      </Section>

      <Section title="Children">
        <Card style={s.card}>
          <Text style={s.body}>
            Junior cricketers are usually registered by a club official rather than signing up
            themselves. If you are under 13, ask a parent, guardian or team manager to register you
            and to contact the organiser about any data you want removed.
          </Text>
        </Card>
      </Section>

      <Section title="Contact">
        <Card style={s.card}>
          <Text style={s.body}>
            Questions or removal requests go to the organisation running your competition — their
            administrators are listed on the tournament page.
          </Text>
        </Card>
      </Section>

      <Text style={s.footer}>
        Cricket Arena is open source. You can read exactly what it stores by reading the database
        migrations in the repository.
      </Text>
    </Screen>
  );
}

function Row({ label, body }: { label: string; body: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.body}>{body}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  updated: { color: C.muted, fontSize: 12, marginBottom: 12 },
  lead: { color: C.white, fontSize: 15, lineHeight: 22, marginBottom: 8 },
  card: { gap: 16 },
  row: { gap: 5 },
  rowLabel: { color: C.green, fontWeight: '900', fontSize: 12, letterSpacing: 0.6 },
  body: { color: C.muted, fontSize: 13, lineHeight: 20 },
  mono: { color: C.muted, fontSize: 11, fontFamily: 'monospace' },
  footer: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 8, marginBottom: 30 },
});
