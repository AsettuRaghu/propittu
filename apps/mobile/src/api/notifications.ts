import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationInbox } from '@propittu/shared';
import { api } from './client';

const inboxKey = ['notifications'] as const;

/** The owner's notifications; checked every minute while the app is open. */
export const useInbox = () =>
  useQuery({
    queryKey: inboxKey,
    queryFn: () => api<NotificationInbox>('/notifications'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) =>
      api<{ ok: true }>('/notifications/read', { method: 'POST', body: ids ? { ids } : {} }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: inboxKey }),
  });
}

export const savePushToken = (token: string, platform: string) =>
  api<{ ok: true }>('/me/push-token', { method: 'POST', body: { token, platform } });

export const forgetPushToken = (token: string) =>
  api<{ ok: true }>('/me/push-token', { method: 'DELETE', body: { token } });
