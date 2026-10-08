import { Router } from 'express';
import { z } from 'zod';
import {
  REPORT_RANGES,
  type BackofficeReport,
  type ReportBucket,
  type ReportRange,
} from '@propittu/shared';
import { auth } from '../auth.js';
import { must, ok } from '../errors.js';

/**
 * GET /backoffice/reports?range=today|month|quarter|6m|1y|all — the timeline
 * behind the Backoffice Dashboard charts and the Reports page. Mounted inside
 * backofficeRouter (active staff only). Volumes are small, so rows are read
 * and counted here; move to SQL views if they grow.
 */
export const reportsRouter = Router();

const IST_MS = 330 * 60_000;
type Step = BackofficeReport['step'];

/** The India-time wall clock of an instant, as a Date whose UTC fields read as IST. */
const ist = (ms: number) => new Date(ms + IST_MS);
/** Back from an IST wall-clock Date to the real instant (ISO). */
const real = (d: Date) => new Date(d.getTime() - IST_MS).toISOString();

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The bucket an instant falls in, and that bucket's label. */
function bucketOf(iso: string, step: Step): string {
  const d = ist(Date.parse(iso));
  const ymd = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (step === 'hour') return `${ymd}T${pad(d.getUTCHours())}`;
  if (step === 'day') return ymd;
  if (step === 'month') return ymd.slice(0, 7);
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
}

function labelOf(key: string, step: Step): string {
  const [y, m, rest] = key.split('-');
  const month = MONTHS[Number(m) - 1] ?? '';
  if (step === 'month') return `${month} ${y}`;
  const day = Number(rest?.slice(0, 2));
  if (step === 'hour') {
    const h = Number(key.slice(11, 13));
    return h === 0 ? '12 am' : h < 12 ? `${h} am` : h === 12 ? '12 pm' : `${h - 12} pm`;
  }
  return step === 'week' ? `w/c ${day} ${month}` : `${day} ${month}`;
}

