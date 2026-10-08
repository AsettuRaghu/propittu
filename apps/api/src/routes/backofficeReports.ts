import { Router } from 'express';
import { z } from 'zod';
import type { BackofficeReport, ReportMonth } from '@propittu/shared';
import { auth } from '../auth.js';
import { must, ok } from '../errors.js';

/**
 * GET /backoffice/reports — month-by-month totals for the Backoffice portal's
 * Reports page. Mounted inside backofficeRouter (active staff only). Volumes
 * are small, so rows are read and counted here; move to SQL views if they grow.
 */
export const reportsRouter = Router();

const IST_MS = 330 * 60_000;
const monthOf = (iso: string) => new Date(Date.parse(iso) + IST_MS).toISOString().slice(0, 7);

/** Start (UTC ISO) of the month `back` months before this one, in India time. */
function monthStart(back: number, now = new Date()): string {
  const ist = new Date(now.getTime() + IST_MS);
  const d = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - back, 1);
  return new Date(d - IST_MS).toISOString();
}

const querySchema = z.object({
  months: z.coerce
    .number()
    .int()
    .refine((n) => [3, 6, 12].includes(n))
    .default(6),
});

const LIMIT = 20_000;

reportsRouter.get('/reports', async (req, res) => {
  const { db } = auth(req);
  const { months } = querySchema.parse(req.query);
  const since = monthStart(months - 1);

  const [accounts, properties, created, finished, payments, refunds, tickets, resolved] =
    await Promise.all([
      db.from('accounts').select('created_at').gte('created_at', since).limit(LIMIT),
      db.from('properties').select('created_at').gte('created_at', since).limit(LIMIT),
      db
        .from('service_requests')
        .select('status, created_at, service:services(name)')
        .gte('created_at', since)
        .limit(LIMIT),
      db
        .from('service_requests')
        .select('status, created_at, completed_at, updated_at, service:services(name)')
        .in('status', ['completed', 'cancelled'])
        .gte('updated_at', since)
        .limit(LIMIT),
      db
        .from('payments')
        .select(
          'amount_paise, captured_at, order:orders(kind, request:service_requests(service:services(name)))',
        )
        .eq('status', 'captured')
        .gte('captured_at', since)
        .limit(LIMIT),
      db
        .from('refunds')
        .select('amount_paise, processed_at')
        .eq('status', 'processed')
        .gte('processed_at', since)
        .limit(LIMIT),
      db
        .from('support_tickets')
        .select('category, created_at')
        .gte('created_at', since)
        .limit(LIMIT),
      db
        .from('support_tickets')
        .select('category, resolved_at')
        .gte('resolved_at', since)
        .limit(LIMIT),
    ]);

  const byMonth = new Map<string, ReportMonth>();
  for (let i = months - 1; i >= 0; i--) {
    const m = monthOf(monthStart(i));
    byMonth.set(m, {
      month: m,
      new_customers: 0,
      properties_added: 0,
      requests_created: 0,
      requests_completed: 0,
      requests_cancelled: 0,
      tickets_opened: 0,
      tickets_resolved: 0,
      plan_revenue_paise: 0,
      extra_revenue_paise: 0,
      refunds_paise: 0,
    });
  }
  const bump = (iso: string | null, k: keyof Omit<ReportMonth, 'month'>, n = 1) => {
    const row = iso ? byMonth.get(monthOf(iso)) : undefined;
    if (row) row[k] += n;
  };

  type Svc = BackofficeReport['services'][number] & { days: number[] };
  const services = new Map<string, Svc>();
  const svc = (name: string | undefined) => {
    const key = name ?? 'Service removed';
    let s = services.get(key);
    if (!s) {
      s = {
        service: key,
        requested: 0,
        completed: 0,
        cancelled: 0,
        open: 0,
        revenue_paise: 0,
        avg_days_to_complete: null,
        days: [],
      };
      services.set(key, s);
    }
    return s;
  };

  for (const a of must<{ created_at: string }[]>(accounts)) bump(a.created_at, 'new_customers');
  for (const p of must<{ created_at: string }[]>(properties))
    bump(p.created_at, 'properties_added');

  type Req = { status: string; created_at: string; service: { name: string } | null };
  for (const r of must<Req[]>(created)) {
    bump(r.created_at, 'requests_created');
    const s = svc(r.service?.name);
    s.requested++;
    if (r.status !== 'completed' && r.status !== 'cancelled') s.open++;
  }
  for (const r of must<(Req & { completed_at: string | null; updated_at: string })[]>(finished)) {
    const s = svc(r.service?.name);
    if (r.status === 'completed') {
      const at = r.completed_at ?? r.updated_at;
      if (at < since) continue;
      bump(at, 'requests_completed');
      s.completed++;
      s.days.push((Date.parse(at) - Date.parse(r.created_at)) / 86_400_000);
    } else {
      bump(r.updated_at, 'requests_cancelled');
      s.cancelled++;
    }
  }

  type Pay = {
    amount_paise: number;
    captured_at: string | null;
    order: { kind: string; request: { service: { name: string } | null } | null } | null;
  };
  for (const p of must<Pay[]>(payments)) {
    if (p.order?.kind === 'extra_service') {
      bump(p.captured_at, 'extra_revenue_paise', p.amount_paise);
      svc(p.order.request?.service?.name).revenue_paise += p.amount_paise;
    } else bump(p.captured_at, 'plan_revenue_paise', p.amount_paise);
  }
  for (const r of must<{ amount_paise: number; processed_at: string | null }[]>(refunds))
    bump(r.processed_at, 'refunds_paise', r.amount_paise);

  const cats = new Map<string, { category: string; opened: number; resolved: number }>();
  const cat = (c: string) => {
    let row = cats.get(c);
    if (!row) cats.set(c, (row = { category: c, opened: 0, resolved: 0 }));
    return row;
  };
  for (const t of must<{ category: string; created_at: string }[]>(tickets)) {
    bump(t.created_at, 'tickets_opened');
    cat(t.category).opened++;
  }
  for (const t of must<{ category: string; resolved_at: string | null }[]>(resolved)) {
    bump(t.resolved_at, 'tickets_resolved');
    cat(t.category).resolved++;
  }

  const data: BackofficeReport = {
    months: [...byMonth.values()],
    services: [...services.values()]
      .map(({ days, ...s }) => ({
        ...s,
        avg_days_to_complete: days.length
          ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10
          : null,
      }))
      .sort((a, b) => b.requested - a.requested),
    tickets_by_category: [...cats.values()].sort((a, b) => b.opened - a.opened),
  };
  ok(res, data);
});
