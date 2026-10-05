import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MAX_VIDEOS_PER_PROPERTY,
  STORAGE_BUCKETS,
  videoIntentSchema,
  type PropertyVideo,
  type UploadIntent,
} from '@propittu/shared';
import { auth } from '../auth.js';
import { audit } from '../audit.js';
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
 * Property videos (M3). Same signed-URL intent/confirm flow as photos:
 * the API picks the path, the phone uploads straight to Storage, the
 * API verifies the object before marking it ready.
 */
export const videosRouter = Router();

const BUCKET = STORAGE_BUCKETS.videos;

interface VideoRow {
  id: string;
  property_id: string;
  storage_path: string;
  mime_type: string;
  caption: string | null;
  duration_seconds: number | null;
  file_size: number;
  upload_status: 'pending' | 'ready';
  created_at: string;
}

const VIDEO_COLUMNS =
  'id, property_id, storage_path, mime_type, caption, duration_seconds, file_size, upload_status, created_at';

function toVideo(row: VideoRow, url: string | null): PropertyVideo {
  return {
    id: row.id,
    property_id: row.property_id,
    caption: row.caption,
    duration_seconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    file_size: row.file_size,
    url,
    created_at: row.created_at,
  };
}

/** Ready videos with fresh signed URLs, oldest first. Shared with GET /properties/:id. */
export async function listReadyVideos(
  db: SupabaseClient,
  accountId: string,
  propertyId: string,
): Promise<PropertyVideo[]> {
  const rows = must<VideoRow[]>(
    await db
      .from('property_videos')
      .select(VIDEO_COLUMNS)
      .eq('property_id', propertyId)
      .eq('account_id', accountId)
      .eq('upload_status', 'ready')
      .order('created_at', { ascending: true }),
  );
  const urls = await signDownloads(
    db,
    BUCKET,
    rows.map((r) => r.storage_path),
  );
  return rows.map((r) => toVideo(r, urls.get(r.storage_path) ?? null));
}

/* GET /properties/:id/videos */
videosRouter.get('/properties/:id/videos', async (req, res) => {
  const { db, accountId } = auth(req);
  const propertyId = uuidParam(req.params.id, 'Property');
  await assertOwnsProperty(db, accountId, propertyId);
  ok(res, await listReadyVideos(db, accountId, propertyId));
});

/* POST /properties/:id/videos/intent */
videosRouter.post('/properties/:id/videos/intent', async (req, res) => {
  const { db, userId, accountId } = auth(req);
  const propertyId = uuidParam(req.params.id, 'Property');
  const input = videoIntentSchema.parse(req.body);
  await assertOwnsProperty(db, accountId, propertyId);

  const existing = await db
    .from('property_videos')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId)
    .eq('account_id', accountId)
    .eq('upload_status', 'ready');
  must(existing);
  if ((existing.count ?? 0) >= MAX_VIDEOS_PER_PROPERTY) {
    throw invalid(`A property can have at most ${MAX_VIDEOS_PER_PROPERTY} videos`);
  }

  const storagePath = objectPath(accountId, propertyId, input.mime_type);
  const row = must<{ id: string }>(
    await db
      .from('property_videos')
      .insert({
        property_id: propertyId,
        account_id: accountId,
        user_id: userId,
        storage_path: storagePath,
        mime_type: input.mime_type,
        file_size: input.file_size,
        duration_seconds: input.duration_seconds,
        caption: input.caption,
      })
      .select('id')
      .single(),
  );

  let uploadUrl: string;
  try {
    uploadUrl = await signUpload(db, BUCKET, storagePath);
  } catch (err) {
    await db.from('property_videos').delete().eq('id', row.id);
    throw err;
  }

  const data: UploadIntent = {
    id: row.id,
    upload_url: uploadUrl,
    expires_in: SIGNED_UPLOAD_TTL_SECONDS,
  };
  ok(res, data, 201);
});

/* POST /properties/:id/videos/:videoId/confirm — idempotent */
videosRouter.post('/properties/:id/videos/:videoId/confirm', async (req, res) => {
  const { db, accountId } = auth(req);
  const propertyId = uuidParam(req.params.id, 'Property');
  const videoId = uuidParam(req.params.videoId, 'Video');

  const row = must<VideoRow | null>(
    await db
      .from('property_videos')
      .select(VIDEO_COLUMNS)
      .eq('id', videoId)
      .eq('property_id', propertyId)
      .eq('account_id', accountId)
      .maybeSingle(),
  );
  if (!row) throw notFound('Video');

  if (row.upload_status !== 'ready') {
    try {
      await verifyUploaded(db, BUCKET, row.storage_path, row.mime_type);
    } catch (err) {
      if (err instanceof HttpError && err.code === 'UNSUPPORTED_FILE_TYPE') {
        await db.from('property_videos').delete().eq('id', row.id);
      }
      throw err;
    }
    must(
      await db
        .from('property_videos')
        .update({ upload_status: 'ready' })
        .eq('id', row.id)
        .eq('account_id', accountId),
    );
    await audit(auth(req), 'video.uploaded', { type: 'video', id: row.id });
  }

  const urls = await signDownloads(db, BUCKET, [row.storage_path]);
  ok(res, toVideo({ ...row, upload_status: 'ready' }, urls.get(row.storage_path) ?? null));
});

/* DELETE /videos/:id */
videosRouter.delete('/videos/:id', async (req, res) => {
  const { db, accountId } = auth(req);
  const id = uuidParam(req.params.id, 'Video');

  const row = must<{ id: string; storage_path: string } | null>(
    await db
      .from('property_videos')
      .select('id, storage_path')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle(),
  );
  if (!row) throw notFound('Video');

  await removeObjects(db, BUCKET, [row.storage_path]);
  must(await db.from('property_videos').delete().eq('id', row.id).eq('account_id', accountId));
  await audit(auth(req), 'video.deleted', { type: 'video', id: row.id });

  res.status(204).end();
});
