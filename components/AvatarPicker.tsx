/**
 * Circular avatar with a tap-to-change action.
 *
 * Uploads immediately rather than on form submit, so a slow connection does not
 * hold up the rest of the form and the user sees the photo they will actually
 * get. The uploaded URL is handed back to the parent.
 */

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { C } from '@/constants/theme';
import { pickImage, takePhoto, uploadAvatar } from '@/src/lib/storage';

export function AvatarPicker({
  userId,
  value,
  onChange,
  onError,
  size = 104,
  label = 'Add a photo',
}: {
  userId: string;
  value: string | null;
  onChange: (url: string | null) => void;
  onError?: (message: string) => void;
  size?: number;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  const handle = async (source: 'library' | 'camera') => {
    setBusy(true);
    try {
      const picked = source === 'camera' ? await takePhoto() : await pickImage();
      if (!picked) return;
      const url = await uploadAvatar(userId, picked.uri);
      onChange(url);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'That image could not be uploaded.');
    } finally {
      setBusy(false);
    }
  };

  const choose = () => {
    // The camera is not meaningfully available in a browser tab, so on web we
    // go straight to the file picker.
    if (Platform.OS === 'web') return void handle('library');

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take a photo', 'Choose from library', ...(value ? ['Remove photo'] : [])],
          cancelButtonIndex: 0,
          destructiveButtonIndex: value ? 3 : undefined,
        },
        (index) => {
          if (index === 1) void handle('camera');
          if (index === 2) void handle('library');
          if (index === 3 && value) onChange(null);
        },
      );
      return;
    }

    void handle('library');
  };

  return (
    <View style={s.wrap}>
      <Pressable
        onPress={choose}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={value ? 'Change your photo' : 'Add a photo'}
        style={({ pressed }) => [
          s.avatar,
          { width: size, height: size, borderRadius: size / 3.2 },
          pressed && s.pressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={C.green} />
        ) : value ? (
          <Image source={{ uri: value }} style={[s.image, { borderRadius: size / 3.2 }]} />
        ) : (
          <Ionicons name="camera-outline" size={size / 3} color={C.muted} />
        )}

        {!busy ? (
          <View style={s.badge}>
            <Ionicons name={value ? 'pencil' : 'add'} size={13} color="#052117" />
          </View>
        ) : null}
      </Pressable>

      <Text style={s.label}>{busy ? 'Uploading…' : value ? 'Tap to change' : label}</Text>

      {value && Platform.OS !== 'ios' ? (
        <Pressable onPress={() => onChange(null)} hitSlop={8}>
          <Text style={s.remove}>Remove photo</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 9 },
  avatar: {
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  image: { width: '100%', height: '100%' },
  pressed: { opacity: 0.75 },
  badge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: C.bg,
  },
  label: { color: C.muted, fontSize: 12 },
  remove: { color: C.red, fontSize: 12, fontWeight: '700' },
});
