import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

type Live = {
  /** Tickets with a customer reply not yet opened in this browser tab. */
  unseen: ReadonlySet<string>;
  markSeen: (ticketId: string) => void;
};

const LiveContext = createContext<Live>({ unseen: new Set(), markSeen: () => {} });
export const useLive = () => useContext(LiveContext);

const TITLE = document.title;

/**
 * Listens to Supabase Realtime for support tickets and messages. Each change
 * refetches the affected screens through the API (so they look exactly as on
 * a normal load); nothing is rendered from the pushed rows themselves.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [unseen, setUnseen] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const refresh = (ticketId?: string) => {
      void qc.invalidateQueries({ queryKey: ['bo-tickets'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (ticketId) void qc.invalidateQueries({ queryKey: ['bo-ticket', ticketId] });
    };
    const channel = supabase
      .channel('backoffice-support')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_ticket_messages' },
        (p) => {
          const row = p.new as { ticket_id: string; author_type: string };
          if (row.author_type === 'customer') setUnseen((s) => new Set(s).add(row.ticket_id));
          refresh(row.ticket_id);
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, (p) =>
        refresh((p.new as { id?: string }).id),
      )
      .subscribe((status) => {
        // After a dropped connection (laptop asleep, network blip), catch up once.
        if (status === 'SUBSCRIBED') refresh();
      });
    return () => void supabase.removeChannel(channel);
  }, [qc]);

  useEffect(() => {
    document.title = unseen.size ? `(${unseen.size}) ${TITLE}` : TITLE;
  }, [unseen]);

  const markSeen = useCallback((ticketId: string) => {
    setUnseen((s) => {
      if (!s.has(ticketId)) return s;
      const next = new Set(s);
      next.delete(ticketId);
      return next;
    });
  }, []);

  return <LiveContext.Provider value={{ unseen, markSeen }}>{children}</LiveContext.Provider>;
}
