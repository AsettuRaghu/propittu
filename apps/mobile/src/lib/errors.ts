import { AuthError } from '@supabase/supabase-js';
import { ApiError, type ClientErrorCode } from '@/api/client';

/**
 * User-facing copy for every failure, in one place (PRODUCT_SPEC.md §40).
 * Screens call errorMessage(err) and never show raw server text.
 */

const COPY: Partial<Record<ClientErrorCode, string>> = {
  NETWORK: 'No internet connection. Check your network and try again.',
  TIMEOUT: 'This is taking longer than usual. Please try again.',
  UNAUTHENTICATED: 'Your session has expired. Please sign in again.',
  FORBIDDEN: "You don't have access to this.",
  NOT_FOUND: "We couldn't find that. It may have been deleted.",
  UNSUPPORTED_FILE_TYPE: 'This file type is not supported. Use PDF, JPG or PNG.',
  FILE_TOO_LARGE: 'This file is too large.',
  UPLOAD_NOT_COMPLETED: "The upload didn't finish. Please try again.",
  INTERNAL: 'Something went wrong on our side. Please try again.',
};

/** Codes whose API message is already written for the customer. */
const SERVER_COPY = new Set<ClientErrorCode>([
  'VALIDATION_FAILED',
  'FILE_TOO_LARGE',
  'CONFLICT',
  // Plans (M5/M6): "Your Basic plan allows 1 properties. Upgrade…"
  'LIMITED_ACCESS',
  'FEATURE_NOT_INCLUDED',
  'LIMIT_REACHED',
  'PAYMENTS_UNAVAILABLE',
]);

export function errorMessage(
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (err instanceof ApiError) {
    // Validation and size messages from the API are already user-facing.
    if (SERVER_COPY.has(err.code)) return err.message;
    return COPY[err.code] ?? fallback;
  }
  if (err instanceof AuthError) return authErrorMessage(err);
  return fallback;
}

/** Field → message map from a 400 VALIDATION_FAILED response, if any. */
export function fieldErrors(err: unknown): Record<string, string> {
  return err instanceof ApiError && err.code === 'VALIDATION_FAILED' ? (err.details ?? {}) : {};
}

/* ------------------------------------------------------------------ *
 * Supabase Auth errors (§40 Authentication)
 * ------------------------------------------------------------------ */

export function authErrorMessage(err: AuthError): string {
  switch (err.code) {
    case 'over_sms_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'validation_failed':
      return 'Enter a valid Indian mobile number.';
    case 'sms_send_failed':
      return "We couldn't send the OTP right now. Please try again shortly.";
    case 'phone_provider_disabled':
    case 'signup_disabled':
      return 'Sign-in is not available right now. Please try again later.';
    case 'otp_expired':
      return 'That code is incorrect or has expired.';
  }
  if (err.status === 429) return 'Too many attempts. Please wait a few minutes and try again.';
  if (err.name === 'AuthRetryableFetchError' || err.status === 0) {
    return 'No internet connection. Check your network and try again.';
  }
  return 'Something went wrong. Please try again.';
}
