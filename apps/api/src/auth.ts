import type { Request, RequestHandler } from 'express';
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from 'jose';
import { isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';
import { fromDbError, HttpError, unauthenticated } from './errors.js';
import { authServerClient, userClient } from './supabase.js';

interface Identity {
  /** From the verified token's `sub`. NEVER from the request body (§31). */
  userId: string;
  /** E.164, e.g. "+919876543210". */
  phone: string | null;
}

export interface AuthContext extends Identity {
  /**
   * The caller's Account (M1), resolved server-side from the user id.
   * Never taken from the client — every ownership check uses this.
   */
  accountId: string;
  accountRole: 'owner' | 'member';
  accountStatus: 'active' | 'suspended' | 'closed';
  /** RLS-scoped client acting as this user. */
  db: SupabaseClient;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Token verification
 *
 * Tokens are verified LOCALLY against Supabase's published signing keys
 * (JWKS), so authenticating a request costs no network round trip to
 * Supabase Auth — only the data queries themselves leave the function.
 *
 * Projects still signing with the legacy shared secret (HS256) publish
 * no matching key, so those tokens fall back to asking Supabase Auth.
 * ------------------------------------------------------------------ */

const issuer = `${env.SUPABASE_URL}/auth/v1`;
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

const toE164 = (phone: unknown): string | null =>
  typeof phone === 'string' && phone.length > 0 ? `+${phone.replace(/^\+/, '')}` : null;

async function verifyWithAuthServer(token: string): Promise<Identity> {
  const { data, error } = await authServerClient.auth.getUser(token);
  if (error && isAuthRetryableFetchError(error)) {
    throw new HttpError(503, 'INTERNAL', 'Sign-in is temporarily unavailable. Please try again.');
  }
  if (error || !data.user) throw unauthenticated();
  return { userId: data.user.id, phone: toE164(data.user.phone) };
}

async function verifyAccessToken(token: string): Promise<Identity> {
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: 'authenticated' });
    if (typeof payload.sub !== 'string' || payload.role !== 'authenticated') {
      throw unauthenticated();
    }
    return { userId: payload.sub, phone: toE164(payload.phone) };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof joseErrors.JWKSNoMatchingKey) return verifyWithAuthServer(token);
    if (err instanceof joseErrors.JWKSTimeout) {
      throw new HttpError(503, 'INTERNAL', 'Sign-in is temporarily unavailable. Please try again.');
    }
    if (err instanceof joseErrors.JWTExpired) {
      throw unauthenticated('Your session has expired. Please sign in again.');
    }
    if (err instanceof joseErrors.JOSEError) throw unauthenticated();
    throw err;
  }
}

/* ------------------------------------------------------------------ *
 * Middleware
 * ------------------------------------------------------------------ */

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') ?? '');
  if (!match?.[1]) throw unauthenticated();

  const token = match[1];
  const identity = await verifyAccessToken(token);
  const db = userClient(token);

  // User → Account (M1). RLS lets a user read only their own membership.
  const { data: membership, error } = await db
    .from('account_members')
    .select('account_id, role, account:accounts(status)')
    .eq('user_id', identity.userId)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!membership) {
    throw new HttpError(403, 'FORBIDDEN', 'No Propittu account is linked to this login');
  }

  req.auth = {
    ...identity,
    accountId: membership.account_id as string,
    accountRole: membership.role as AuthContext['accountRole'],
    accountStatus: ((membership.account as unknown as { status?: string } | null)?.status ??
      'active') as AuthContext['accountStatus'],
    db,
  };
  next();
};

/** Typed accessor for handlers mounted behind requireAuth. */
export function auth(req: Request): AuthContext {
  if (!req.auth) throw new Error('requireAuth must run before this handler');
  return req.auth;
}
