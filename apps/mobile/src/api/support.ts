import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BackofficeTicket,
  BackofficeTicketDetail,
  CreateTicketInput,
  Order,
  SupportTicket,
  SupportTicketDetail,
  TicketStatus,
  UpdateProfileInput,
} from '@propittu/shared';
import { api } from './client';

/** Help & Support tickets, profile editing and receipts. */

const supportKeys = {
  tickets: ['support', 'tickets'] as const,
  ticket: (id: string) => ['support', 'ticket', id] as const,
  boTickets: (status: string) => ['backoffice', 'tickets', status] as const,
  boTicket: (id: string) => ['backoffice', 'ticket', id] as const,
  order: (id: string) => ['billing', 'order', id] as const,
};

export const useTickets = () =>
  useQuery({
    queryKey: supportKeys.tickets,
    queryFn: () => api<SupportTicket[]>('/support/tickets'),
  });

export const useTicket = (id: string) =>
  useQuery({
    queryKey: supportKeys.ticket(id),
    queryFn: () => api<SupportTicketDetail>(`/support/tickets/${id}`),
    staleTime: 0,
  });

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTicketInput) =>
      api<SupportTicketDetail>('/support/tickets', { method: 'POST', body: input }),
    onSuccess: (t) => {
      qc.setQueryData(supportKeys.ticket(t.id), t);
      void qc.invalidateQueries({ queryKey: supportKeys.tickets });
    },
  });
}

export function useReplyTicket(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api<SupportTicketDetail>(`/support/tickets/${id}/messages`, {
        method: 'POST',
        body: { body },
      }),
    onSuccess: (t) => {
      qc.setQueryData(supportKeys.ticket(id), t);
      void qc.invalidateQueries({ queryKey: supportKeys.tickets });
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) =>
      api<{ full_name: string | null }>('/me', { method: 'PATCH', body: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['me'] }),
  });
}

export const useOrder = (id: string) =>
  useQuery({ queryKey: supportKeys.order(id), queryFn: () => api<Order>(`/billing/orders/${id}`) });

/* ---- Backoffice ---- */

export const useBoTickets = (status: string) =>
  useQuery({
    queryKey: supportKeys.boTickets(status),
    queryFn: () => api<BackofficeTicket[]>(`/backoffice/tickets?status=${status}`),
    staleTime: 0,
  });

export const useBoTicket = (id: string) =>
  useQuery({
    queryKey: supportKeys.boTicket(id),
    queryFn: () => api<BackofficeTicketDetail>(`/backoffice/tickets/${id}`),
    staleTime: 0,
  });

export function useBoReplyTicket(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api<BackofficeTicketDetail>(`/backoffice/tickets/${id}/messages`, {
        method: 'POST',
        body: { body },
      }),
    onSuccess: (t) => {
      qc.setQueryData(supportKeys.boTicket(id), t);
      void qc.invalidateQueries({ queryKey: ['backoffice', 'tickets'] });
    },
  });
}

export function useBoTicketStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: TicketStatus) =>
      api<BackofficeTicketDetail>(`/backoffice/tickets/${id}/status`, {
        method: 'POST',
        body: { status },
      }),
    onSuccess: (t) => {
      qc.setQueryData(supportKeys.boTicket(id), t);
      void qc.invalidateQueries({ queryKey: ['backoffice', 'tickets'] });
    },
  });
}
