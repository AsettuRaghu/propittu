import type { DocumentPickerAsset } from 'expo-document-picker';
import { File, Paths, UploadType } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_BYTES,
  MAX_PHOTO_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  PHOTO_MAX_DIMENSION,
  formatFileSize,
  type DocumentMimeType,
  type DocumentType,
  type PropertyDocument,
  type PropertyPhoto,
  type PropertyVideo,
  type VideoMimeType,
  type SignedDownload,
  type UploadIntent,
  type SupportAttachment,
  type VisitMedia,
} from '@propittu/shared';
import { ApiError, api } from './client';

/**
 * Upload flow (PRODUCT_SPEC.md §19, §21, §37):
 *
 *   1. POST …/intent   — API validates, picks the storage path, returns a signed URL
 *   2. PUT bytes       — straight to Supabase Storage, with real progress
 *   3. POST …/confirm  — API verifies the object landed and marks it ready
 *
 * Files never pass through the Propittu API, and the client never chooses
 * where they are stored.
 */

export interface LocalFile {
  uri: string;
  name: string;
  mimeType: DocumentMimeType | VideoMimeType;
  size: number;
}

export type ProgressFn = (fraction: number) => void;

async function putToSignedUrl(
  url: string,
  file: LocalFile,
  onProgress?: ProgressFn,
): Promise<void> {
  let status: number;
  let body = '';
  try {
    const result = await new File(file.uri).upload(url, {
      httpMethod: 'PUT',
      uploadType: UploadType.BINARY_CONTENT,
      headers: { 'Content-Type': file.mimeType, 'x-upsert': 'false' },
      onProgress: ({ bytesSent, totalBytes }) => {
        if (totalBytes > 0) onProgress?.(bytesSent / totalBytes);
      },
    });
    status = result.status;
    body = result.body;
  } catch {
    throw new ApiError(
      0,
      'NETWORK',
      'The upload was interrupted. Check your connection and try again.',
    );
  }

  if (status >= 200 && status < 300) {
    onProgress?.(1);
    return;
  }
  // Supabase Storage enforces the bucket's own size and type limits.
  if (status === 413 || /too large|maximum allowed size/i.test(body)) {
    throw new ApiError(413, 'FILE_TOO_LARGE', 'This file is too large.');
  }
  if (/mime|content type/i.test(body)) {
    throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'This file type is not supported.');
  }
  throw new ApiError(status, 'INTERNAL', 'The upload failed. Please try again.');
}

/* ------------------------------------------------------------------ *
 * Photos
 * ------------------------------------------------------------------ */

/**
 * Downscales to PHOTO_MAX_DIMENSION and re-encodes as JPEG. This also
 * converts iPhone HEIC photos, which the photos bucket does not accept.
 */
