import type { SupabaseClient } from '@supabase/supabase-js';
import type { Order } from '@propittu/shared';
import { must, notFound } from '../errors.js';

export const ORDER_COLUMNS =
  'id, reference, kind, description, amount_paise, currency, status, paid_at, created_at, ' +
  'service_request_id, account_id, ' +
  'payments(provider, status, method, provider_payment_ref, provider_checkout_ref, created_at, ' +
  'refunds(amount_paise, status))';

export interface OrderRow extends Omit<Order, 'payment' | 'refunded_paise'> {
  account_id: string;
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

export function toOrder(row: OrderRow): Order {
  const p = latestPayment(row);
  return {
    id: row.id,
    reference: row.reference,
    kind: row.kind,
    description: row.description,
    amount_paise: row.amount_paise,
    currency: row.currency,
    status: row.status,
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
    refunded_paise: row.payments
      .flatMap((x) => x.refunds)
      .filter((r) => r.status === 'processed')
      .reduce((n, r) => n + r.amount_paise, 0),
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
