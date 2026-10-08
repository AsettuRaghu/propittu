import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
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
import { supabase } from '@/lib/supabase';
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

/** Tickets where our team replied since the customer last looked. */
export function useNewReplies() {
  const { data } = useTickets();
  return data?.filter((t) => t.has_new_reply) ?? [];
}

/**
 * App-wide: any change to the customer's tickets (a reply from our team, a
 * status change) refreshes the ticket list, so the "new reply" badges appear
 * at once. Row-level security limits the events to the customer's own tickets.
 */
export function useSupportUpdates() {
  const qc = useQueryClient();
  useEffect(() => {
    const refresh = () => void qc.invalidateQueries({ queryKey: ['support'] });
    const channel = supabase
      .channel('my-support')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_ticket_messages' },
        refresh,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'support_tickets' },
        refresh,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refresh();
      });
    return () => void supabase.removeChannel(channel);
  }, [qc]);
}

/** Opening a ticket marks our replies in it as read. */
export function useMarkTicketRead(id: string, hasNewReply: boolean | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!hasNewReply) return;
    void api(`/support/tickets/${id}/read`, { method: 'POST' }).then(() =>
      qc.invalidateQueries({ queryKey: supportKeys.tickets }),
    );
  }, [id, hasNewReply, qc]);
}

/**
 * Keeps an open ticket live: Supabase Realtime pushes new messages and status
 * changes for this ticket (row-level security applies, so a customer only
 * hears about their own), and we refetch the thread through the API.
 */
export function useLiveTicket(id: string, staff = false) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!id) return;
    const refresh = () => {
      void qc.invalidateQueries({
        queryKey: staff ? supportKeys.boTicket(id) : supportKeys.ticket(id),
      });
      void qc.invalidateQueries({
        queryKey: staff ? ['backoffice', 'tickets'] : supportKeys.tickets,
      });
    };
    const channel = supabase
      .channel(`ticket-${id}-${staff ? 'staff' : 'customer'}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_ticket_messages',
          filter: `ticket_id=eq.${id}`,
        },
        refresh,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `id=eq.${id}` },
        refresh,
      )
      // Also catches up after the phone slept and the connection came back.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refresh();
      });
    return () => void supabase.removeChannel(channel);
  }, [id, staff, qc]);
}

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
