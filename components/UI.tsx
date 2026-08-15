/**
 * Shared UI kit.
 *
 * Keeps the dark-green matchday look of the original prototype while adding the
 * primitives the real screens need: forms, loading and empty states, list rows
 * and the score furniture used across the match centre and scoring console.
 */

import { ReactNode, forwardRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C } from '@/constants/theme';

type Tone = 'green' | 'red' | 'amber' | 'blue' | 'muted' | 'lime';

const toneColor: Record<Tone, string> = {
  green: C.green,
  red: C.red,
  amber: C.amber,
  blue: C.blue,
  muted: C.muted,
  lime: C.lime,
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  padded = true,
  safeTop = false,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  padded?: boolean;
  /**
   * Pad past the status bar. Tab screens hide the navigation header, so nothing
   * else reserves that space and content would draw underneath the clock.
   * Stack screens have a header that already handles the inset.
   */
  safeTop?: boolean;
  style?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  const topPad = safeTop ? { paddingTop: insets.top + 8 } : null;
  if (!scroll) {
    return <View style={[s.screen, padded && s.screenPad, topPad, style]}>{children}</View>;
  }
  return (
    <ScrollView
      style={s.screenBg}
      contentContainerStyle={[s.screenPad, s.screenScroll, topPad, style]}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.green} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Section({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children?: ReactNode;
}) {
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <Text style={s.h2}>{title}</Text>
        {action ? (
          <Pressable onPress={onAction} hitSlop={8}>
            <Text style={s.link}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function Divider() {
  return <View style={s.divider} />;
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={s.center}>
      <ActivityIndicator color={C.green} />
      <Text style={s.muted}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  icon = 'cricket',
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon?: keyof typeof Ionicons.glyphMap | 'cricket';
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card style={s.empty}>
      <Ionicons name={icon === 'cricket' ? 'trophy-outline' : icon} size={30} color={C.muted} />
      <Text style={s.emptyTitle}>{title}</Text>
      {message ? <Text style={s.emptyMessage}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <View style={s.emptyAction}>
          <Button title={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </Card>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={s.errorCard}>
      <View style={s.errorHead}>
        <Ionicons name="alert-circle" size={18} color={C.red} />
        <Text style={s.errorTitle}>Something went wrong</Text>
      </View>
      <Text style={s.emptyMessage}>{message}</Text>
      {onRetry ? (
        <View style={s.emptyAction}>
          <Button title="Try again" secondary onPress={onRetry} />
        </View>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export function Pill({ text, tone = 'green' }: { text: string; tone?: Tone }) {
  const color = toneColor[tone];
  return (
    <View style={[s.pill, { backgroundColor: `${color}22` }]}>
      <Text style={[s.pillText, { color }]}>{text}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  secondary = false,
  danger = false,
  disabled = false,
  loading = false,
  icon,
  style,
}: {
  title: string;
  onPress?: () => void;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      disabled={inactive}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        s.btn,
        secondary && s.btn2,
        danger && s.btnDanger,
        inactive && s.disabled,
        pressed && s.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? C.white : '#052117'} size="small" />
      ) : (
        <View style={s.btnInner}>
          {icon ? (
            <Ionicons name={icon} size={17} color={secondary || danger ? C.white : '#052117'} />
          ) : null}
          <Text style={[s.btnText, (secondary || danger) && s.btnText2]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export const Input = forwardRef<TextInput, TextInputProps & { label?: string; hint?: string; error?: string }>(
  ({ label, hint, error, style, ...props }, ref) => (
    <View style={s.field}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={C.muted}
        style={[s.input, error ? s.inputError : null, style]}
        {...props}
      />
      {error ? <Text style={s.fieldError}>{error}</Text> : hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  ),
);
Input.displayName = 'Input';

/**
 * A password field with a reveal toggle.
 *
 * Typing a password blind on a phone keyboard is where most failed sign-ins
 * actually come from, so the eye is not a nicety. It defaults to hidden and
 * never reveals on its own.
 */
export function PasswordInput({
  label,
  value,
  onChangeText,
  placeholder,
  autoComplete,
  hint,
  error,
  onSubmitEditing,
}: {
  label?: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  autoComplete?: TextInputProps['autoComplete'];
  hint?: string;
  error?: string;
  onSubmitEditing?: () => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={s.field}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={s.passwordRow}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.muted}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete}
          onSubmitEditing={onSubmitEditing}
          style={[s.input, s.passwordInput, error ? s.inputError : null]}
        />
        <Pressable
          onPress={() => setVisible((v) => !v)}
          style={s.reveal}
          hitSlop={10}
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        >
          <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={19} color={C.muted} />
        </Pressable>
      </View>
      {error ? <Text style={s.fieldError}>{error}</Text> : hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Horizontal segmented selector. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={s.segmented}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[s.segment, active && s.segmentActive]}
          >
            <Text style={[s.segmentText, active && s.segmentTextActive]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Wrapping set of selectable chips, used for picking players and options. */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  tone = 'green',
}: {
  options: { value: T; label: string; sublabel?: string; disabled?: boolean }[];
  value: T | null;
  onChange: (value: T) => void;
  tone?: Tone;
}) {
  const color = toneColor[tone];
  return (
    <View style={s.chipGroup}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            disabled={option.disabled}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: option.disabled }}
            style={[
              s.chip,
              active && { backgroundColor: `${color}26`, borderColor: color },
              option.disabled && s.disabled,
            ]}
          >
            <Text style={[s.chipText, active && { color }]} numberOfLines={1}>
              {option.label}
            </Text>
            {option.sublabel ? <Text style={s.chipSub}>{option.sublabel}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Match furniture
// ---------------------------------------------------------------------------

export function Hero({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <LinearGradient
      colors={['#1A5C49', '#09231D']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.hero}
    >
      <View style={s.heroBadge}>
        <Ionicons name="radio" color={C.lime} size={15} />
        <Text style={s.eyebrow}>{eyebrow}</Text>
      </View>
      <Text style={s.heroTitle}>{title}</Text>
      <Text style={s.sub}>{subtitle}</Text>
    </LinearGradient>
  );
}

export function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <Card style={s.stat}>
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={s.statLabel}>{label}</Text>
    </Card>
  );
}

/** One ball on the this-over strip. */
export function BallChip({ label, tone }: { label: string; tone?: Tone }) {
  const color = tone ? toneColor[tone] : null;
  return (
    <View style={[s.ball, color ? { backgroundColor: color } : null]}>
      <Text style={[s.ballText, color ? { color: '#052117' } : null]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  right,
  rightSub,
  leadingColor,
  rank,
  onPress,
}: {
  title: string;
  subtitle?: string;
  right?: string;
  rightSub?: string;
  leadingColor?: string;
  rank?: number;
  onPress?: () => void;
}) {
  const body = (
    <View style={s.row}>
      {rank != null ? <Text style={s.rank}>{rank}</Text> : null}
      {leadingColor ? <View style={[s.dot, { backgroundColor: leadingColor }]} /> : null}
      <View style={s.rowMain}>
        <Text style={s.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={s.rowSub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? (
        <View style={s.rowRight}>
          <Text style={s.rowValue}>{right}</Text>
          {rightSub ? <Text style={s.rowSub}>{rightSub}</Text> : null}
        </View>
      ) : null}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={C.muted} /> : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && s.pressed}>
      {body}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  screenBg: { backgroundColor: C.bg },
  screenPad: { padding: 18 },
  screenScroll: { paddingBottom: 120 },

  card: { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 18, padding: 16 },
  section: { marginTop: 22 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  h2: { color: C.white, fontSize: 19, fontWeight: '900' },
  link: { color: C.green, fontWeight: '800' },
  divider: { height: 1, backgroundColor: C.line, marginVertical: 14 },

  center: { paddingVertical: 44, alignItems: 'center', gap: 12 },
  muted: { color: C.muted },

  empty: { alignItems: 'center', gap: 8, paddingVertical: 30 },
  emptyTitle: { color: C.white, fontWeight: '900', fontSize: 16, marginTop: 4 },
  emptyMessage: { color: C.muted, textAlign: 'center', lineHeight: 20 },
  emptyAction: { marginTop: 14, alignSelf: 'stretch' },

  errorCard: { borderColor: `${C.red}55`, gap: 6 },
  errorHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorTitle: { color: C.red, fontWeight: '900' },

  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, alignSelf: 'flex-start' },
  pillText: { fontWeight: '900', fontSize: 11 },

  btn: {
    backgroundColor: C.green,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btn2: { backgroundColor: C.card2, borderWidth: 1, borderColor: C.line },
  btnDanger: { backgroundColor: C.red },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.76 },
  btnText: { fontWeight: '900', color: '#052117' },
  btnText2: { color: C.white },

  passwordRow: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 48 },
  reveal: { position: 'absolute', right: 14, height: '100%', justifyContent: 'center' },
  field: { marginBottom: 14 },
  label: { color: C.muted, fontWeight: '800', fontSize: 12, marginBottom: 7, letterSpacing: 0.4 },
  input: {
    backgroundColor: C.card,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: C.white,
    fontSize: 15,
    minHeight: 48,
  },
  inputError: { borderColor: C.red },
  hint: { color: C.muted, fontSize: 12, marginTop: 6 },
  fieldError: { color: C.red, fontSize: 12, marginTop: 6 },

  segmented: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    padding: 4,
    gap: 4,
  },
  segment: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  segmentActive: { backgroundColor: C.card2 },
  segmentText: { color: C.muted, fontWeight: '800', fontSize: 13 },
  segmentTextActive: { color: C.white },

  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipText: { color: C.white, fontWeight: '800', fontSize: 13 },
  chipSub: { color: C.muted, fontSize: 11, marginTop: 2 },

  hero: { padding: 22, borderRadius: 24, marginBottom: 18, overflow: 'hidden' },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  eyebrow: { color: C.lime, fontWeight: '900', fontSize: 12, letterSpacing: 1.2 },
  heroTitle: { color: C.white, fontWeight: '900', fontSize: 27, marginTop: 10, lineHeight: 33 },
  sub: { color: C.muted, marginTop: 8, lineHeight: 21 },

  stat: { width: '48%', alignItems: 'center', paddingVertical: 18 },
  statValue: { color: C.lime, fontSize: 26, fontWeight: '900' },
  statLabel: { color: C.muted, fontSize: 12, marginTop: 4 },

  ball: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 6,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.card2,
  },
  ballText: { color: C.white, fontWeight: '900', fontSize: 12 },

  row: { minHeight: 58, borderBottomWidth: 1, borderBottomColor: C.line, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { color: C.muted, width: 22, fontWeight: '800' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowMain: { flex: 1 },
  rowTitle: { color: C.white, fontWeight: '800' },
  rowSub: { color: C.muted, fontSize: 12, marginTop: 3 },
  rowRight: { alignItems: 'flex-end' },
  rowValue: { color: C.lime, fontWeight: '900' },
});
