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

/** One calendar month (India time) in the Backoffice report. */
export interface ReportMonth {
  /** "2026-10" */
  month: string;
  new_customers: number;
  properties_added: number;
  requests_created: number;
  requests_completed: number;
  requests_cancelled: number;
  tickets_opened: number;
  tickets_resolved: number;
  plan_revenue_paise: number;
  extra_revenue_paise: number;
  refunds_paise: number;
}

/** GET /backoffice/reports?months=3|6|12 — monthly totals and a per-service view. */
export interface BackofficeReport {
  months: ReportMonth[];
  services: {
    service: string;
    requested: number;
    completed: number;
    cancelled: number;
    open: number;
    revenue_paise: number;
    /** Average days from request to completion (completed only). */
    avg_days_to_complete: number | null;
  }[];
  tickets_by_category: { category: string; opened: number; resolved: number }[];
}
