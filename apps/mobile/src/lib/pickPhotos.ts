import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking } from 'react-native';
import { MAX_VIDEO_SECONDS } from '@propittu/shared';

/**
 * Asks "Take photo" or "Choose from library", then returns the picked
 * images (possibly none). Handles camera permission denial (§40 Photos).
 *
 * The library picker needs no permission on current iOS/Android — the
 * system photo picker runs out-of-process.
 */
export function pickPhotos(limit: number): Promise<ImagePicker.ImagePickerAsset[]> {
  return new Promise((resolve) => {
    Alert.alert('Add photos', undefined, [
      { text: 'Take photo', onPress: () => void fromCamera().then(resolve) },
      { text: 'Choose from library', onPress: () => void fromLibrary(limit).then(resolve) },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve([]) },
    ]);
  });
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
    Alert.alert(
      'Camera access is off',
      'Allow camera access for Propittu in Settings to take property photos.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ],
    );
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
