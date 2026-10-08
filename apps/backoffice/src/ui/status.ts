import type { ServiceRequestStatus, TicketStatus } from '@propittu/shared';

export type Tone = '' | 'info' | 'good' | 'warn' | 'bad';

export const REQUEST_TONES: Record<ServiceRequestStatus, Tone> = {
  requested: 'warn',
  confirmed: 'info',
  scheduled: 'info',
  in_progress: 'info',
  awaiting_customer: 'warn',
  completed: 'good',
  cancelled: '',
};

export const TICKET_TONES: Record<TicketStatus, Tone> = {
  open: 'warn',
  in_progress: 'info',
  waiting_on_customer: '',
  resolved: 'good',
  closed: '',
};
