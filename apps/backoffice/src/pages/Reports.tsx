import { useQuery } from '@tanstack/react-query';
import {
  TICKET_CATEGORY_LABELS,
  type BackofficeReport,
  type ReportMonth,
  type TicketCategory,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { rupees } from '../lib/format';
import { useUrlState } from '../lib/params';
import { DataTable, type Column } from '../ui/DataTable';

const monthName = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
const revenue = (m: ReportMonth) => m.plan_revenue_paise + m.extra_revenue_paise - m.refunds_paise;

/** How the business is doing, month by month (India time): growth, work done, money, support. */
export function Reports() {
  const [params, set] = useUrlState();
  const months = params.get('months') ?? '6';
  const { data, error, isPending } = useQuery({
    queryKey: ['bo-reports', months],
    queryFn: () => api<BackofficeReport>(`/backoffice/reports?months=${months}`),
  });

  const total = (k: keyof Omit<ReportMonth, 'month'>) =>
    data?.months.reduce((n, m) => n + m[k], 0) ?? 0;
  const best = Math.max(1, ...(data?.months.map(revenue) ?? [0]));
  const n = (k: keyof Omit<ReportMonth, 'month'>, label: string): Column<ReportMonth> => ({
    key: k,
    header: label,
    align: 'right',
    sort: (m) => m[k],
    render: (m) => m[k] || <span className="sub">0</span>,
  });

  const monthCols: Column<ReportMonth>[] = [
    { key: 'month', header: 'Month', sort: (m) => m.month, render: (m) => monthName(m.month) },
    n('new_customers', 'New customers'),
    n('properties_added', 'Properties added'),
    n('requests_created', 'Requests'),
    n('requests_completed', 'Completed'),
    n('requests_cancelled', 'Cancelled'),
    n('tickets_opened', 'Tickets'),
    n('tickets_resolved', 'Resolved'),
    {
      key: 'revenue',
      header: 'Revenue (after refunds)',
      align: 'right',
      sort: revenue,
      render: (m) => (
        <div className="bar-cell">
          <div className="bar">
            <span style={{ width: `${Math.round((Math.max(0, revenue(m)) / best) * 100)}%` }} />
          </div>
          {rupees(revenue(m))}
        </div>
      ),
      csv: (m) => revenue(m) / 100,
    },
  ];

  type Svc = BackofficeReport['services'][number];
  const svcCols: Column<Svc>[] = [
    { key: 'service', header: 'Service', sort: (s) => s.service, render: (s) => s.service },
    {
      key: 'requested',
      header: 'Requested',
      align: 'right',
      sort: (s) => s.requested,
      render: (s) => s.requested,
    },
    {
      key: 'open',
      header: 'Still open',
      align: 'right',
      sort: (s) => s.open,
      render: (s) => s.open || '—',
    },
    {
      key: 'completed',
      header: 'Completed',
      align: 'right',
      sort: (s) => s.completed,
      render: (s) => s.completed,
    },
    {
      key: 'cancelled',
      header: 'Cancelled',
      align: 'right',
      sort: (s) => s.cancelled,
      render: (s) => s.cancelled || '—',
    },
    {
      key: 'days',
      header: 'Avg. days to complete',
      align: 'right',
      sort: (s) => s.avg_days_to_complete,
      render: (s) => s.avg_days_to_complete ?? '—',
    },
    {
      key: 'revenue',
      header: 'Revenue',
      align: 'right',
      sort: (s) => s.revenue_paise,
      render: (s) => rupees(s.revenue_paise),
      csv: (s) => s.revenue_paise / 100,
    },
  ];

  type Cat = BackofficeReport['tickets_by_category'][number];
  const catLabel = (c: string) => TICKET_CATEGORY_LABELS[c as TicketCategory] ?? c;
  const catCols: Column<Cat>[] = [
    {
      key: 'category',
      header: 'Topic',
      sort: (c) => catLabel(c.category),
      render: (c) => catLabel(c.category),
    },
    {
      key: 'opened',
      header: 'Opened',
      align: 'right',
      sort: (c) => c.opened,
      render: (c) => c.opened,
    },
    {
      key: 'resolved',
      header: 'Resolved',
      align: 'right',
      sort: (c) => c.resolved,
      render: (c) => c.resolved,
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p>Month by month, India time. Every table can be sorted and exported.</p>
        </div>
        <div className="tabs" role="group" aria-label="Period">
          {['3', '6', '12'].map((m) => (
            <button key={m} aria-pressed={months === m} onClick={() => set({ months: m })}>
              Last {m} months
            </button>
          ))}
        </div>
      </div>
      {isPending ? <div className="empty">Loading…</div> : null}
      {error ? <div className="error">{errorText(error)}</div> : null}
      {data ? (
        <>
          <div className="grid">
            <div className="stat good">
              <span>Revenue after refunds</span>
              <b>
                {rupees(
                  total('plan_revenue_paise') +
                    total('extra_revenue_paise') -
                    total('refunds_paise'),
                )}
              </b>
              <span>
                Plans {rupees(total('plan_revenue_paise'))} · extras{' '}
                {rupees(total('extra_revenue_paise'))}
              </span>
            </div>
            <div className="stat">
              <span>New customers</span>
              <b>{total('new_customers')}</b>
              <span>{total('properties_added')} properties added</span>
            </div>
            <div className="stat">
              <span>Requests completed</span>
              <b>{total('requests_completed')}</b>
              <span>
                of {total('requests_created')} requested · {total('requests_cancelled')} cancelled
              </span>
            </div>
            <div className="stat">
              <span>Support tickets</span>
              <b>{total('tickets_opened')}</b>
              <span>{total('tickets_resolved')} resolved</span>
            </div>
          </div>
          <div className="section-title">By month</div>
          <DataTable
            rows={data.months}
            columns={monthCols}
            rowKey={(m) => m.month}
            defaultSort={{ key: 'month', dir: 'desc' }}
            exportName="report-by-month"
          />
          <div className="two-col">
            <div>
              <div className="section-title">By service</div>
              <DataTable
                rows={data.services}
                columns={svcCols}
                rowKey={(s) => s.service}
                defaultSort={{ key: 'requested', dir: 'desc' }}
                exportName="report-by-service"
                empty="No requests in this period."
              />
            </div>
            <div>
              <div className="section-title">Support by topic</div>
              <DataTable
                rows={data.tickets_by_category}
                columns={catCols}
                rowKey={(c) => c.category}
                defaultSort={{ key: 'opened', dir: 'desc' }}
                exportName="report-support"
                empty="No tickets in this period."
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
