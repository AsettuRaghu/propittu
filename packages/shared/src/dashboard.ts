import type { ServiceRequestStatus } from './constants';

/** Backoffice Dashboard: today at a glance (GET /backoffice/dashboard). */
export interface BackofficeDashboard {
  /** Open requests by status. */
  requests: Partial<Record<ServiceRequestStatus, number>>;
  /** Open requests past their expected date. */
  overdue: number;
  /** Visits scheduled in the next 7 days. */
  visits_this_week: number;
  /** Tickets waiting on our team (open or in progress). */
  tickets_waiting: number;
  payments_today: { count: number; amount_paise: number };
  /** Money that arrived for something already paid or no longer valid. */
  refunds_needed: {
    event_id: string;
    received_at: string;
    order_reference: string | null;
    amount_paise: number | null;
    customer_name: string | null;
    description: string | null;
  }[];
  new_customers_7d: number;
  /** Pittu's AI cost this calendar month (US$). */
  ai_spend_month_usd: number;
}
