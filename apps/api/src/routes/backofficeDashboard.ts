import { Router } from 'express';
import {
  OPEN_REQUEST_STATUSES,
  requestExpectedBy,
  type BackofficeDashboard,
  type ServiceRequestStatus,
} from '@propittu/shared';
import { auth } from '../auth.js';
import { must, ok } from '../errors.js';
import { serviceClient } from '../supabase.js';

/**
 * GET /backoffice/dashboard — the Backoffice portal's "today at a glance".
 * Mounted inside backofficeRouter, so only active staff reach it. A handful
 * of parallel reads; nothing here is heavy.
 */
export const dashboardRouter = Router();

/** Midnight today in India (IST, UTC+5:30), as an ISO time. */
function todayStartIst(now = new Date()): string {
  const ist = new Date(now.getTime() + 330 * 60_000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 330 * 60_000).toISOString();
}

dashboardRouter.get('/dashboard', async (req, res) => {
  const { db } = auth(req);
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  const [openRes, ticketsRes, paymentsRes, refundsRes, customersRes, spend] = await Promise.all([
    db
      .from('service_requests')
      .select('status, scheduled_for, confirmed_at, created_at, service:services(expected_days)')
      .in('status', OPEN_REQUEST_STATUSES),
    db
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('awaiting_staff', true),
    db
      .from('payments')
      .select('amount_paise')
      .eq('status', 'captured')
      .gte('captured_at', todayStartIst(now)),
    db
      .from('payment_events')
      .select('id, received_at, order:orders(reference, amount_paise, description, user_id)')
      .in('outcome', ['refund_needed', 'already_paid'])
      .order('received_at', { ascending: false })
      .limit(20),
    db.from('accounts').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
    serviceClient ? serviceClient.rpc('ai_month_spend_usd') : Promise.resolve({ data: 0 }),
  ]);

  const open = must<
    {
      status: ServiceRequestStatus;
      scheduled_for: string | null;
      confirmed_at: string | null;
      created_at: string;
      service: { expected_days: number | null } | null;
    }[]
  >(openRes);
  const requests: BackofficeDashboard['requests'] = {};
  let overdue = 0;
  let visits = 0;
  for (const r of open) {
    requests[r.status] = (requests[r.status] ?? 0) + 1;
    const due = requestExpectedBy({
      ...r,
      service: { expected_days: r.service?.expected_days ?? null },
    });
    if (due && Date.parse(due) < now.getTime()) overdue++;
    if (r.status === 'scheduled' && r.scheduled_for && r.scheduled_for <= weekAhead) visits++;
  }

  must(ticketsRes);
  must(customersRes);
  const payments = must<{ amount_paise: number }[]>(paymentsRes);
  const refundRows = must<
    {
      id: string;
      received_at: string;
      order: {
        reference: string;
        amount_paise: number;
        description: string;
        user_id: string;
      } | null;
    }[]
  >(refundsRes);
  const userIds = [...new Set(refundRows.flatMap((r) => (r.order ? [r.order.user_id] : [])))];
  const names = new Map(
    userIds.length === 0
      ? []
      : must<{ id: string; full_name: string | null }[]>(
          await db.from('profiles').select('id, full_name').in('id', userIds),
        ).map((p) => [p.id, p.full_name]),
  );

  const data: BackofficeDashboard = {
    requests,
    overdue,
    visits_this_week: visits,
    tickets_waiting: ticketsRes.count ?? 0,
    payments_today: {
      count: payments.length,
      amount_paise: payments.reduce((n, p) => n + p.amount_paise, 0),
    },
    refunds_needed: refundRows.map((r) => ({
      event_id: r.id,
      received_at: r.received_at,
      order_reference: r.order?.reference ?? null,
      amount_paise: r.order?.amount_paise ?? null,
      customer_name: r.order ? (names.get(r.order.user_id) ?? null) : null,
      description: r.order?.description ?? null,
    })),
    new_customers_7d: customersRes.count ?? 0,
    ai_spend_month_usd: Number(spend.data ?? 0),
  };
  ok(res, data);
});
