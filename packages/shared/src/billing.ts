import { z } from 'zod';

/**
 * Payments & Billing (M7) — Propittu-owned shapes. Provider ids appear
 * only as references.
 */

export const ORDER_STATUSES = ['pending', 'paid', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Awaiting payment',
  paid: 'Paid',
  cancelled: 'Not completed',
};

/**
 * What the customer sees: an unpaid order that is no longer being paid
 * (abandoned, failed, or replaced by a newer checkout) is "failed".
 */
export const ORDER_DISPLAY_STATUSES = ['paid', 'refunded', 'processing', 'failed'] as const;
export type OrderDisplayStatus = (typeof ORDER_DISPLAY_STATUSES)[number];
export const ORDER_DISPLAY_LABELS: Record<OrderDisplayStatus, string> = {
  paid: 'Paid',
  refunded: 'Refunded',
  processing: 'Processing',
  failed: 'Not completed',
};
/** A pending checkout older than this is treated as not completed. */
export const CHECKOUT_STALE_MINUTES = 30;

/**
 * Where a checkout stands when the customer comes back from the payment page:
 * paid · in_progress (a payment was started, e.g. a UPI approval pending) ·
 * not_started (nothing was attempted) · closed (no longer pending).
 */
export type CheckoutState = 'paid' | 'in_progress' | 'not_started' | 'closed';
export type CheckedOrder = Order & { checkout_state: CheckoutState };

/** Payments tab: completed payments from the last 4 years; unfinished attempts from the last 2 months. */
export const PAYMENT_HISTORY_YEARS = 4;
export const FAILED_PAYMENT_HISTORY_DAYS = 60;

export const PAYMENT_STATUSES = ['created', 'captured', 'failed'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface Order {
  id: string;
  reference: string;
  kind: 'plan' | 'extra_service';
  description: string;
  amount_paise: number;
  currency: 'INR';
  status: OrderStatus;
  display_status: OrderDisplayStatus;
  /** Catalogue price before any upgrade credit (equals amount when no credit). */
  list_price_paise: number;
  /** Credit for the unused part of the previous paid Plan (upgrade). */
  credit_paise: number;
  /** The Plan period this order granted (paid Plan orders). */
  period: { starts_at: string; ends_at: string } | null;
  paid_at: string | null;
  created_at: string;
  service_request_id: string | null;
  /** Latest payment attempt. */
  payment: {
    provider: string;
    status: PaymentStatus;
    method: string | null;
    provider_payment_ref: string | null;
  } | null;
  /** Sum of processed refunds, in paise. */
  refunded_paise: number;
}

/** Returned when a checkout starts: open `checkout_url` in the browser. */
export interface CheckoutSession {
  order: Order;
  checkout_url: string;
}

export interface BackofficeOrder extends Order {
  account_id: string;
  customer_phone: string | null;
}

/** What buying a Plan now would do — shown before paying (GET /billing/quote). */
export interface PlanQuote {
  mode: 'new' | 'renewal' | 'upgrade' | 'downgrade';
  plan_code: string;
  plan_name: string;
  list_price_paise: number;
  credit_paise: number;
  amount_paise: number;
  /** Unused Trial days added to the paid term. */
  bonus_days: number;
  starts_at: string;
  ends_at: string;
  current_plan_code: string | null;
  current_plan_name: string | null;
  current_ends_at: string | null;
  /** Set when this change is not allowed now (e.g. a mid-term downgrade). */
  blocked_reason: string | null;
}

export const planCheckoutSchema = z.object({
  plan_code: z.string().regex(/^[a-z][a-z0-9_]*$/, 'Choose a plan'),
});
