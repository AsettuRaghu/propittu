import { useQuery } from '@tanstack/react-query';
import type { BackofficeRequest, BackofficeTicket } from '@propittu/shared';
import { api } from './api';

/** The latest rows plus every open one, de-duplicated (lists are filtered here, not on the server). */
async function openAndRecent<T extends { id: string }>(path: string): Promise<T[]> {
  const [open, all] = await Promise.all([
    api<T[]>(`${path}?status=open`),
    api<T[]>(`${path}?status=all`),
  ]);
  const seen = new Set(all.map((r) => r.id));
  return [...all, ...open.filter((r) => !seen.has(r.id))];
}

export const useRequestList = () =>
  useQuery({
    queryKey: ['bo-requests'],
    queryFn: () => openAndRecent<BackofficeRequest>('/backoffice/requests'),
  });

export const useTicketList = () =>
  useQuery({
    queryKey: ['bo-tickets'],
    queryFn: () => openAndRecent<BackofficeTicket>('/backoffice/tickets'),
    // Live updates arrive through Realtime; this is only a safety net.
    refetchInterval: 60_000,
  });
