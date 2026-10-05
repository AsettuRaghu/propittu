import { Router } from 'express';
import { planCheckoutSchema, type CheckoutSession, type Order } from '@propittu/shared';
import { auth, type AuthContext } from '../auth.js';
import { audit } from '../audit.js';
import {
  assertPaymentsReady,
  paymentsReady,
  provider,
  recordPaymentEvent,
} from '../billing/billing.js';
import {
  latestPayment,
  loadOrderRow,
  ORDER_COLUMNS,
  toOrder,
  type OrderRow,
} from '../billing/orders.js';
import { publicApiUrl } from '../env.js';
import { must, ok, uuidParam } from '../errors.js';

/**
 * Payments for the signed-in customer (M7). Mounted BEFORE the Limited
 * Access gate: an expired customer must be able to pay to continue.
 *
 *   POST /billing/checkout {plan_code}            → order + hosted payment page
 *   POST /billing/service-requests/:id/checkout   → same, for an Extra Service
 *   GET  /billing/orders, GET /billing/orders/:id
 *   POST /billing/orders/:id/refresh              → reconcile with the provider
 *
 * The app NEVER marks anything paid. A payment counts only when the
 * provider's signed webhook (or a server-to-server status fetch) says so.
 */
export const billingRouter = Router();

/* Public (no login): where the hosted payment page sends the customer back. */
export const billingReturnRouter = Router();
billingReturnRouter.get('/billing/return', (_req, res) => {
  res.type('html')
    .send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Propittu</title><style>body{font-family:-apple-system,system-ui,sans-serif;background:#F6F7F6;color:#14201C;
display:flex;min-height:90vh;align-items:center;justify-content:center;text-align:center;padding:24px}
h1{font-size:22px}p{color:#5D6964}</style></head><body><div><h1>Thank you</h1>
<p>You can close this page and return to the Propittu app.<br>Your plan or payment status updates there automatically.</p></div></body></html>`);
});

async function startCheckout(ctx: AuthContext, orderId: string): Promise<CheckoutSession> {
  const row = await loadOrderRow(ctx.db, orderId, ctx.accountId);
  const checkout = await provider.createCheckout({
    orderId: row.id,
    reference: row.reference,
    amountPaise: row.amount_paise,
    currency: row.currency,
    description: row.description,
    customerPhone: ctx.phone,
    callbackUrl: `${publicApiUrl}/billing/return`,
  });
  must(
    await ctx.db.rpc('attach_checkout', {
      p_order: row.id,
      p_provider: provider.name,
      p_checkout_ref: checkout.checkoutRef,
      p_url: checkout.url,
    }),
  );
  await audit(
    ctx,
    'order.checkout_started',
    { type: 'order', id: row.id },
    {
      reference: row.reference,
      amount_paise: row.amount_paise,
      provider: provider.name,
    },
  );
  return {
    order: toOrder(await loadOrderRow(ctx.db, row.id, ctx.accountId)),
    checkout_url: checkout.url,
  };
}

/* POST /billing/checkout {plan_code} — buy or renew a Plan */
billingRouter.post('/billing/checkout', async (req, res) => {
  const ctx = auth(req);
  const { plan_code } = planCheckoutSchema.parse(req.body);
  assertPaymentsReady();
  const orderId = must<string>(await ctx.db.rpc('create_plan_order', { p_plan_code: plan_code }));
  ok(res, await startCheckout(ctx, orderId), 201);
});

/* POST /billing/service-requests/:id/checkout — pay for an Extra Service */
billingRouter.post('/billing/service-requests/:id/checkout', async (req, res) => {
  const ctx = auth(req);
  const requestId = uuidParam(req.params.id, 'Service request');
  assertPaymentsReady();
  const orderId = must<string>(await ctx.db.rpc('create_service_order', { p_request: requestId }));
  ok(res, await startCheckout(ctx, orderId), 201);
});

/* GET /billing/orders — this Account's payment history */
billingRouter.get('/billing/orders', async (req, res) => {
  const { db, accountId } = auth(req);
  const rows = must<OrderRow[]>(
    await db
      .from('orders')
      .select(ORDER_COLUMNS)
      .eq('account_id', accountId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(50),
  );
  ok(res, rows.map(toOrder));
});

/* GET /billing/orders/:id */
billingRouter.get('/billing/orders/:id', async (req, res) => {
  const { db, accountId } = auth(req);
  ok(res, toOrder(await loadOrderRow(db, uuidParam(req.params.id, 'Order'), accountId)));
});

/*
 * POST /billing/orders/:id/refresh — the app calls this after the customer
 * returns from the payment page. If the webhook has not arrived yet, ask
 * the provider directly (server-to-server, with our key). Nothing the app
 * sends is trusted.
 */
billingRouter.post('/billing/orders/:id/refresh', async (req, res) => {
  const { db, accountId } = auth(req);
  const id = uuidParam(req.params.id, 'Order');
  let row = await loadOrderRow(db, id, accountId);
  const checkoutRef = latestPayment(row)?.provider_checkout_ref;

  if (row.status === 'pending' && checkoutRef && paymentsReady()) {
    const event = await provider.fetchCheckout(checkoutRef);
    if (event?.type === 'payment.captured') {
      await recordPaymentEvent(
        `fetch:${event.paymentRef}`,
        { ...event, orderId: row.id },
        { source: 'fetch' },
      );
      row = await loadOrderRow(db, id, accountId);
    }
  }
  const data: Order = toOrder(row);
  ok(res, data);
});
