import { Stack } from 'expo-router';
import { useNotifications } from '@/lib/push';
import { colors } from '@/theme';

/**
 * Signed-in area. Everything lives inside the tabs (each tab has its own
 * stack — see (tabs)/(home,services,profile)/_layout.tsx), so the tab bar
 * is visible on every screen.
 */
export default function AppLayout() {
  // Push registration, notification taps, pop-ups for new inbox items.
  useNotifications();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    >
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
