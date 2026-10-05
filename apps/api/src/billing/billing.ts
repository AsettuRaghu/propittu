import { HttpError, must } from '../errors.js';
import { logger } from '../logger.js';
import { notify } from '../notify.js';
import { serviceClient } from '../supabase.js';
import type { PaymentEvent, PaymentProvider } from './provider.js';
import { razorpay } from './razorpay.js';

/**
 * Propittu Billing Service (M7): the only code that turns a VERIFIED
 * provider event into Propittu records. Provider specifics stay in the
 * adapters; the rules (amount check, idempotency, Plan activation,
 * renewal queueing) live in record_payment_event() in Postgres.
 */

/** The active provider. Adding one = a new adapter + selecting it here. */
export const provider: PaymentProvider = razorpay;

export function paymentsReady(): boolean {
  return provider.configured && serviceClient !== null;
}

/** Webhooks need only the server key to record events (and the webhook secret to verify). */
export function webhooksReady(): boolean {
  return serviceClient !== null;
}

export function assertPaymentsReady(): void {
  if (!paymentsReady()) {
    throw new HttpError(
      503,
      'PAYMENTS_UNAVAILABLE',
      'Online payment is not available yet. Please try again later or contact support.',
    );
  }
}

/** Records a verified event. Returns the outcome (e.g. plan_activated, duplicate). */
export async function recordPaymentEvent(
  eventId: string,
  event: PaymentEvent,
  payload: unknown,
): Promise<string> {
  if (!serviceClient) throw new Error('SUPABASE_SECRET_KEY is not configured');
  const args =
    event.type === 'payment.captured'
      ? {
          p_order: event.orderId,
          p_checkout_ref: event.checkoutRef,
          p_payment_ref: event.paymentRef,
          p_amount: event.amountPaise,
          p_currency: event.currency,
          p_method: event.method,
        }
      : event.type === 'payment.failed'
        ? {
            p_order: event.orderId,
            p_checkout_ref: event.checkoutRef,
            p_payment_ref: event.paymentRef,
          }
        : event.type === 'refund.processed'
          ? {
              p_payment_ref: event.paymentRef,
              p_refund_ref: event.refundRef,
              p_amount: event.amountPaise,
            }
          : {};

  const outcome = must<string>(
    await serviceClient.rpc('record_payment_event', {
      p_provider: provider.name,
      p_event_id: eventId,
      p_event_type: event.type === 'ignored' ? `ignored:${event.providerType}` : event.type,
      p_payload: payload ?? {},
      ...args,
    }),
  );
  logger.info(
    { provider: provider.name, eventId, type: event.type, outcome },
    'payment event recorded',
  );
  if (outcome === 'plan_activated' || outcome === 'paid') {
    notify({
      type: 'payment.received',
      orderId: event.type === 'payment.captured' ? event.orderId : null,
    });
  }
  if (outcome === 'amount_mismatch' || outcome === 'unknown_order') {
    logger.error({ eventId, outcome }, 'payment event needs staff attention');
  }
  return outcome;
}
