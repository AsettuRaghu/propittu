import { Stack } from 'expo-router';
import { colors, font } from '@/theme';

/**
 * One navigation stack PER TAB, so the tab bar stays visible on every
 * screen. The `(home,services,profile)` folder is an Expo Router shared
 * route: every screen exists in each tab's stack, and in-app navigation
 * stays in the tab you are in (e.g. "Request a service" from a property
 * opens on the Home tab, and Back returns to the property).
 *
 * Each tab must START at its own root screen. When screens are listed
 * explicitly, Expo Router uses the FIRST listed screen as the start, so the
 * tab's root is listed first (and also passed as initialRouteName).
 */
const ROOTS: Record<string, string> = {
  '(home)': 'index',
  '(services)': 'services/index',
  '(profile)': 'profile',
};

export const unstable_settings = {
  anchor: 'index',
  services: { anchor: 'services/index' },
  profile: { anchor: 'profile' },
};

const SCREENS: { name: string; options: Record<string, unknown> }[] = [
  // Tab roots
  { name: 'index', options: { headerShown: false, title: 'Home' } },
  { name: 'services/index', options: { headerShown: false, title: 'Services' } },
  { name: 'profile', options: { headerShown: false, title: 'Profile' } },

  { name: 'properties/new', options: { title: 'Add property' } },
  { name: 'properties/[id]/setup', options: { title: 'Check the details' } },
  {
    name: 'properties/[id]/pittu',
    options: { title: 'A few quick questions', gestureEnabled: false },
  },
  { name: 'properties/[id]/index', options: { title: '' } },
  { name: 'properties/[id]/edit', options: { title: 'Edit property' } },
  { name: 'properties/[id]/location', options: { title: 'Property location' } },
  { name: 'properties/[id]/documents', options: { title: 'Documents' } },
  { name: 'properties/[id]/add-document', options: { title: 'Add document' } },
  { name: 'services/request', options: { title: 'Request a service' } },
  { name: 'requests/[id]', options: { title: 'Service request' } },
  { name: 'plan', options: { title: 'Plan & Usage' } },
  { name: 'account-delete', options: { title: 'Delete account' } },
  { name: 'receipts/[id]', options: { title: 'Receipt' } },
  { name: 'support/index', options: { title: 'Help & Support' } },
  { name: 'support/new', options: { title: 'Raise a ticket' } },
  { name: 'support/[id]', options: { title: 'Support ticket' } },

  // Backoffice (M9): staff only — the API returns 404 to everyone else.
  { name: 'backoffice/index', options: { title: 'Backoffice' } },
  { name: 'backoffice/requests/[id]', options: { title: 'Request' } },
  { name: 'backoffice/accounts/[id]', options: { title: 'Customer' } },
  { name: 'backoffice/properties/[id]', options: { title: 'Property' } },
  { name: 'backoffice/services/[id]', options: { title: 'Service' } },
  { name: 'backoffice/areas', options: { title: 'Where we serve' } },
  { name: 'backoffice/tickets/[id]', options: { title: 'Ticket' } },
];

export default function TabStackLayout({ segment }: { segment?: string }) {
  const root = ROOTS[segment ?? '(home)'] ?? 'index';
  const ordered = [
    ...SCREENS.filter((s) => s.name === root),
    ...SCREENS.filter((s) => s.name !== root),
  ];

  return (
    <Stack
      initialRouteName={root}
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text, fontWeight: '700', fontSize: font(17) },
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {ordered.map((s) => (
        <Stack.Screen key={s.name} name={s.name} options={s.options} />
      ))}
    </Stack>
  );
}
