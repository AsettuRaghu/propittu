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

export const planCheckoutSchema = z.object({
  plan_code: z.string().regex(/^[a-z][a-z0-9_]*$/, 'Choose a plan'),
});
