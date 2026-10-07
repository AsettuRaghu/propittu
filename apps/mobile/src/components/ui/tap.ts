import * as Haptics from 'expo-haptics';

/** A light selection haptic for taps on buttons, tabs and chips. */
export const tap = () => void Haptics.selectionAsync().catch(() => undefined);
