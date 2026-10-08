import { supabase } from './supabase';

const BASE = import.meta.env.VITE_API_URL as string | undefined;
if (!BASE) throw new Error('Set VITE_API_URL');

/** An error from the Propittu API, with its code and per-field details. */
class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, string>,
  ) {
    super(message);
  }
}

/** Calls the Propittu API as the signed-in staff member. */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(BASE + path, {
    method: init.method ?? 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as {
    data?: T;
    error?: { code: string; message: string; details?: Record<string, string> };
  } | null;
  if (!res.ok || !json || json.error) {
    const e = json?.error;
    throw new ApiError(
      res.status,
      e?.code ?? 'INTERNAL',
      e?.message ?? 'Something went wrong',
      e?.details,
    );
  }
  return json.data as T;
}

export const errorText = (err: unknown) =>
  err instanceof Error ? err.message : 'Something went wrong. Please try again.';
