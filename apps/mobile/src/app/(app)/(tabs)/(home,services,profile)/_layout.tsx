import { Stack } from 'expo-router';
import { colors } from '@/theme';

/**
 * One navigation stack PER TAB, so the tab bar stays visible on every
 * screen. The `(home,services,profile)` folder is an Expo Router shared
 * route: every screen exists in each tab's stack, and in-app navigation
 * stays in the tab you are in (e.g. "Request a service" from a property
 * opens on the Home tab, and Back returns to the property).
 *
 * Each tab starts at its own root screen.
 */
export const unstable_settings = {
  anchor: 'index',
  services: { anchor: 'services/index' },
  profile: { anchor: 'profile' },
};

export default function TabStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text, fontWeight: '600' },
        headerStyle: { backgroundColor: colors.surface },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {/* Tab roots */}
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Home' }} />
      <Stack.Screen name="services/index" options={{ title: 'Services' }} />
      <Stack.Screen name="profile" options={{ title: 'Profile' }} />

      <Stack.Screen name="properties/new" options={{ title: 'Add property' }} />
      <Stack.Screen
        name="properties/added"
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen name="properties/[id]/index" options={{ title: '' }} />
      <Stack.Screen name="properties/[id]/edit" options={{ title: 'Edit property' }} />
      <Stack.Screen name="properties/[id]/location" options={{ title: 'Property location' }} />
      <Stack.Screen name="properties/[id]/documents" options={{ title: 'Documents' }} />
      <Stack.Screen name="properties/[id]/add-document" options={{ title: 'Add document' }} />
      <Stack.Screen name="services/request" options={{ title: 'Request a service' }} />
      <Stack.Screen name="requests/index" options={{ title: 'Service requests' }} />
      <Stack.Screen name="requests/[id]" options={{ title: 'Service request' }} />
      <Stack.Screen name="plan" options={{ title: 'Plan & Usage' }} />

      {/* Backoffice (M9): staff only — the API returns 404 to everyone else. */}
      <Stack.Screen name="backoffice/index" options={{ title: 'Backoffice' }} />
      <Stack.Screen name="backoffice/requests/[id]" options={{ title: 'Request' }} />
      <Stack.Screen name="backoffice/accounts/[id]" options={{ title: 'Customer' }} />
      <Stack.Screen name="backoffice/properties/[id]" options={{ title: 'Property' }} />
      <Stack.Screen name="backoffice/services/[id]" options={{ title: 'Service' }} />
    </Stack>
  );
}
