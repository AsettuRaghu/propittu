import type { UploadIntent } from '@propittu/shared';
import { api } from './api';

/**
 * Upload one file the way the app does: ask the API for a signed upload URL
 * (it chooses the storage path), send the bytes there, then confirm.
 */
export async function uploadFile(
  file: File,
  intentPath: string,
  intentBody: Record<string, unknown>,
  confirmPath: (id: string) => string,
) {
  const intent = await api<UploadIntent>(intentPath, { method: 'POST', body: intentBody });
  const put = await fetch(intent.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status}). Please try again.`);
  await api(confirmPath(intent.id), { method: 'POST' });
}
