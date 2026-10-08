import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Where the login (including the refresh token) is kept: the iOS Keychain /
 * Android Keystore via expo-secure-store (docs/SECURITY.md S1), never in
 * plain app storage, and only on this phone (left out of backups).
 *
 * - A session is bigger than SecureStore's ~2 KB per item, so it's split
 *   into numbered pieces with a count.
 * - Logins saved by older versions (in AsyncStorage) move over once, so
 *   nobody is signed out by the update.
 * - The iOS Keychain survives deleting the app; a marker in AsyncStorage
 *   (which doesn't) tells a fresh install apart, and the old login is
 *   wiped so a reinstall always starts at a clean sign-in.
 */
const CHUNK = 1800;
const INSTALL_MARKER = 'propittu.installed';
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const countKey = (key: string) => `${key}.n`;
const pieceKey = (key: string, i: number) => `${key}.${i}`;

async function readSecure(key: string): Promise<string | null> {
  const n = Number(await SecureStore.getItemAsync(countKey(key), OPTIONS));
  if (!n) return null;
  const pieces = await Promise.all(
    Array.from({ length: n }, (_, i) => SecureStore.getItemAsync(pieceKey(key, i), OPTIONS)),
  );
  // A missing piece means a half-written login: treat it as signed out.
  return pieces.every((p) => p !== null) ? pieces.join('') : null;
}

async function removeSecure(key: string): Promise<void> {
  const n = Number(await SecureStore.getItemAsync(countKey(key), OPTIONS)) || 0;
  await SecureStore.deleteItemAsync(countKey(key), OPTIONS);
  await Promise.all(
    Array.from({ length: n }, (_, i) => SecureStore.deleteItemAsync(pieceKey(key, i), OPTIONS)),
  );
}

async function writeSecure(key: string, value: string): Promise<void> {
  await removeSecure(key);
  const pieces = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, 'g')) ?? [''];
  for (const [i, p] of pieces.entries())
    await SecureStore.setItemAsync(pieceKey(key, i), p, OPTIONS);
  // The count goes last, so a write cut short reads as no login.
  await SecureStore.setItemAsync(countKey(key), String(pieces.length), OPTIONS);
}

/** Once per launch: move an older login over, or wipe one left from before a reinstall. */
let ready: Promise<void> | null = null;
function prepare(key: string): Promise<void> {
  ready ??= (async () => {
    if (await AsyncStorage.getItem(INSTALL_MARKER)) return;
    const legacy = await AsyncStorage.getItem(key);
    if (legacy) {
      await writeSecure(key, legacy);
      await AsyncStorage.removeItem(key);
    } else {
      await removeSecure(key);
    }
    await AsyncStorage.setItem(INSTALL_MARKER, '1');
  })().catch(() => undefined);
  return ready;
}

/** The storage adapter supabase-js uses for the session. */
export const authStorage =
  Platform.OS === 'web'
    ? AsyncStorage
    : {
        async getItem(key: string) {
          await prepare(key);
          return readSecure(key);
        },
        async setItem(key: string, value: string) {
          await prepare(key);
          await writeSecure(key, value);
        },
        async removeItem(key: string) {
          await prepare(key);
          await removeSecure(key);
        },
      };
