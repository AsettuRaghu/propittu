import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '../env.js';
import { HttpError } from '../errors.js';
import { logger } from '../logger.js';
import type {
  CapturedEvent,
  Checkout,
  CheckoutInput,
  PaymentEvent,
  PaymentProvider,
} from './provider.js';

/**
 * Razorpay adapter (UPI + cards) using Payment Links: a hosted page the
 * app opens in the in-app browser, so no native SDK is needed.
 *
 *   https://razorpay.com/docs/api/payments/payment-links/
 *   https://razorpay.com/docs/webhooks/validate-test/
 */

const BASE = 'https://api.razorpay.com/v1';

function authHeader(): string {
  const token = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
  return `Basic ${token}`;
}

async function call<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init.method,
      headers: {
        Authorization: authHeader(),
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new HttpError(
      503,
      'INTERNAL',
      'The payment service is not reachable. Please try again.',
      undefined,
      {
        cause: err,
      },
    );
  }
  const json = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    // Razorpay errors never reach the customer verbatim.
    logger.error({ status: res.status, body: json, path }, 'razorpay request failed');
    throw new HttpError(502, 'INTERNAL', 'The payment could not be started. Please try again.');
  }
  return json as T;
}

const uuid = z.guid();
const asOrderId = (v: unknown): string | null => (uuid.safeParse(v).success ? (v as string) : null);

interface LinkPayment {
  payment_id: string;
  amount: number;
  status: string;
  method?: string;
}

export const razorpay: PaymentProvider = {
  name: 'razorpay',

  get configured() {
    return !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  },

  async createCheckout(input: CheckoutInput): Promise<Checkout> {
    const link = await call<{ id: string; short_url: string }>('/payment_links', {
      method: 'POST',
      body: {
        amount: input.amountPaise,
        currency: input.currency,
        accept_partial: false,
        description: input.description,
        // Our order reference — unique per link.
        reference_id: input.reference,
        ...(input.customerPhone ? { customer: { contact: input.customerPhone } } : {}),
        notify: { sms: false, email: false },
        reminder_enable: false,
        notes: { order_id: input.orderId },
        callback_url: input.callbackUrl,
        callback_method: 'get',
        expire_by: Math.floor(Date.now() / 1000) + 24 * 3600,
      },
    });
    return { checkoutRef: link.id, url: link.short_url };
  },

  async inspectCheckout(checkoutRef: string) {
    const link = await call<{
      id: string;
      status: string;
      amount: number;
      currency: string;
      notes?: Record<string, string>;
      payments?: LinkPayment[] | null;
    }>(`/payment_links/${encodeURIComponent(checkoutRef)}`, { method: 'GET' });
    const payments = link.payments ?? [];
    const attempted =
      link.status === 'partially_paid' || payments.some((p) => p.status !== 'failed');
    const paid = payments.find((p) => p.status === 'captured');
    if (link.status !== 'paid' || !paid) return { captured: null, attempted };
    const captured: CapturedEvent = {
      type: 'payment.captured',
      orderId: asOrderId(link.notes?.order_id),
      checkoutRef: link.id,
      paymentRef: paid.payment_id,
      amountPaise: paid.amount,
      currency: link.currency,
      method: paid.method ?? null,
    };
    return { captured, attempted: true };
  },

  async cancelCheckout(checkoutRef: string): Promise<void> {
    // Only links still in `created` can be cancelled; anything else throws.
    await call(`/payment_links/${encodeURIComponent(checkoutRef)}/cancel`, { method: 'POST' });
  },

  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean {
    if (!env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;
    const expected = createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  },

  parseWebhook(rawBody: Buffer) {
    const body = JSON.parse(rawBody.toString('utf8')) as {
      event?: string;
      payload?: {
        payment_link?: { entity?: { id?: string; notes?: Record<string, string> } };
        payment?: {
          entity?: {
            id?: string;
            amount?: number;
            currency?: string;
            method?: string;
            notes?: Record<string, string>;
          };
        };
        refund?: { entity?: { id?: string; payment_id?: string; amount?: number } };
      };
    };
    // Razorpay sends x-razorpay-event-id; the body hash is a stable fallback.
    const eventId = createHash('sha256').update(rawBody).digest('hex');
    const p = body.payload ?? {};
    const pay = p.payment?.entity;
    const link = p.payment_link?.entity;

    let event: PaymentEvent;
    if (body.event === 'payment_link.paid' && pay?.id && typeof pay.amount === 'number') {
      event = {
        type: 'payment.captured',
        orderId: asOrderId(link?.notes?.order_id ?? pay.notes?.order_id),
        checkoutRef: link?.id ?? null,
        paymentRef: pay.id,
        amountPaise: pay.amount,
        currency: pay.currency ?? '',
        method: pay.method ?? null,
      };
    } else if (body.event === 'payment.failed' && pay?.notes?.order_id) {
      event = {
        type: 'payment.failed',
        orderId: asOrderId(pay.notes.order_id),
        checkoutRef: null,
        paymentRef: pay.id ?? null,
      };
    } else if (
      body.event === 'refund.processed' &&
      p.refund?.entity?.id &&
      p.refund.entity.payment_id &&
      typeof p.refund.entity.amount === 'number'
    ) {
      event = {
        type: 'refund.processed',
        paymentRef: p.refund.entity.payment_id,
        refundRef: p.refund.entity.id,
        amountPaise: p.refund.entity.amount,
      };
    } else {
      event = { type: 'ignored', providerType: body.event ?? 'unknown' };
    }
    return { eventId, event };
  },
};
