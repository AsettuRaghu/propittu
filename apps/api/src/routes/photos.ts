import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MAX_PHOTOS_PER_PROPERTY,
  photoIntentSchema,
  STORAGE_BUCKETS,
  type PropertyPhoto,
  type UploadIntent,
} from '@propittu/shared';
import { auth } from '../auth.js';
import { HttpError, invalid, must, notFound, ok, uuidParam } from '../errors.js';
import { assertOwnsProperty } from '../ownership.js';
import {
  objectPath,
  removeObjects,
  signDownloads,
  signUpload,
  SIGNED_UPLOAD_TTL_SECONDS,
  verifyUploaded,
} from '../storage.js';

/**
 * Property photos (§19) — signed-URL intent/confirm upload flow:
 *
 *   1. POST /properties/:id/photos/intent        → row (pending) + signed upload URL
 *   2. client uploads bytes straight to Supabase Storage
 *   3. POST /properties/:id/photos/:photoId/confirm → verifies object, marks ready
 */
export const photosRouter = Router();

const BUCKET = STORAGE_BUCKETS.photos;

interface PhotoRow {
  id: string;
  property_id: string;
  storage_path: string;
  mime_type: string;
  caption: string | null;
  upload_status: 'pending' | 'ready';
  created_at: string;
}

const PHOTO_COLUMNS =
  'id, property_id, storage_path, mime_type, caption, upload_status, created_at';

function toPhoto(row: PhotoRow, url: string | null): PropertyPhoto {
  return {
    id: row.id,
    property_id: row.property_id,
    caption: row.caption,
    url,
    created_at: row.created_at,
  };
}

/** Ready photos with fresh signed URLs, oldest first. Shared with GET /properties/:id. */
export async function listReadyPhotos(
  db: SupabaseClient,
  userId: string,
  propertyId: string,
): Promise<PropertyPhoto[]> {
  const rows = must<PhotoRow[]>(
    await db
      .from('property_photos')
      .select(PHOTO_COLUMNS)
      .eq('property_id', propertyId)
      .eq('user_id', userId)
      .eq('upload_status', 'ready')
      .order('created_at', { ascending: true }),
  );
  const urls = await signDownloads(
    db,
    BUCKET,
    rows.map((r) => r.storage_path),
  );
  return rows.map((r) => toPhoto(r, urls.get(r.storage_path) ?? null));
}

/* GET /properties/:id/photos */
photosRouter.get('/properties/:id/photos', async (req, res) => {
  const { db, userId } = auth(req);
  const propertyId = uuidParam(req.params.id, 'Property');
  await assertOwnsProperty(db, userId, propertyId);
  ok(res, await listReadyPhotos(db, userId, propertyId));
});

/* POST /properties/:id/photos/intent */
photosRouter.post('/properties/:id/photos/intent', async (req, res) => {
  const { db, userId } = auth(req);
  const propertyId = uuidParam(req.params.id, 'Property');
  const input = photoIntentSchema.parse(req.body);
  await assertOwnsProperty(db, userId, propertyId);

  const existing = await db
    .from('property_photos')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId)
    .eq('user_id', userId)
    .eq('upload_status', 'ready');
  must(existing);
  if ((existing.count ?? 0) >= MAX_PHOTOS_PER_PROPERTY) {
    throw invalid(`A property can have at most ${MAX_PHOTOS_PER_PROPERTY} photos`);
  }

  const storagePath = objectPath(userId, propertyId, input.mime_type);
  const row = must<{ id: string }>(
    await db
      .from('property_photos')
      .insert({
        property_id: propertyId,
        user_id: userId,
        storage_path: storagePath,
        mime_type: input.mime_type,
        file_size: input.file_size,
        caption: input.caption,
      })
      .select('id')
      .single(),
  );

  let uploadUrl: string;
  try {
    uploadUrl = await signUpload(db, BUCKET, storagePath);
  } catch (err) {
    await db.from('property_photos').delete().eq('id', row.id);
    throw err;
  }

  const data: UploadIntent = {
    id: row.id,
    upload_url: uploadUrl,
    expires_in: SIGNED_UPLOAD_TTL_SECONDS,
  };
  ok(res, data, 201);
});

/* POST /properties/:id/photos/:photoId/confirm — idempotent */
photosRouter.post('/properties/:id/photos/:photoId/confirm', async (req, res) => {
  const { db, userId } = auth(req);
  const propertyId = uuidParam(req.params.id, 'Property');
  const photoId = uuidParam(req.params.photoId, 'Photo');

  const row = must<PhotoRow | null>(
    await db
      .from('property_photos')
      .select(PHOTO_COLUMNS)
      .eq('id', photoId)
      .eq('property_id', propertyId)
      .eq('user_id', userId)
      .maybeSingle(),
  );
  if (!row) throw notFound('Photo');

  if (row.upload_status !== 'ready') {
    try {
      await verifyUploaded(db, BUCKET, row.storage_path, row.mime_type);
    } catch (err) {
      // Wrong file type: the object is already gone, drop the row too.
      if (err instanceof HttpError && err.code === 'UNSUPPORTED_FILE_TYPE') {
        await db.from('property_photos').delete().eq('id', row.id);
      }
      throw err;
    }
    must(
      await db
        .from('property_photos')
        .update({ upload_status: 'ready' })
        .eq('id', row.id)
        .eq('user_id', userId),
    );
  }

  const urls = await signDownloads(db, BUCKET, [row.storage_path]);
  ok(res, toPhoto({ ...row, upload_status: 'ready' }, urls.get(row.storage_path) ?? null));
});

/*
 * DELETE /photos/:id
 * Not listed in §30, but without it a wrongly uploaded photo could never be
 * removed short of deleting the whole property. See docs/DECISIONS.md.
 */
photosRouter.delete('/photos/:id', async (req, res) => {
  const { db, userId } = auth(req);
  const id = uuidParam(req.params.id, 'Photo');

  const row = must<{ id: string; storage_path: string } | null>(
    await db
      .from('property_photos')
      .select('id, storage_path')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle(),
  );
  if (!row) throw notFound('Photo');

  await removeObjects(db, BUCKET, [row.storage_path]);
  must(await db.from('property_photos').delete().eq('id', row.id).eq('user_id', userId));

  res.status(204).end();
});
