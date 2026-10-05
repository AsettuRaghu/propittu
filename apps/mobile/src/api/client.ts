import type { ApiErrorCode, ApiFailure, ApiSuccess } from '@propittu/shared';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

/** API error codes plus the two failures that never reach the server. */
export type ClientErrorCode = ApiErrorCode | 'NETWORK' | 'TIMEOUT';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
    readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/* ------------------------------------------------------------------ *
 * Session-expiry hook — set by SessionProvider so a persistent 401
 * signs the user out and lands them on Login with an explanation.
 * ------------------------------------------------------------------ */

let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

/*
 * Limited Access hook (M6) — set by the root layout so that a 402 from
 * any screen (e.g. the Trial ended while the app was open) refreshes /me
 * and the app switches to its Limited Access state.
 */
let onLimitedAccess: (() => void) | null = null;

export function setLimitedAccessHandler(handler: (() => void) | null): void {
  onLimitedAccess = handler;
}

async function accessToken(forceRefresh: boolean): Promise<string | null> {
  if (forceRefresh) {
    const { data } = await supabase.auth.refreshSession();
    return data.session?.access_token ?? null;
  }
  // getSession() refreshes an expired access token before returning it.
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/*
 * Without a timeout, a request on a dead mobile connection hangs forever.
 * 30 s leaves ample room for slow networks; the API itself answers in
 * well under a second.
 */
const REQUEST_TIMEOUT_MS = 30_000;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

async function send(
  path: string,
  options: RequestOptions,
  token: string | null,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${env.apiUrl}${path}`, {
      method: options.method ?? 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new ApiError(0, 'TIMEOUT', 'This is taking longer than usual. Please try again.');
    }
    throw new ApiError(0, 'NETWORK', 'Check your internet connection and try again.');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calls the Propittu API with the current Supabase access token.
 * Returns the `data` payload; throws ApiError for every failure.
 *
 * On 401 it refreshes the session once and retries. A second 401 means
 * the session is truly gone: the user is signed out (§40 "Session expired").
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res = await send(path, options, await accessToken(false));

  if (res.status === 401) {
    const fresh = await accessToken(true);
    if (fresh) res = await send(path, options, fresh);
    if (res.status === 401) {
      onSessionExpired?.();
      throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
    }
  }

  if (res.status === 204) return undefined as T;

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // Non-JSON body (e.g. a proxy error page) — handled below.
  }

  if (!res.ok) {
    const error = (json as ApiFailure | null)?.error;
    if (res.status === 402 && error?.code === 'LIMITED_ACCESS') onLimitedAccess?.();
    throw new ApiError(
      res.status,
      error?.code ?? 'INTERNAL',
      error?.message ?? 'Something went wrong. Please try again.',
      error?.details,
    );
  }

  return (json as ApiSuccess<T>).data;
}
