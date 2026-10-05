import type { ImageSource } from 'expo-image';

/**
 * expo-image source for a Supabase signed URL.
 *
 * The token query string changes on every API fetch, which would make
 * every photo a cache miss. The path before "?" identifies the stored
 * object and never changes, so it is the cache key.
 */
export function signedImage(url: string): ImageSource {
  return { uri: url, cacheKey: url.split('?')[0] };
}
