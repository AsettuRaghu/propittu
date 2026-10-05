import express, { Router } from 'express';
import { provider, recordPaymentEvent, webhooksReady } from '../billing/billing.js';
import { HttpError } from '../errors.js';

/**
 * Provider webhooks (M7) — AUTHORITATIVE for payment status.
 *
 * Mounted before the JSON parser: the signature is computed over the raw
 * bytes. Unsigned or tampered payloads are rejected with 401 and never
 * touch the database. Verified events are recorded idempotently.
 */
export const webhooksRouter = Router();

webhooksRouter.post(
  '/webhooks/razorpay',
  express.raw({ type: '*/*', limit: '256kb' }),
  async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const signature = req.get('x-razorpay-signature');

    if (!provider.verifyWebhook(raw, signature)) {
      req.log.warn({ hasSignature: !!signature }, 'webhook rejected: bad signature');
      throw new HttpError(401, 'UNAUTHENTICATED', 'Invalid webhook signature');
    }
    if (!webhooksReady()) {
      throw new HttpError(503, 'PAYMENTS_UNAVAILABLE', 'Payments are not configured');
    }

    let parsed;
    try {
      parsed = provider.parseWebhook(raw);
    } catch {
      throw new HttpError(400, 'VALIDATION_FAILED', 'Malformed webhook payload');
    }
    const eventId = req.get('x-razorpay-event-id') ?? parsed.eventId ?? 'unknown';
    const outcome = await recordPaymentEvent(
      eventId,
      parsed.event,
      JSON.parse(raw.toString('utf8')),
    );
    res.json({ data: { received: true, outcome } });
  },
);
