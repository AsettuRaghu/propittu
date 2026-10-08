import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

/**
 * When the owner last opened "Around your property", per property, on this
 * phone — so Home can mark news they haven't seen yet. Only a convenience:
 * if it's lost, the marker simply shows again.
 */
const KEY = 'propittu.news-seen';
const queryKey = ['news-seen'] as const;
type Seen = Record<string, string>;

async function readSeen(): Promise<Seen> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') as Seen;
  } catch {
    return {};
  }
}

export function useNewsSeen() {
  const { data } = useQuery({ queryKey, queryFn: readSeen, staleTime: Infinity });
  return data ?? {};
}

/** True when the area has news approved after the owner last looked. */
export const hasNewNews = (seen: Seen, propertyId: string, newsAt: string | null) =>
  !!newsAt && (!seen[propertyId] || newsAt > seen[propertyId]);

export function useMarkNewsSeen() {
  const qc = useQueryClient();
  return useCallback(
    async (propertyId: string) => {
      const next = { ...(await readSeen()), [propertyId]: new Date().toISOString() };
      qc.setQueryData(queryKey, next);
      await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
    },
    [qc],
  );
}
