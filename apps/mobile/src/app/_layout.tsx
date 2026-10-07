import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError, setLimitedAccessHandler } from '@/api/client';
import { SessionProvider, useSession } from '@/auth/SessionProvider';
import { BrandSplash } from '@/components/BrandSplash';
import { DialogHost } from '@/components/Dialog';
import { envProblems } from '@/lib/env';
import { colors, font, space, typography } from '@/theme';

// Keep the native splash up until the persisted session is restored (§14).
void SplashScreen.preventAutoHideAsync();

// Refetch stale data when the app returns to the foreground.
AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Retry network blips and 5xx; never retry 4xx — it will not change.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
          failureCount < 2,
      },
      mutations: { retry: false },
    },
  });
}

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);

  useEffect(() => {
    setLimitedAccessHandler(() => {
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      void queryClient.invalidateQueries({ queryKey: ['account-plan'] });
    });
    return () => setLimitedAccessHandler(null);
  }, [queryClient]);

  if (envProblems.length > 0) return <ConfigError missing={envProblems} />;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <RootNavigator />
        </SessionProvider>
        <DialogHost />
      </QueryClientProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

/**
 * Authentication gate. Stack.Protected removes screens whose guard is
 * false and redirects away from them, so signing in lands on Home and
 * signing out (or session expiry) lands on Login with no manual routing.
 */
function RootNavigator() {
  const { session, initializing } = useSession();
  const [splashDone, setSplashDone] = useState(false);
  const endSplash = useCallback(() => setSplashDone(true), []);

  useEffect(() => {
    if (!initializing) void SplashScreen.hideAsync();
  }, [initializing]);

  if (initializing) return null;

  return (
    <View style={styles.flex}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="login" />
          {/* No header: the screen has its own small back arrow. */}
          <Stack.Screen name="verify" />
        </Stack.Protected>
      </Stack>
      {!splashDone ? <BrandSplash onDone={endSplash} /> : null}
    </View>
  );
}

/** Shown instead of a crash when apps/mobile/.env is incomplete. */
function ConfigError({ missing }: { missing: string[] }) {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);
  return (
    <View style={styles.config}>
      <Text style={typography.title}>Configuration missing</Text>
      <Text style={typography.body}>
        Set these in apps/mobile/.env, then restart Expo with a cleared cache (npx expo start -c):
      </Text>
      {missing.map((name) => (
        <Text key={name} style={styles.mono}>
          {name}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  config: {
    flex: 1,
    justifyContent: 'center',
    padding: space.xl,
    gap: space.md,
    backgroundColor: colors.background,
  },
  mono: { fontFamily: 'Courier', fontSize: font(14), color: colors.danger },
});
