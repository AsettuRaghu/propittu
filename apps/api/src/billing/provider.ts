/**
 * Payment Provider Interface (M7).
 *
 *   Propittu Billing (orders, payments, Plan status — ours)
 *     → PaymentProvider (this interface)
 *       → Razorpay adapter (today); others can be added beside it
 *
 * Providers execute payments; Propittu owns the business records. Provider
 * ids are stored only as references.
 */

export interface CheckoutInput {
  orderId: string;
  reference: string;
  amountPaise: number;
  currency: 'INR';
  description: string;
  customerPhone: string | null;
  callbackUrl: string;
}

export interface Checkout {
  /** Provider's checkout object id (e.g. Razorpay plink_…). */
  checkoutRef: string;
  /** Hosted page where the customer pays (UPI, cards…). */
  url: string;
}

/** Provider-neutral events, as understood by record_payment_event(). */
export type PaymentEvent =
  | {
      type: 'payment.captured';
      orderId: string | null;
      checkoutRef: string | null;
      paymentRef: string;
      amountPaise: number;
      currency: string;
      method: string | null;
    }
  | {
      type: 'payment.failed';
      orderId: string | null;
      checkoutRef: string | null;
      paymentRef: string | null;
    }
  | { type: 'refund.processed'; paymentRef: string; refundRef: string; amountPaise: number }
  | { type: 'ignored'; providerType: string };

/** A provider event for a captured (paid) payment. */
export type CapturedEvent = Extract<PaymentEvent, { type: 'payment.captured' }>;

export interface PaymentProvider {
  readonly name: 'razorpay';
  /** False until the provider's keys are configured. */
  readonly configured: boolean;
  createCheckout(input: CheckoutInput): Promise<Checkout>;
  /**
   * Server-to-server status of a checkout — used to reconcile when a
   * webhook is late. Never based on anything the app reports.
   * `captured`: the payment, if paid. `attempted`: a payment was started
   * (e.g. a UPI approval pending) even if not captured yet.
   */
  inspectCheckout(
    checkoutRef: string,
  ): Promise<{ captured: CapturedEvent | null; attempted: boolean }>;
  /** Stops an unpaid checkout from being paid later (best effort). */
  cancelCheckout(checkoutRef: string): Promise<void>;
  /** True only if the payload was signed with our webhook secret. */
  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean;
  parseWebhook(rawBody: Buffer): { eventId: string | null; event: PaymentEvent };
}
