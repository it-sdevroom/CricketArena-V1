import { useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { C } from '@/constants/theme';
import { pickImage, takePhoto } from '@/src/lib/storage';

/**
 * Pick a picture and hand the local URI back to the caller.
 *
 * Uploading is deliberately not done here: different callers write to
 * different buckets under different ownership rules, and this component has no
 * business knowing which. It shows a preview and reports the chosen file.
 *
 * The camera option is hidden on web, where `launchCameraAsync` opens a file
 * dialog indistinguishable from the gallery one.
 */
export function PhotoField({
  label,
  value,
  onChange,
  onError,
  shape = 'circle',
  busy = false,
  hint,
}: {
  label: string;
  /** Existing remote URL, or a freshly picked local URI. */
  value: string | null;
  onChange: (uri: string | null) => void;
  onError?: (message: string) => void;
  shape?: 'circle' | 'square';
  busy?: boolean;
  hint?: string;
}) {
  const [working, setWorking] = useState(false);

  const run = async (action: () => Promise<{ uri: string } | null>) => {
    setWorking(true);
    try {
      const picked = await action();
      if (picked) onChange(picked.uri);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Could not open the picker.');
    } finally {
      setWorking(false);
    }
  };

  const showSpinner = working || busy;
  const radius = shape === 'circle' ? 44 : 14;

  return (
    <View style={s.wrap}>
      <Text style={s.label}>{label}</Text>

      <View style={s.row}>
        <View style={[s.preview, { borderRadius: radius }]}>
          {value ? (
            <Image source={{ uri: value }} style={[s.image, { borderRadius: radius }]} />
          ) : (
            <Ionicons name="image-outline" size={26} color={C.muted} />
          )}
          {showSpinner ? (
            <View style={[s.overlay, { borderRadius: radius }]}>
              <ActivityIndicator color={C.green} />
            </View>
          ) : null}
        </View>

        <View style={s.actions}>
          <Pressable
            style={s.action}
            disabled={showSpinner}
            onPress={() => run(pickImage)}
            accessibilityRole="button"
          >
            <Ionicons name="images-outline" size={16} color={C.green} />
            <Text style={s.actionText}>Choose</Text>
          </Pressable>

          {Platform.OS !== 'web' ? (
            <Pressable style={s.action} disabled={showSpinner} onPress={() => run(takePhoto)}>
              <Ionicons name="camera-outline" size={16} color={C.green} />
              <Text style={s.actionText}>Camera</Text>
            </Pressable>
          ) : null}

          {value ? (
            <Pressable style={s.action} disabled={showSpinner} onPress={() => onChange(null)}>
              <Ionicons name="trash-outline" size={16} color={C.red} />
              <Text style={[s.actionText, { color: C.red }]}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: 18, gap: 10 },
  label: { color: C.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  row: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  preview: {
    width: 88,
    height: 88,
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: 88, height: 88 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00000088',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { gap: 8, flex: 1 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    alignSelf: 'flex-start',
  },
  actionText: { color: C.green, fontWeight: '800', fontSize: 13 },
  hint: { color: C.muted, fontSize: 12, lineHeight: 17 },
});
