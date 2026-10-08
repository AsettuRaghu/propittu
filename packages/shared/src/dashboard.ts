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
  /** Pittu work waiting for the team. */
  pittu: {
    /** Pittu Watch news to approve or reject. */
    watch_to_review: number;
    /** Pittu Legal checks in review, and the amber/red findings still open in them. */
    legal_in_review: number;
    legal_open_findings: number;
    /** Pittu Value rate rows read from documents, not yet published. */
    value_rows_to_check: number;
  };
}

export const REPORT_RANGES = ['today', 'month', 'quarter', '6m', '1y', 'all'] as const;
export type ReportRange = (typeof REPORT_RANGES)[number];
export const REPORT_RANGE_LABELS: Record<ReportRange, string> = {
  today: 'Today',
  month: 'This month',
  quarter: 'This quarter',
  '6m': 'Last 6 months',
  '1y': 'Last 12 months',
  all: 'All time',
};

/** One step on the report timeline (an hour, day, week or month, India time). */
export interface ReportBucket {
  /** Sortable key, e.g. "2026-10", "2026-10-08" or "2026-10-08T14". */
  key: string;
  /** Short label for charts and tables, e.g. "Oct 2026", "8 Oct", "2 pm". */
  label: string;
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
  ai_cost_usd: number;
}

/** GET /backoffice/reports?range=… — a timeline plus per-service and support views. */
export interface BackofficeReport {
  range: ReportRange;
  from: string;
  step: 'hour' | 'day' | 'week' | 'month';
  series: ReportBucket[];
  /** Average hours from a request being made to our team accepting it. */
  avg_hours_to_accept: number | null;
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
  /** Pittu's AI cost in the period by capability (read, watch, value, legal, ask). */
  ai_by_capability: { capability: string; calls: number; cost_usd: number }[];
}
