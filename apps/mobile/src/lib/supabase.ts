import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { env } from './env';

/**
 * Supabase is used on the device for phone-OTP authentication
 * (PRODUCT_SPEC.md §12) and for Realtime "something changed" signals on an
 * open support ticket. All data itself goes through the Propittu API.
 *
 * Session persistence uses AsyncStorage. Known MVP tradeoff: the refresh
 * token is stored unencrypted in the app sandbox. Move to a chunked
 * expo-secure-store adapter before public launch (docs/DECISIONS.md).
 */
export const AUTH_STORAGE_KEY = 'propittu.auth';

export const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey, {
  auth: {
    storage: AsyncStorage,
    storageKey: AUTH_STORAGE_KEY,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/*
 * React Native has no reliable background timers, so token auto-refresh
 * must be paused in the background and resumed on foreground — otherwise
 * a session silently goes stale and the user is "randomly" logged out.
 */
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
