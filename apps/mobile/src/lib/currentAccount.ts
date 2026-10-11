import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Which of the person's accounts the app is showing — their own, or
 * family's they were invited to. Sent with every API request; kept on this
 * phone (lost → the person's own account, which is the safe default).
 */
const KEY = 'propittu.account';
let current: string | null = null;
let loaded = false;

export async function loadCurrentAccount(): Promise<string | null> {
  if (!loaded) {
    loaded = true;
    try {
      current = await AsyncStorage.getItem(KEY);
    } catch {
      current = null;
    }
  }
  return current;
}

export function currentAccount(): string | null {
  return current;
}

export async function setCurrentAccount(id: string | null): Promise<void> {
  current = id;
  loaded = true;
  try {
    if (id) await AsyncStorage.setItem(KEY, id);
    else await AsyncStorage.removeItem(KEY);
  } catch {
    // Kept for this session only.
  }
}
