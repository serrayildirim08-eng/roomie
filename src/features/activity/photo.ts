// Photo proof plumbing — pick (camera or library) and upload to Instant
// storage under the household's path prefix, which is what the $files perms
// gate on. Returns plain references; activityEvents stores them as fields.

import { id } from '@instantdb/react-native';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import { db } from '@/lib/db';

// households/{hid}/photos/{uuid}.jpg — the prefix IS the security boundary
// (see $files rules), so householdId must always be the first segment.
export function photoPath(householdId: string): string {
  return `households/${householdId}/photos/${id()}.jpg`;
}

const PICKER_OPTS: ImagePicker.ImagePickerOptions = {
  mediaTypes: 'images',
  quality: 0.6, // proof, not art — keep uploads light
  allowsEditing: false,
};

// Camera-or-library chooser. Resolves null on cancel or permission denial
// (denial gets a soft nudge, never a dead end).
export function pickPhoto(): Promise<string | null> {
  return new Promise((resolve) => {
    Alert.alert('Add a photo', undefined, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      {
        text: 'Photo library',
        onPress: () => {
          void (async () => {
            const res = await ImagePicker.launchImageLibraryAsync(PICKER_OPTS);
            resolve(res.canceled ? null : (res.assets[0]?.uri ?? null));
          })();
        },
      },
      {
        text: 'Camera',
        onPress: () => {
          void (async () => {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
              Alert.alert('No camera access', 'You can allow it in Settings, or pick from the library.');
              return resolve(null);
            }
            const res = await ImagePicker.launchCameraAsync(PICKER_OPTS);
            resolve(res.canceled ? null : (res.assets[0]?.uri ?? null));
          })();
        },
      },
    ]);
  });
}

// Upload a local image uri; returns the $files reference or null on failure.
export async function uploadActivityPhoto(
  householdId: string,
  uri: string,
): Promise<{ fileId: string; path: string } | null> {
  try {
    const path = photoPath(householdId);
    // SDK 56: global fetch reads local files, so a File handle uploads directly
    // (Instant's documented React Native path).
    const file = new File(uri);
    const res = await db.storage.uploadFile(path, file as unknown as Blob, {
      contentType: 'image/jpeg',
    });
    const fileId = (res as { data?: { id?: string } })?.data?.id;
    return fileId ? { fileId, path } : null;
  } catch {
    return null;
  }
}
