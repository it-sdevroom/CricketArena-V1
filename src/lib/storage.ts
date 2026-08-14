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
 * Shrink and re-encode as JPEG before upload.
 *
 * A modern phone camera produces several megabytes; nobody needs more than
 * 512px for an avatar or a crest. Doing this client-side also means far less to
 * upload over ground-level mobile data at a cricket ground.
 */
async function normalise(
  uri: string,
  maxWidth = 512,
): Promise<{ uri: string; contentType: string }> {
  const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: maxWidth } }], {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: result.uri, contentType: 'image/jpeg' };
}

/**
 * Resize, upload and return a public URL.
 *
 * `folder` is the first path segment, and every storage policy keys off it:
 * the avatars bucket expects a user id, team logos and match media expect an
 * organisation id. Getting it wrong is a permission error, not a silent
 * mis-file.
 */
async function uploadImage(options: {
  bucket: string;
  folder: string;
  prefix: string;
  localUri: string;
  maxWidth?: number;
  maxBytes?: number;
}): Promise<string> {
  const { bucket, folder, prefix, localUri, maxWidth = 512, maxBytes = 2 * 1024 * 1024 } = options;
  const { uri, contentType } = await normalise(localUri, maxWidth);

  const response = await fetch(uri);
  if (!response.ok) throw new Error('Could not read the selected image.');
  const bytes = await response.arrayBuffer();

  if (bytes.byteLength > maxBytes) {
    throw new Error('That image is too large even after resizing. Try a different one.');
  }

  // A changing filename busts any CDN cache of the previous image.
  const path = `${folder}/${prefix}-${Date.now()}.jpg`;

  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) throw error;

  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** A team crest. Stored per organisation, so managers can maintain their own. */
export async function uploadTeamLogo(organizationId: string, localUri: string): Promise<string> {
  return uploadImage({
    bucket: 'team-logos',
    folder: organizationId,
    prefix: 'logo',
    localUri,
    maxWidth: 512,
    maxBytes: 1024 * 1024,
  });
}

/** A match photograph or highlight still. Allowed to be larger than an avatar. */
export async function uploadMatchPhoto(organizationId: string, localUri: string): Promise<string> {
  return uploadImage({
    bucket: 'match-media',
    folder: organizationId,
    prefix: 'photo',
    localUri,
    maxWidth: 1600,
    maxBytes: 10 * 1024 * 1024,
  });
}

/**
 * Upload an avatar and return its public URL.
 * `upsert` means re-uploading replaces the previous photo rather than piling up.
 */
export async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  return uploadImage({ bucket: BUCKET, folder: userId, prefix: 'avatar', localUri });
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
