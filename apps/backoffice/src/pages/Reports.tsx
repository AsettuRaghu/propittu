import { useQuery } from '@tanstack/react-query';
import {
  TICKET_CATEGORY_LABELS,
  type BackofficeReport,
  type ReportBucket,
  type TicketCategory,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { rupees } from '../lib/format';
import { useUrlState } from '../lib/params';
import { DataTable, type Column } from '../ui/DataTable';
import { RangeTabs, asRange } from '../ui/RangeTabs';

const revenue = (b: ReportBucket) => b.plan_revenue_paise + b.extra_revenue_paise - b.refunds_paise;
type Num = Exclude<keyof ReportBucket, 'key' | 'label'>;

const CAPABILITY_NAMES: Record<string, string> = {
  read: 'Pittu Read (documents)',
  ask: 'Pittu Ask',
  watch: 'Pittu Watch (news)',
  value: 'Pittu Value (rates)',
  legal: 'Pittu Legal',
};
type AiRow = BackofficeReport['ai_by_capability'][number];
const AI_COLUMNS: Column<AiRow>[] = [
  {
    key: 'capability',
    header: 'Capability',
    sort: (c) => c.capability,
    render: (c) => CAPABILITY_NAMES[c.capability] ?? c.capability,
  },
  {
    key: 'calls',
    header: 'AI calls',
    align: 'right',
    sort: (c) => c.calls,
    render: (c) => c.calls,
  },
  {
    key: 'cost',
    header: 'Cost',
    align: 'right',
    sort: (c) => c.cost_usd,
    render: (c) => `$${c.cost_usd.toFixed(2)}`,
  },
];

/** The numbers behind the Dashboard charts, as tables to sort and export (India time). */
export function Reports() {
  const [params, set] = useUrlState();
  const range = asRange(params.get('range'), '6m');
  const { data, error, isPending } = useQuery({
    queryKey: ['bo-reports', range],
    queryFn: () => api<BackofficeReport>(`/backoffice/reports?range=${range}`),
  });

  const total = (k: Num) => data?.series.reduce((n, b) => n + b[k], 0) ?? 0;
  const best = Math.max(1, ...(data?.series.map(revenue) ?? [0]));
  const n = (k: Num, label: string): Column<ReportBucket> => ({
    key: k,
    header: label,
    align: 'right',
    sort: (b) => b[k],
    render: (b) => b[k] || <span className="sub">0</span>,
  });

  const stepName = { hour: 'Hour', day: 'Day', week: 'Week', month: 'Month' }[
    data?.step ?? 'month'
  ];
  const cols: Column<ReportBucket>[] = [
    {
      key: 'key',
      header: stepName,
      sort: (b) => b.key,
      render: (b) => b.label,
      csv: (b) => b.label,
    },
    n('new_customers', 'New customers'),
    n('properties_added', 'Properties'),
    n('requests_created', 'Requests'),
    n('requests_completed', 'Completed'),
    n('requests_cancelled', 'Cancelled'),
    n('tickets_opened', 'Tickets'),
    n('tickets_resolved', 'Resolved'),
    {
      key: 'ai',
      header: 'AI cost',
      align: 'right',
      sort: (b) => b.ai_cost_usd,
      render: (b) =>
        b.ai_cost_usd ? `$${b.ai_cost_usd.toFixed(2)}` : <span className="sub">0</span>,
      csv: (b) => b.ai_cost_usd,
    },
    {
      key: 'revenue',
      header: 'Revenue (after refunds)',
      align: 'right',
      sort: revenue,
      render: (b) => (
        <div className="bar-cell">
          <div className="bar">
            <span style={{ width: `${Math.round((Math.max(0, revenue(b)) / best) * 100)}%` }} />
          </div>
          {rupees(revenue(b))}
        </div>
      ),
      csv: (b) => revenue(b) / 100,
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
          <p>India time. Every table can be sorted and exported.</p>
        </div>
        <RangeTabs value={range} onChange={(v) => set({ range: v })} />
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
                of {total('requests_created')} made · {total('requests_cancelled')} cancelled
              </span>
            </div>
            <div className="stat">
              <span>Support tickets</span>
              <b>{total('tickets_opened')}</b>
              <span>{total('tickets_resolved')} resolved</span>
            </div>
          </div>
          <div className="section-title">Timeline</div>
          <DataTable
            rows={data.series}
            columns={cols}
            rowKey={(b) => b.key}
            defaultSort={{ key: 'key', dir: 'desc' }}
            exportName={`report-${range}`}
          />
          {data.ai_by_capability.length ? (
            <>
              <div className="section-title">Pittu AI cost by capability</div>
              <DataTable
                rows={data.ai_by_capability}
                columns={AI_COLUMNS}
                rowKey={(c) => c.capability}
                defaultSort={{ key: 'cost', dir: 'desc' }}
                exportName={`report-ai-${range}`}
              />
            </>
          ) : null}
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
