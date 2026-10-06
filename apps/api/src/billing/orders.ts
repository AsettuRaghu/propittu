import type { SupabaseClient } from '@supabase/supabase-js';
import { CHECKOUT_STALE_MINUTES, type Order, type OrderDisplayStatus } from '@propittu/shared';
import { must, notFound } from '../errors.js';

export const ORDER_COLUMNS =
  'id, reference, kind, description, amount_paise, currency, status, paid_at, created_at, ' +
  'service_request_id, account_id, list_price_paise, credit_paise, ' +
  'account_plan:account_plans!orders_account_plan_id_fkey(starts_at, ends_at), ' +
  'payments(provider, status, method, provider_payment_ref, provider_checkout_ref, created_at, ' +
  'refunds(amount_paise, status))';

export interface OrderRow extends Omit<
  Order,
  'payment' | 'refunded_paise' | 'display_status' | 'period' | 'list_price_paise'
> {
  account_id: string;
  list_price_paise: number | null;
  account_plan: { starts_at: string; ends_at: string } | null;
  payments: {
    provider: string;
    status: 'created' | 'captured' | 'failed';
    method: string | null;
    provider_payment_ref: string | null;
    provider_checkout_ref: string | null;
    created_at: string;
    refunds: { amount_paise: number; status: string }[];
  }[];
}

export function latestPayment(row: OrderRow) {
  return [...row.payments].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

function displayStatus(
  row: OrderRow,
  p: ReturnType<typeof latestPayment>,
  refunded: number,
): OrderDisplayStatus {
  if (row.status === 'paid') return refunded >= row.amount_paise ? 'refunded' : 'paid';
  const fresh = Date.now() - new Date(row.created_at).getTime() < CHECKOUT_STALE_MINUTES * 60_000;
  return row.status === 'pending' && fresh && p?.status !== 'failed' ? 'processing' : 'failed';
}

export function toOrder(row: OrderRow): Order {
  const p = latestPayment(row);
  const refunded = row.payments
    .flatMap((x) => x.refunds)
    .filter((r) => r.status === 'processed')
    .reduce((n, r) => n + r.amount_paise, 0);
  return {
    id: row.id,
    reference: row.reference,
    kind: row.kind,
    description: row.description,
    amount_paise: row.amount_paise,
    currency: row.currency,
    status: row.status,
    display_status: displayStatus(row, p, refunded),
    list_price_paise: row.list_price_paise ?? row.amount_paise,
    credit_paise: row.credit_paise ?? 0,
    period: row.account_plan
      ? { starts_at: row.account_plan.starts_at, ends_at: row.account_plan.ends_at }
      : null,
    paid_at: row.paid_at,
    created_at: row.created_at,
    service_request_id: row.service_request_id,
    payment: p
      ? {
          provider: p.provider,
          status: p.status,
          method: p.method,
          provider_payment_ref: p.provider_payment_ref,
        }
      : null,
    refunded_paise: refunded,
  };
}

export async function loadOrderRow(
  db: SupabaseClient,
  id: string,
  accountId?: string,
): Promise<OrderRow> {
  let q = db.from('orders').select(ORDER_COLUMNS).eq('id', id);
  if (accountId) q = q.eq('account_id', accountId);
  const row = must<OrderRow | null>(await q.maybeSingle());
  if (!row) throw notFound('Order');
  return row;
}

/** Latest non-cancelled order for a service request (Extra Service payment status). */
export async function orderForRequest(
  db: SupabaseClient,
  requestId: string,
): Promise<Order | null> {
  const rows = must<OrderRow[]>(
    await db
      .from('orders')
      .select(ORDER_COLUMNS)
      .eq('service_request_id', requestId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1),
  );
  return rows[0] ? toOrder(rows[0]) : null;
}
