import type { ErrorRequestHandler, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { toFieldErrors, uuidSchema, type ApiErrorCode } from '@propittu/shared';

/**
 * The single shape every failure takes on the wire:
 *   { error: { code, message, details? } }
 * The mobile app maps `code` to user-facing copy (PRODUCT_SPEC.md §40).
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: Record<string, string>,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'HttpError';
  }
}

export const notFound = (what = 'Resource') => new HttpError(404, 'NOT_FOUND', `${what} not found`);

export const unauthenticated = (message = 'Please sign in again') =>
  new HttpError(401, 'UNAUTHENTICATED', message);

export const invalid = (message: string, details?: Record<string, string>) =>
  new HttpError(400, 'VALIDATION_FAILED', message, details);

/* ------------------------------------------------------------------ *
 * Supabase / PostgREST results
 * ------------------------------------------------------------------ */

interface DbError {
  code?: string;
  message: string;
}

/** Maps a PostgREST / Postgres error to an HttpError without leaking internals. */
export function fromDbError(error: DbError): HttpError {
  switch (error.code) {
    case 'PGRST116': // .single() matched no rows
    case 'P0002': // no_data_found, raised by our SQL functions
      return notFound();
    case 'PGRST301': // JWT expired or undecodable at PostgREST
    case 'PGRST303':
      return unauthenticated('Your session has expired. Please sign in again.');
    case '22P02': // invalid text representation (e.g. malformed uuid)
    case '23502': // not_null_violation
    case '23514': // check_violation
      return new HttpError(400, 'VALIDATION_FAILED', 'Some details are invalid', undefined, {
        cause: error,
      });
    case '23503': // foreign_key_violation
      return new HttpError(400, 'VALIDATION_FAILED', 'A linked record does not exist', undefined, {
        cause: error,
      });
    case '23505': // unique_violation
      return new HttpError(409, 'CONFLICT', 'This already exists', undefined, { cause: error });
    case '42501': // insufficient_privilege — includes RLS WITH CHECK violations
      return new HttpError(403, 'FORBIDDEN', 'You do not have access to this', undefined, {
        cause: error,
      });
    default:
      return new HttpError(500, 'INTERNAL', 'Something went wrong', undefined, { cause: error });
  }
}

/** Unwraps a supabase-js result, throwing a mapped HttpError on failure. */
export function must<T>(result: { data: unknown; error: DbError | null }): T {
  if (result.error) throw fromDbError(result.error);
  return result.data as T;
}

/* ------------------------------------------------------------------ *
 * Route params
 * ------------------------------------------------------------------ */

/**
 * Reads a UUID route param. A malformed id is reported as 404, not 400 —
 * from the caller's perspective it simply names nothing that exists.
 */
export function uuidParam(value: string | string[] | undefined, what: string): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw notFound(what);
  return parsed.data;
}

/* ------------------------------------------------------------------ *
 * Responses
 * ------------------------------------------------------------------ */

export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ data });
}

/* ------------------------------------------------------------------ *
 * Express handlers
 * ------------------------------------------------------------------ */

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(notFound('Route'));
};

function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;

  if (err instanceof ZodError) {
    return new HttpError(
      400,
      'VALIDATION_FAILED',
      'Please check the highlighted fields',
      toFieldErrors(err),
    );
  }

  // express.json() body-parser failures
  const type = (err as { type?: string } | null)?.type;
  if (type === 'entity.parse.failed') {
    return new HttpError(400, 'VALIDATION_FAILED', 'Request body is not valid JSON');
  }
  if (type === 'entity.too.large') {
    return new HttpError(413, 'VALIDATION_FAILED', 'Request body is too large');
  }

  return new HttpError(500, 'INTERNAL', 'Something went wrong', undefined, { cause: err });
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const httpError = toHttpError(err);

  if (httpError.status >= 500) {
    req.log.error({ err: httpError.cause ?? err }, 'request failed');
  } else {
    req.log.info({ code: httpError.code, cause: httpError.cause }, httpError.message);
  }

  res.status(httpError.status).json({
    error: {
      code: httpError.code,
      message: httpError.message,
      ...(httpError.details ? { details: httpError.details } : {}),
    },
  });
};
