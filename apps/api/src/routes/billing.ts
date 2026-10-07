import { Router } from 'express';
import {
  type CheckedOrder,
  type CheckoutState,
  PAYMENT_HISTORY_MONTHS,
  planCheckoutSchema,
  type CheckoutSession,
  type PlanQuote,
} from '@propittu/shared';
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
import { HttpError, must, ok, uuidParam } from '../errors.js';

/**
 * Payments for the signed-in customer (M7). Mounted BEFORE the Limited
 * Access gate: an expired customer must be able to pay to continue.
 *
 *   GET  /billing/quote?plan_code=                → price, upgrade credit, new period
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

async function quote(ctx: AuthContext, planCode: string): Promise<PlanQuote> {
  return must<PlanQuote>(await ctx.db.rpc('plan_quote', { p_plan_code: planCode }));
}

/* GET /billing/quote?plan_code= — what buying this Plan now costs and grants */
billingRouter.get('/billing/quote', async (req, res) => {
  const ctx = auth(req);
  const { plan_code } = planCheckoutSchema.parse(req.query);
  ok(res, await quote(ctx, plan_code));
});

/* POST /billing/checkout {plan_code} — buy, renew or upgrade a Plan */
billingRouter.post('/billing/checkout', async (req, res) => {
  const ctx = auth(req);
  const { plan_code } = planCheckoutSchema.parse(req.body);
  assertPaymentsReady();
  const q = await quote(ctx, plan_code);
  if (q.blocked_reason) throw new HttpError(409, 'CONFLICT', q.blocked_reason);
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

/*
 * GET /billing/orders — this Account's payments (paid or not) from the last
 * PAYMENT_HISTORY_MONTHS, newest first. (Records are kept longer, as the law
 * requires; this only limits what the app shows and loads.)
 */
billingRouter.get('/billing/orders', async (req, res) => {
  const { db, accountId } = auth(req);
  const since = new Date();
  since.setMonth(since.getMonth() - PAYMENT_HISTORY_MONTHS);
  const rows = must<OrderRow[]>(
    await db
      .from('orders')
      .select(ORDER_COLUMNS)
      .eq('account_id', accountId)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(100),
  );
  ok(res, rows.map(toOrder));
});

/* GET /billing/orders/:id */
billingRouter.get('/billing/orders/:id', async (req, res) => {
  const { db, accountId } = auth(req);
  ok(res, toOrder(await loadOrderRow(db, uuidParam(req.params.id, 'Order'), accountId)));
});

/**
 * Where an order's checkout stands, asking the provider directly when it is
 * still pending (server-to-server, with our key) and recording a capture
 * the webhook hasn't delivered yet. Nothing the app sends is trusted.
 */
async function checkOrder(ctx: AuthContext, id: string): Promise<CheckedOrder> {
  const { db, accountId } = ctx;
  let row = await loadOrderRow(db, id, accountId);
  const checkoutRef = latestPayment(row)?.provider_checkout_ref;
  let state: CheckoutState = row.status === 'paid' ? 'paid' : 'closed';
  if (row.status === 'pending') {
    state = 'in_progress';
    if (checkoutRef && paymentsReady()) {
      const { captured, attempted } = await provider.inspectCheckout(checkoutRef);
      if (captured) {
        await recordPaymentEvent(
          `fetch:${captured.paymentRef}`,
          { ...captured, orderId: row.id },
          { source: 'fetch' },
        );
        row = await loadOrderRow(db, id, accountId);
        state = row.status === 'paid' ? 'paid' : 'in_progress';
      } else {
        state = attempted ? 'in_progress' : 'not_started';
      }
    }
  }
  return { ...toOrder(row), checkout_state: state };
}

/* POST /billing/orders/:id/refresh — after the customer returns from the payment page */
billingRouter.post('/billing/orders/:id/refresh', async (req, res) => {
  ok(res, await checkOrder(auth(req), uuidParam(req.params.id, 'Order')));
});

/*
 * POST /billing/orders/:id/abandon — the customer came back without paying.
 * Only when the provider shows no payment attempt: cancel the payment link
 * (so it can't be paid later by mistake) and close the order, which then
 * shows as "Not completed". A payment in progress is left alone.
 */
billingRouter.post('/billing/orders/:id/abandon', async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Order');
  const checked = await checkOrder(ctx, id);
  if (checked.checkout_state !== 'not_started') return ok(res, checked);

  const row = await loadOrderRow(ctx.db, id, ctx.accountId);
  const checkoutRef = latestPayment(row)?.provider_checkout_ref;
  if (checkoutRef) {
    try {
      await provider.cancelCheckout(checkoutRef);
    } catch {
      // Not cancellable any more (e.g. paid this second) — look again.
      const again = await checkOrder(ctx, id);
      if (again.checkout_state !== 'not_started') return ok(res, again);
    }
  }
  must(await ctx.db.rpc('abandon_order', { p_order: id }));
  await audit(ctx, 'billing.checkout_abandoned', { type: 'order', id });
  ok(res, await checkOrder(ctx, id));
});
