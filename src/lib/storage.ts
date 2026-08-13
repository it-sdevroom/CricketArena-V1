/**
 * Avatar uploads.
 *
 * The same code runs on a phone and in the browser, which is the awkward part:
 * expo-image-picker hands back a `file://` URI on native and a `blob:` URL on
 * web. `fetch` resolves both, so converting to an ArrayBuffer is the one path
 * that works everywhere — the Supabase JS client cannot take a React Native
 * file object directly.
 *
 * Every object is stored under `<user-id>/…`, which is what the storage policy
 * in migration 0003 checks. A user can only ever write into their own folder.
 */

import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from './supabase';

const BUCKET = 'avatars';

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
}

/** Ask for a photo from the library. Returns null if the user backs out. */
export async function pickImage(): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo access was declined. Enable it in your device settings to add a picture.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.9,
  });

  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

export async function takePhoto(): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Camera access was declined. Enable it in your device settings to take a picture.');
  }

  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.9,
  });

  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

/**
 * Shrink to 512px and re-encode as JPEG before upload.
 *
 * A modern phone camera produces several megabytes; the bucket caps objects at
 * 2 MB and nobody needs more than 512px for an avatar. Doing this client-side
 * also means less to upload over ground-level mobile data.
 */
async function normalise(uri: string): Promise<{ uri: string; contentType: string }> {
  const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 512 } }], {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: result.uri, contentType: 'image/jpeg' };
}

/**
 * Upload an avatar and return its public URL.
 * `upsert` means re-uploading replaces the previous photo rather than piling up.
 */
export async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  const { uri, contentType } = await normalise(localUri);

  const response = await fetch(uri);
  if (!response.ok) throw new Error('Could not read the selected image.');
  const bytes = await response.arrayBuffer();

  if (bytes.byteLength > 2 * 1024 * 1024) {
    throw new Error('That image is too large even after resizing. Try a different one.');
  }

  // A changing filename busts any CDN cache of the previous photo.
  const path = `${userId}/avatar-${Date.now()}.jpg`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Remove every avatar this user has uploaded. */
export async function clearAvatars(userId: string): Promise<void> {
  const { data, error } = await supabase.storage.from(BUCKET).list(userId);
  if (error) throw error;
  if (!data?.length) return;

  const { error: removeError } = await supabase.storage
    .from(BUCKET)
    .remove(data.map((file) => `${userId}/${file.name}`));
  if (removeError) throw removeError;
}