/** Where a range starts (IST) and how finely it is cut. */
function rangeStart(range: ReportRange, earliest: string | null, now = Date.now()) {
  const d = ist(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const at = (yy: number, mm: number, dd = 1) => real(new Date(Date.UTC(yy, mm, dd)));
  switch (range) {
    case 'today':
      return { from: at(y, m, d.getUTCDate()), step: 'hour' as const };
    case 'month':
      return { from: at(y, m), step: 'day' as const };
    case 'quarter':
      return { from: at(y, m - (m % 3)), step: 'week' as const };
    case '6m':
      return { from: at(y, m - 5), step: 'month' as const };
    case '1y':
      return { from: at(y, m - 11), step: 'month' as const };
    case 'all': {
      const e = ist(Date.parse(earliest ?? new Date(now).toISOString()));
      return { from: at(e.getUTCFullYear(), e.getUTCMonth()), step: 'month' as const };
    }
  }
}

/** Every bucket key from `from` to now, in order. */
function bucketKeys(from: string, step: Step, now = Date.now()): string[] {
  const keys: string[] = [];
  const stepMs = { hour: 3_600_000, day: 86_400_000, week: 7 * 86_400_000 };
  if (step === 'month') {
    const d = ist(Date.parse(from));
    let y = d.getUTCFullYear();
    let m = d.getUTCMonth();
    const end = bucketOf(new Date(now).toISOString(), 'month');
    for (;;) {
      const k = `${y}-${pad(m + 1)}`;
      keys.push(k);
      if (k >= end || keys.length > 240) break;
      m++;
      if (m === 12) {
        m = 0;
        y++;
      }
    }
    return keys;
  }
  for (let t = Date.parse(from); t <= now; t += stepMs[step]) {
    const k = bucketOf(new Date(t).toISOString(), step);
    if (keys[keys.length - 1] !== k) keys.push(k);
  }
  // A range starting mid-week still needs this week's bucket.
  const last = bucketOf(new Date(now).toISOString(), step);
  if (keys[keys.length - 1] !== last) keys.push(last);
  return keys;
}

const querySchema = z.object({ range: z.enum(REPORT_RANGES).default('6m') });
const LIMIT = 20_000;

reportsRouter.get('/reports', async (req, res) => {
  const { db } = auth(req);
  const { range } = querySchema.parse(req.query);
  const first =
    range === 'all'
      ? (must<{ created_at: string }[]>(
          await db.from('accounts').select('created_at').order('created_at').limit(1),
        )[0]?.created_at ?? null)
      : null;
  const { from, step } = rangeStart(range, first);

  const [accounts, properties, created, finished, payments, refunds, tickets, resolved, ai] =
    await Promise.all([
      db.from('accounts').select('created_at').gte('created_at', from).limit(LIMIT),
      db.from('properties').select('created_at').gte('created_at', from).limit(LIMIT),
      db
        .from('service_requests')
        .select('status, created_at, confirmed_at, service:services(name)')
        .gte('created_at', from)
        .limit(LIMIT),
      db
        .from('service_requests')
        .select('status, created_at, completed_at, cancelled_at, service:services(name)')
        .in('status', ['completed', 'cancelled'])
        .gte('updated_at', from)
        .limit(LIMIT),
      db
        .from('payments')
        .select(
          'amount_paise, captured_at, order:orders(kind, request:service_requests(service:services(name)))',
        )
        .eq('status', 'captured')
        .gte('captured_at', from)
        .limit(LIMIT),
      db
        .from('refunds')
        .select('amount_paise, processed_at')
        .eq('status', 'processed')
        .gte('processed_at', from)
        .limit(LIMIT),
      db
        .from('support_tickets')
        .select('category, created_at')
        .gte('created_at', from)
        .limit(LIMIT),
      db
        .from('support_tickets')
        .select('category, resolved_at')
        .gte('resolved_at', from)
        .limit(LIMIT),
      db.from('ai_operations').select('cost_usd, created_at').gte('created_at', from).limit(LIMIT),
    ]);

  const series = new Map<string, ReportBucket>(
    bucketKeys(from, step).map((key) => [
      key,
      {
        key,
        label: labelOf(key, step),
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
        ai_cost_usd: 0,
      },
    ]),
  );
  type Num = Exclude<keyof ReportBucket, 'key' | 'label'>;
  const bump = (iso: string | null, k: Num, n = 1) => {
    if (!iso || iso < from) return false;
    const row = series.get(bucketOf(iso, step));
    if (row) row[k] += n;
    return !!row;
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

  const acceptHours: number[] = [];
  type Req = { status: string; created_at: string; service: { name: string } | null };
  for (const r of must<(Req & { confirmed_at: string | null })[]>(created)) {
    bump(r.created_at, 'requests_created');
    const s = svc(r.service?.name);
    s.requested++;
    if (r.status !== 'completed' && r.status !== 'cancelled') s.open++;
    if (r.confirmed_at)
      acceptHours.push((Date.parse(r.confirmed_at) - Date.parse(r.created_at)) / 3_600_000);
  }
  type Done = Req & { completed_at: string | null; cancelled_at: string | null };
  for (const r of must<Done[]>(finished)) {
    if (r.status === 'completed') {
      if (!bump(r.completed_at, 'requests_completed')) continue;
      const s = svc(r.service?.name);
      s.completed++;
      s.days.push((Date.parse(r.completed_at!) - Date.parse(r.created_at)) / 86_400_000);
    } else if (bump(r.cancelled_at, 'requests_cancelled')) svc(r.service?.name).cancelled++;
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
  for (const o of must<{ cost_usd: number | string; created_at: string }[]>(ai))
    bump(o.created_at, 'ai_cost_usd', Number(o.cost_usd));

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
    if (bump(t.resolved_at, 'tickets_resolved')) cat(t.category).resolved++;
  }

  const avg = (xs: number[], places = 1) =>
    xs.length
      ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10 ** places) / 10 ** places
      : null;
  const data: BackofficeReport = {
    range,
    from,
    step,
    series: [...series.values()].map((b) => ({ ...b, ai_cost_usd: +b.ai_cost_usd.toFixed(2) })),
    avg_hours_to_accept: avg(acceptHours),
    services: [...services.values()]
      .map(({ days, ...s }) => ({ ...s, avg_days_to_complete: avg(days) }))
      .sort((a, b) => b.requested - a.requested),
    tickets_by_category: [...cats.values()].sort((a, b) => b.opened - a.opened),
  };
  ok(res, data);
});
