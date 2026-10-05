import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

const serverAuthOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

/**
 * A Supabase client that acts AS the signed-in user.
 *
 * The caller's access token is forwarded on every PostgREST and Storage
 * call, so Row Level Security is enforced on the API's own data path —
 * not just on hypothetical direct client access (PRODUCT_SPEC.md §35).
 * Handlers still filter by user_id explicitly; RLS is the second wall.
 *
 * Built per request; it holds no state beyond the token.
 */
export function userClient(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: serverAuthOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * Unauthenticated client used ONLY to ask Supabase Auth whether a token is
 * valid, when it cannot be verified locally (see auth.ts). It reads no data.
 */
export const authServerClient: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_PUBLISHABLE_KEY,
  { auth: serverAuthOptions },
);
