import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocumentMimeType, STORAGE_BUCKETS, VideoMimeType } from '@propittu/shared';

type MediaMimeType = DocumentMimeType | VideoMimeType;
import { env } from './env.js';
import { HttpError } from './errors.js';

/**
 * Supabase Storage helpers. Every call runs through the caller's
 * RLS-scoped client, so storage.objects policies apply: a user can only
 * sign, read or delete objects under their own <user_id>/ folder.
 */

type Bucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

/** Supabase signed upload URLs are valid for a fixed two hours. */
export const SIGNED_UPLOAD_TTL_SECONDS = 2 * 60 * 60;

const EXTENSION_BY_MIME: Record<MediaMimeType, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/**
 * Generates the object path SERVER-SIDE. Clients never choose paths (§37).
 * Shape: <account_id>/<property_id>/<uuid>.<ext> — the first segment is what
 * storage policies and the DB CHECK constraint verify ownership against.
 */
export function objectPath(accountId: string, propertyId: string, mime: MediaMimeType): string {
  return `${accountId}/${propertyId}/${randomUUID()}.${EXTENSION_BY_MIME[mime]}`;
}

export async function signUpload(
  db: SupabaseClient,
  bucket: Bucket,
  path: string,
): Promise<string> {
  const { data, error } = await db.storage.from(bucket).createSignedUploadUrl(path);
  if (error)
    throw new HttpError(500, 'INTERNAL', 'Could not prepare the upload', undefined, {
      cause: error,
    });
  return data.signedUrl;
}

/** Signs many paths in one call. Returns path → URL; unsignable paths are omitted. */
export async function signDownloads(
  db: SupabaseClient,
  bucket: Bucket,
  paths: string[],
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;

  const { data, error } = await db.storage
    .from(bucket)
    .createSignedUrls(paths, env.SIGNED_DOWNLOAD_TTL_SECONDS);

  // A failed thumbnail must not fail the whole screen; the client shows a placeholder.
  if (error) return urls;

  for (const entry of data) {
    if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl);
  }
  return urls;
}

export async function signDownload(
  db: SupabaseClient,
  bucket: Bucket,
  path: string,
): Promise<string> {
  const { data, error } = await db.storage
    .from(bucket)
    .createSignedUrl(path, env.SIGNED_DOWNLOAD_TTL_SECONDS);
  if (error) {
    throw new HttpError(500, 'INTERNAL', 'Could not open this file', undefined, { cause: error });
  }
  return data.signedUrl;
}

/**
 * Confirms the client really uploaded the object it declared.
 * Missing object → 409 so the client can retry the upload.
 * Wrong content type → the object is removed and the request rejected.
 */
export async function verifyUploaded(
  db: SupabaseClient,
  bucket: Bucket,
  path: string,
  expectedMime: string,
): Promise<void> {
  const { data, error } = await db.storage.from(bucket).info(path);
  if (error || !data) {
    throw new HttpError(409, 'UPLOAD_NOT_COMPLETED', 'The upload has not finished yet');
  }

  const actualMime = data.contentType?.split(';')[0]?.trim().toLowerCase();
  if (actualMime && actualMime !== expectedMime) {
    await removeObjects(db, bucket, [path]);
    throw new HttpError(400, 'UNSUPPORTED_FILE_TYPE', 'The uploaded file type did not match');
  }
}

/** Deletes objects. Missing objects are not an error. */
export async function removeObjects(
  db: SupabaseClient,
  bucket: Bucket,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await db.storage.from(bucket).remove(paths);
  if (error) {
    throw new HttpError(500, 'INTERNAL', 'Could not delete the file', undefined, { cause: error });
  }
}
