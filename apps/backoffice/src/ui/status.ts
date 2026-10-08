import type { OrderDisplayStatus, ServiceRequestStatus } from '@propittu/shared';

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

export const ORDER_TONES: Record<OrderDisplayStatus, Tone> = {
  paid: 'good',
  refunded: '',
  processing: 'warn',
  failed: 'bad',
};
