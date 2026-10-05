/**
 * Public configuration, inlined by Expo at build time.
 *
 * EXPO_PUBLIC_* values must be referenced as literal `process.env.X`
 * expressions — dynamic access (process.env[name]) is NOT inlined.
 */
const raw = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};

const missing = Object.entries(raw)
  .filter(([, v]) => !v)
  .map(([k]) => k);

/** Non-empty when apps/mobile/.env is incomplete; the root layout shows it. */
export const envProblems: string[] = missing.map(
  (k) =>
    ({
      apiUrl: 'EXPO_PUBLIC_API_URL',
      supabaseUrl: 'EXPO_PUBLIC_SUPABASE_URL',
      supabasePublishableKey: 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    })[k] ?? k,
);

export const env = {
  apiUrl: (raw.apiUrl ?? '').replace(/\/+$/, ''),
  supabaseUrl: raw.supabaseUrl ?? 'https://missing.supabase.co',
  supabasePublishableKey: raw.supabasePublishableKey ?? 'missing',
};