export async function preparePhoto(asset: ImagePickerAsset): Promise<LocalFile> {
  const context = ImageManipulator.manipulate(asset.uri);
  try {
    if (Math.max(asset.width, asset.height) > PHOTO_MAX_DIMENSION) {
      context.resize(
        asset.width >= asset.height
          ? { width: PHOTO_MAX_DIMENSION }
          : { height: PHOTO_MAX_DIMENSION },
      );
    }
    const image = await context.renderAsync();
    try {
      let saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
      let size = new File(saved.uri).size;
      if (size > MAX_PHOTO_BYTES) {
        saved = await image.saveAsync({ compress: 0.5, format: SaveFormat.JPEG });
        size = new File(saved.uri).size;
      }
      if (size > MAX_PHOTO_BYTES) {
        throw new ApiError(413, 'FILE_TOO_LARGE', 'This photo is too large to upload.');
      }
      return { uri: saved.uri, name: 'photo.jpg', mimeType: 'image/jpeg', size };
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}

export async function uploadPhoto(
  propertyId: string,
  file: LocalFile,
  onProgress?: ProgressFn,
): Promise<PropertyPhoto> {
  const intent = await api<UploadIntent>(`/properties/${propertyId}/photos/intent`, {
    method: 'POST',
    body: { mime_type: file.mimeType, file_size: file.size },
  });
  await putToSignedUrl(intent.upload_url, file, onProgress);
  return api<PropertyPhoto>(`/properties/${propertyId}/photos/${intent.id}/confirm`, {
    method: 'POST',
  });
}

/* ------------------------------------------------------------------ *
 * Documents
 * ------------------------------------------------------------------ */

const MIME_BY_EXTENSION: Record<string, DocumentMimeType> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

/** Pickers sometimes report "image/jpg" or nothing at all; normalise. */
function documentMime(asset: DocumentPickerAsset): DocumentMimeType | null {
  const reported = asset.mimeType?.toLowerCase().replace('image/jpg', 'image/jpeg');
  if (reported && (ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(reported)) {
    return reported as DocumentMimeType;
  }
  const ext = asset.name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[ext] ?? null;
}

/** Validates a picked document BEFORE any network call (§21). */
export function prepareDocument(asset: DocumentPickerAsset): LocalFile {
  const mimeType = documentMime(asset);
  if (!mimeType) {
    throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'Only PDF, JPG and PNG files are supported.');
  }
  const size = asset.size ?? new File(asset.uri).size;
  if (size > MAX_DOCUMENT_BYTES) {
    throw new ApiError(
      413,
      'FILE_TOO_LARGE',
      `This file is ${formatFileSize(size)}. The limit is ${formatFileSize(MAX_DOCUMENT_BYTES)}.`,
    );
  }
  return { uri: asset.uri, name: asset.name, mimeType, size };
}

export async function uploadDocument(
  propertyId: string,
  documentType: DocumentType,
  file: LocalFile,
  onProgress?: ProgressFn,
  description?: string | null,
): Promise<PropertyDocument> {
  const intent = await api<UploadIntent>(`/properties/${propertyId}/documents/intent`, {
    method: 'POST',
    body: {
      document_type: documentType,
      file_name: file.name,
      description: description?.trim() || null,
      mime_type: file.mimeType,
      file_size: file.size,
    },
  });
  await putToSignedUrl(intent.upload_url, file, onProgress);
  return api<PropertyDocument>(`/properties/${propertyId}/documents/${intent.id}/confirm`, {
    method: 'POST',
  });
}

/* ------------------------------------------------------------------ *
 * Videos (M3)
 * ------------------------------------------------------------------ */

export interface LocalVideo extends LocalFile {
  durationSeconds: number | null;
}

/** Validates a picked video BEFORE any network call (type, size, length). */
export function prepareVideo(asset: ImagePickerAsset): LocalVideo {
  const reported = asset.mimeType?.toLowerCase() ?? '';
  const ext = (asset.fileName ?? asset.uri).split('.').pop()?.toLowerCase() ?? '';
  const mimeType: VideoMimeType | null =
    reported === 'video/mp4' || ext === 'mp4'
      ? 'video/mp4'
      : reported === 'video/quicktime' || ext === 'mov'
        ? 'video/quicktime'
        : null;
  if (!mimeType) {
    throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'Only MP4 and MOV videos are supported.');
  }
  const size = asset.fileSize ?? new File(asset.uri).size;
  if (size > MAX_VIDEO_BYTES) {
    throw new ApiError(
      413,
      'FILE_TOO_LARGE',
      `This video is ${formatFileSize(size)}. The limit is ${formatFileSize(MAX_VIDEO_BYTES)} — try a shorter clip.`,
    );
  }
  // The picker reports duration in milliseconds.
  const durationSeconds = asset.duration ? Math.round(asset.duration / 100) / 10 : null;
  if (durationSeconds !== null && durationSeconds > MAX_VIDEO_SECONDS + 1) {
    throw new ApiError(
      400,
      'VALIDATION_FAILED',
      `Videos can be up to ${MAX_VIDEO_SECONDS} seconds long.`,
    );
  }
  return {
    uri: asset.uri,
    name: `video.${mimeType === 'video/mp4' ? 'mp4' : 'mov'}`,
    mimeType,
    size,
    durationSeconds,
  };
}

export async function uploadVideo(
  propertyId: string,
  file: LocalVideo,
  onProgress?: ProgressFn,
): Promise<PropertyVideo> {
  const intent = await api<UploadIntent>(`/properties/${propertyId}/videos/intent`, {
    method: 'POST',
    body: {
      mime_type: file.mimeType,
      file_size: file.size,
      duration_seconds: file.durationSeconds,
    },
  });
  await putToSignedUrl(intent.upload_url, file, onProgress);
  return api<PropertyVideo>(`/properties/${propertyId}/videos/${intent.id}/confirm`, {
    method: 'POST',
  });
}

/* ------------------------------------------------------------------ *
 * Visit report media (M4, staff)
 * ------------------------------------------------------------------ */

export async function uploadVisitMedia(
  requestId: string,
  kind: 'photo' | 'video',
  file: LocalFile,
  onProgress?: ProgressFn,
): Promise<VisitMedia> {
  const base = `/backoffice/requests/${requestId}/report/media`;
  const intent = await api<UploadIntent>(`${base}/intent`, {
    method: 'POST',
    body: { kind, mime_type: file.mimeType, file_size: file.size },
  });
  await putToSignedUrl(intent.upload_url, file, onProgress);
  return api<VisitMedia>(`${base}/${intent.id}/confirm`, { method: 'POST' });
}

/** Backoffice: a result file on a paperwork request's outcome (saved to Documents as `documentType`). */
export async function uploadOutcomeFile(
  requestId: string,
  file: LocalFile,
  documentType: DocumentType | null,
  onProgress?: ProgressFn,
): Promise<void> {
  const base = `/backoffice/requests/${requestId}/outcome/files`;
  const intent = await api<UploadIntent>(`${base}/intent`, {
    method: 'POST',
    body: {
      file_name: file.name,
      mime_type: file.mimeType,
      file_size: file.size,
      document_type: documentType,
    },
  });
  await putToSignedUrl(intent.upload_url, file, onProgress);
  await api<unknown>(`${base}/${intent.id}/confirm`, { method: 'POST' });
}

/** Plays a video in the in-app browser (Safari/Chrome play MP4/MOV natively). */
export async function playVideo(video: Pick<PropertyVideo, 'url'>): Promise<void> {
  if (!video.url) throw new ApiError(0, 'NETWORK', 'This video is not available right now.');
  await WebBrowser.openBrowserAsync(video.url);
}

/**
 * Opens a document (§8.3 "View / Download/open documents").
 *
 *   images → returned to the caller to show in the in-app viewer
 *   PDF, iOS → Safari view controller renders it inline
 *   PDF, Android → Chrome Custom Tabs cannot render PDFs, so it is
 *     downloaded and handed to the user's PDF viewer via the share sheet
 */
export async function openDocument(
  doc: PropertyDocument,
  /** Staff open customer documents through the Backoffice route. */
  asStaff = false,
): Promise<{ kind: 'image'; url: string } | { kind: 'external' }> {
  const signed = await api<SignedDownload>(
    `${asStaff ? '/backoffice' : ''}/documents/${doc.id}/download`,
  );

  if (signed.mime_type.startsWith('image/')) return { kind: 'image', url: signed.url };

  if (Platform.OS === 'ios') {
    await WebBrowser.openBrowserAsync(signed.url);
    return { kind: 'external' };
  }

  try {
    const destination = new File(Paths.cache, `${doc.id}.pdf`);
    if (destination.exists) destination.delete();
    const downloaded = await File.downloadFileAsync(signed.url, destination);
    await Sharing.shareAsync(downloaded.uri, {
      mimeType: 'application/pdf',
      dialogTitle: doc.file_name,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', "We couldn't open this document. Please try again.");
  }
  return { kind: 'external' };
}

/* ------------------------------------------------------------------ *
 * Support ticket attachments (customer or staff, onto their own message)
 * ------------------------------------------------------------------ */

export async function uploadTicketAttachment(
  scope: 'support' | 'backoffice',
  ticketId: string,
  messageId: string,
  file: LocalFile,
  onProgress?: ProgressFn,
): Promise<SupportAttachment> {
  const base = `/${scope}/tickets/${ticketId}/attachments`;
  const intent = await api<UploadIntent>(`${base}/intent`, {
    method: 'POST',
    body: {
      message_id: messageId,
      file_name: file.name,
      mime_type: file.mimeType,
      file_size: file.size,
    },
  });
  await putToSignedUrl(intent.upload_url, file, onProgress);
  return api<SupportAttachment>(`${base}/${intent.id}/confirm`, { method: 'POST' });
}
