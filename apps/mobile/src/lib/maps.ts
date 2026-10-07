import { Linking, Platform, Share } from 'react-native';
import { dialog } from '@/components/Dialog';

/** Directions to a point, in the maps app the customer picks. */
export async function openDirections(name: string, lat: number, lng: number): Promise<void> {
  const choice = await dialog.actions({
    title: 'Open directions in',
    actions: [
      ...(Platform.OS === 'ios'
        ? [{ label: 'Apple Maps', value: 'apple' as const, icon: 'map' as const }]
        : []),
      { label: 'Google Maps', value: 'google' as const, icon: 'navigate' as const },
    ],
  });
  if (!choice) return;
  const url =
    choice === 'apple'
      ? `http://maps.apple.com/?daddr=${lat},${lng}&q=${encodeURIComponent(name)}`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  await Linking.openURL(url).catch(() => undefined);
}

/** A Google Maps link anyone can open. */
export const shareLocation = (name: string, lat: number, lng: number) =>
  void Share.share({ message: `${name} — https://maps.google.com/?q=${lat},${lng}` }).catch(
    () => undefined,
  );
