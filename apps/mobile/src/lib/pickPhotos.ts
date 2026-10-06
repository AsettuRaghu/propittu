import * as ImagePicker from 'expo-image-picker';
import { Linking } from 'react-native';
import { MAX_VIDEO_SECONDS } from '@propittu/shared';
import { dialog } from '@/components/Dialog';

/**
 * Asks "Take photo" or "Choose from library", then returns the picked
 * images (possibly none). Handles camera permission denial (§40 Photos).
 *
 * The library picker needs no permission on current iOS/Android — the
 * system photo picker runs out-of-process.
 */
export async function pickPhotos(limit: number): Promise<ImagePicker.ImagePickerAsset[]> {
  const source = await dialog.actions({
    title: 'Add photos',
    actions: [
      {
        label: 'Take a photo',
        value: 'camera' as const,
        icon: 'camera',
        description: 'Use the camera now',
      },
      {
        label: 'Choose from library',
        value: 'library' as const,
        icon: 'images',
        description: limit > 1 ? `Pick up to ${limit}` : undefined,
      },
    ],
  });
  // Let the sheet finish closing; iOS refuses to present a picker over a dismissing modal.
  if (source) await new Promise((r) => setTimeout(r, 350));
  if (source === 'camera') return fromCamera();
  if (source === 'library') return fromLibrary(limit);
  return [];
}

async function fromLibrary(limit: number): Promise<ImagePicker.ImagePickerAsset[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    quality: 1, // Compression happens once, in preparePhoto().
    exif: false,
  });
  return result.canceled ? [] : result.assets.slice(0, limit);
}

async function fromCamera(): Promise<ImagePicker.ImagePickerAsset[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    const open = await dialog.confirm({
      title: 'Camera access is off',
      message: 'Allow camera access for Propittu in Settings to take property photos.',
      confirmLabel: 'Open Settings',
      cancelLabel: 'Not now',
      icon: 'camera',
    });
    if (open) void Linking.openSettings();
    return [];
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 1,
    exif: false,
  });
  return result.canceled ? [] : result.assets;
}

/**
 * Picks one video from the library (M3). On iOS, longer clips open the
 * system trimmer at MAX_VIDEO_SECONDS, and Medium quality keeps files
 * well under the 50 MB limit.
 */
export async function pickVideo(): Promise<ImagePicker.ImagePickerAsset | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    allowsMultipleSelection: false,
    allowsEditing: true,
    videoMaxDuration: MAX_VIDEO_SECONDS,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
  });
  return result.canceled ? null : (result.assets[0] ?? null);
}
