import { Stack } from 'expo-router';
import { colors } from '@/theme';

/**
 * Signed-in area. Everything lives inside the tabs (each tab has its own
 * stack — see (tabs)/(home,services,profile)/_layout.tsx), so the tab bar
 * is visible on every screen.
 */
export default function AppLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    >
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
