import { Stack } from 'expo-router';
import { colors } from '@/theme';

/** Signed-in area: bottom tabs plus the screens pushed on top of them. */
export default function AppLayout() {
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
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
