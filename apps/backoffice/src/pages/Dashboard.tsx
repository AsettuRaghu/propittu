import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  formatIndianMobile,
  requestExpectedBy,
  type AiSummary,
  type BackofficeAccount,
  type BackofficeDashboard,
  type BackofficeReport,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { dateTime, rupees } from '../lib/format';
import { useRequestList, useTicketList } from '../lib/lists';
import { useUrlState } from '../lib/params';
import { Age, type Level } from '../ui/Age';
import { BarChart } from '../ui/BarChart';
import { DataTable, type Column } from '../ui/DataTable';
import { RangeTabs, asRange } from '../ui/RangeTabs';

const HOUR = 3_600_000;

type Check = { level: Level; title: string; detail: string; to?: string };

type Waiting = {
  id: string;
  kind: 'Service request' | 'Support';
  title: string;
  customer: string;
  about: string;
  since: string;
  to: string;
};

/** The state of affairs: what is going wrong and what needs us, then how the period went. */
export function Dashboard() {
  const navigate = useNavigate();
  const [params, set] = useUrlState();
  const range = asRange(params.get('range'), 'month');
  const [now] = useState(() => Date.now());

  const dash = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<BackofficeDashboard>('/backoffice/dashboard'),
    refetchInterval: 60_000,
  });
  const requests = useRequestList();
  const tickets = useTicketList();
  const accounts = useQuery({
    queryKey: ['bo-accounts'],
    queryFn: () => api<BackofficeAccount[]>('/backoffice/accounts'),
  });
  const ai = useQuery({
    queryKey: ['bo-ai'],
    queryFn: () => api<AiSummary>('/backoffice/ai/summary'),
  });
  const report = useQuery({
    queryKey: ['bo-reports', range],
    queryFn: () => api<BackofficeReport>(`/backoffice/reports?range=${range}`),
  });

  const reqs = requests.data ?? [];
  const age = (iso: string) => (now - Date.parse(iso)) / HOUR;
  const unanswered = reqs.filter((r) => r.status === 'requested');
  const oldestUnanswered = Math.max(0, ...unanswered.map((r) => age(r.created_at)));
  const overdue = reqs.filter((r) => {
    const d = requestExpectedBy(r);
    return d && !['completed', 'cancelled'].includes(r.status) && Date.parse(d) < now;
  });
  const needInfo = reqs.filter((r) => r.status === 'awaiting_customer' && age(r.updated_at) > 72);
  const notScheduled = reqs.filter(
    (r) =>
      r.status === 'confirmed' &&
      r.fulfilment === 'visit' &&
      age(r.confirmed_at ?? r.updated_at) > 48,
  );
  const onUs = (tickets.data ?? []).filter((t) => t.awaiting_staff);
  const oldestTicket = Math.max(0, ...onUs.map((t) => age(t.last_message_at)));
  const ending = (accounts.data ?? []).filter(
    (a) =>
      a.plan_ends_at &&
      Date.parse(a.plan_ends_at) > now &&
      Date.parse(a.plan_ends_at) - now < 7 * 24 * HOUR,
  );
  const retryable = ai.data?.failures.filter((f) => f.can_retry) ?? [];
  const budgetUsed = ai.data && ai.data.budget_usd > 0 ? ai.data.spend_usd / ai.data.budget_usd : 0;
  const refunds = dash.data?.refunds_needed ?? [];
  const days = (h: number) => (h < 48 ? `${Math.round(h)} hours` : `${Math.round(h / 24)} days`);

  const checks: Check[] = [
    unanswered.length === 0
      ? {
          level: 'good',
          title: 'Every service request has been answered',
          detail: 'Nothing waiting to be accepted.',
        }
      : {
          level: oldestUnanswered > 72 ? 'bad' : oldestUnanswered > 24 ? 'warn' : 'good',
          title: `${unanswered.length} service request${unanswered.length > 1 ? 's' : ''} not yet accepted`,
          detail: `The oldest has waited ${days(oldestUnanswered)}.`,
          to: '/requests?status=requested',
        },
    overdue.length === 0
      ? {
          level: 'good',
          title: 'Nothing is overdue',
          detail: 'All open requests are within their expected time.',
        }
      : {
          level: 'bad',
          title: `${overdue.length} request${overdue.length > 1 ? 's are' : ' is'} past the expected date`,
          detail: 'The customer was told it would be done by now.',
          to: '/requests?status=overdue',
        },
    onUs.length === 0
      ? { level: 'good', title: 'Support inbox is clear', detail: 'No ticket is waiting on us.' }
      : {
          level: oldestTicket > 24 ? 'bad' : oldestTicket > 4 ? 'warn' : 'good',
          title: `${onUs.length} support ticket${onUs.length > 1 ? 's need' : ' needs'} a reply`,
          detail: `The oldest has waited ${days(oldestTicket)} for a reply.`,
          to: '/support',
        },
    ...(refunds.length
      ? [
          {
            level: 'bad' as const,
            title: `${refunds.length} payment${refunds.length > 1 ? 's' : ''} to refund`,
            detail: 'Money arrived for something already paid or no longer valid.',
            to: '#refunds',
          },
        ]
      : []),
    ...(notScheduled.length
      ? [
          {
            level: 'warn' as const,
            title: `${notScheduled.length} accepted visit${notScheduled.length > 1 ? 's' : ''} not scheduled`,
            detail: 'Accepted more than 2 days ago and still no visit date.',
            to: '/requests?status=confirmed',
          },
        ]
      : []),
    ...(needInfo.length
      ? [
          {
            level: 'warn' as const,
            title: `${needInfo.length} request${needInfo.length > 1 ? 's' : ''} stuck waiting on the customer`,
            detail: 'We asked for information more than 3 days ago. A nudge may help.',
            to: '/requests?status=awaiting_customer',
          },
        ]
      : []),
    ...(retryable.length
      ? [
          {
            level: 'warn' as const,
            title: `${retryable.length} Pittu reading${retryable.length > 1 ? 's' : ''} failed`,
            detail: 'A deed could not be read; it can be tried again.',
            to: '/pittu',
          },
        ]
      : []),
    ...(budgetUsed > 0.8
      ? [
          {
            level: budgetUsed > 0.95 ? ('bad' as const) : ('warn' as const),
            title: `Pittu has used ${Math.round(budgetUsed * 100)}% of this month's AI budget`,
            detail: 'Readings stop when the budget is reached.',
            to: '/pittu',
          },
        ]
      : []),
    ...(dash.data?.pittu?.legal_open_findings
      ? [
          {
            level: 'warn' as const,
            title: `${dash.data.pittu.legal_open_findings} Pittu Legal finding${dash.data.pittu.legal_open_findings > 1 ? 's' : ''} to review`,
            detail: `In ${dash.data.pittu.legal_in_review} legal check${dash.data.pittu.legal_in_review > 1 ? 's' : ''}; the customer is waiting for the report.`,
            to: '/legal',
          },
        ]
      : []),
    ...(dash.data?.pittu?.watch_to_review
      ? [
          {
            level: 'warn' as const,
            title: `${dash.data.pittu.watch_to_review} Pittu Watch news to review`,
            detail: 'Approve or reject so owners see what matters near their property.',
            to: '/watch',
          },
        ]
      : []),
    ...(dash.data?.pittu?.value_rows_to_check
      ? [
          {
            level: 'warn' as const,
            title: `${dash.data.pittu.value_rows_to_check} Pittu Value rate rows to check`,
            detail: 'Read from a rate document; publish them to value properties.',
            to: '/value?tab=rates&status=draft',
          },
        ]
      : []),
    ...(ending.length
      ? [
          {
            level: 'warn' as const,
            title: `${ending.length} customer plan${ending.length > 1 ? 's end' : ' ends'} in the next 7 days`,
            detail: 'A good moment to remind them to renew.',
            to: '/customers?view=ending',
          },
        ]
      : []),
  ];
  const problems = checks.filter((c) => c.level !== 'good');
  const worst: Level = problems.some((c) => c.level === 'bad')
    ? 'bad'
    : problems.length
      ? 'warn'
      : 'good';

  const waiting: Waiting[] = [
    ...unanswered.map((r) => ({
      id: r.id,
      kind: 'Service request' as const,
      title: r.service.name,
      customer:
        r.customer_name || (r.customer_phone ? formatIndianMobile(r.customer_phone) : 'Customer'),
      about: r.property?.name ?? 'Property deleted',
      since: r.created_at,
      to: `/requests?status=requested&id=${r.id}`,
    })),
    ...onUs.map((t) => ({
      id: t.id,
      kind: 'Support' as const,
      title: t.subject,
      customer:
        t.customer_name || (t.customer_phone ? formatIndianMobile(t.customer_phone) : 'Customer'),
      about: t.service_request?.service?.name ?? t.property?.name ?? '—',
      since: t.last_message_at,
      to: `/support?id=${t.id}`,
    })),
  ];
  const waitingCols: Column<Waiting>[] = [
    {
      key: 'kind',
      header: 'What',
      sort: (w) => w.kind,
      render: (w) => (
        <span className={`badge ${w.kind === 'Support' ? 'info' : 'warn'}`}>{w.kind}</span>
      ),
    },
    { key: 'title', header: 'Item', sort: (w) => w.title, render: (w) => w.title },
    { key: 'customer', header: 'Customer', sort: (w) => w.customer, render: (w) => w.customer },
    { key: 'about', header: 'About', sort: (w) => w.about, render: (w) => w.about },
    {
      key: 'waiting',
      header: 'Waiting',
      align: 'right',
      sort: (w) => w.since,
      render: (w) => <Age since={w.since} now={now} />,
      csv: (w) => w.since,
    },
  ];

  const r = report.data;
  const sum = (k: keyof NonNullable<typeof r>['series'][number]) =>
    r?.series.reduce((n, b) => n + Number(b[k]), 0) ?? 0;
  const revenue = sum('plan_revenue_paise') + sum('extra_revenue_paise') - sum('refunds_paise');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>What needs us right now, then how the business is doing.</p>
        </div>
      </div>
      {dash.error ? <div className="error">{errorText(dash.error)}</div> : null}

      <section className={`health ${worst}`}>
        <div className="health-head">
          <b>
            {worst === 'good'
              ? 'All clear — nothing needs your attention'
              : `${problems.length} thing${problems.length > 1 ? 's need' : ' needs'} your attention`}
          </b>
          <span className="sub">Checked {dateTime(new Date(now).toISOString())}</span>
        </div>
        <ul className="checks">
          {[...checks]
            .sort((a, b) => rank(b.level) - rank(a.level))
            .map((c) => (
              <li key={c.title} className={c.level}>
                <i className={`dot ${c.level}`} />
                <div>
                  {c.to ? (
                    c.to.startsWith('#') ? (
                      <a href={c.to}>{c.title}</a>
                    ) : (
                      <Link to={c.to}>{c.title}</Link>
                    )
                  ) : (
                    <b>{c.title}</b>
                  )}
                  <span className="sub">{c.detail}</span>
                </div>
              </li>
            ))}
        </ul>
      </section>

      <div className="section-title">Waiting on us · oldest first</div>
      <DataTable
        rows={waiting}
        columns={waitingCols}
        rowKey={(w) => w.id}
        onRowClick={(w) => void navigate(w.to)}
        searchText={(w) => `${w.title} ${w.customer} ${w.about}`}
        searchPlaceholder="Search what is waiting"
        defaultSort={{ key: 'waiting', dir: 'asc' }}
        loading={requests.isPending || tickets.isPending}
        empty="Nothing is waiting on us."
        pageSize={10}
        toolbar={
          <span className="legend">
            <span className="age good">under 1 day</span>
            <span className="age warn">1–3 days</span>
            <span className="age bad">over 3 days</span>
          </span>
        }
      />

      <div className="page-head">
        <div className="section-title">How we are doing</div>
        <RangeTabs value={range} onChange={(v) => set({ range: v })} />
      </div>
      {report.error ? <div className="error">{errorText(report.error)}</div> : null}
      {r ? (
        <>
          <div className="grid">
            <Kpi
              label="Revenue after refunds"
              value={rupees(revenue)}
              tone="good"
              sub={`Plans ${rupees(sum('plan_revenue_paise'))} · extras ${rupees(sum('extra_revenue_paise'))}`}
            />
            <Kpi
              label="New customers"
              value={sum('new_customers')}
              sub={`${sum('properties_added')} properties added`}
            />
            <Kpi
              label="Service requests"
              value={sum('requests_created')}
              sub={`${sum('requests_completed')} completed · ${sum('requests_cancelled')} cancelled`}
            />
            <Kpi
              label="Time to accept a request"
              value={
                r.avg_hours_to_accept === null
                  ? '—'
                  : r.avg_hours_to_accept < 48
                    ? `${r.avg_hours_to_accept} h`
                    : `${Math.round(r.avg_hours_to_accept / 24)} days`
              }
              tone={r.avg_hours_to_accept !== null && r.avg_hours_to_accept > 24 ? 'warn' : ''}
              sub="Average, requests made in this period"
            />
            <Kpi
              label="Support tickets"
              value={sum('tickets_opened')}
              sub={`${sum('tickets_resolved')} resolved`}
            />
            <Kpi
              label="Pittu AI cost"
              value={`$${sum('ai_cost_usd').toFixed(2)}`}
              sub="Deed readings"
            />
          </div>
          <div className="charts">
            <ChartCard title="Money in">
              <BarChart
                rows={r.series}
                label={(b) => b.label}
                format={(n) => rupees(n)}
                series={[
                  { label: 'Plans', value: (b) => b.plan_revenue_paise, tone: 'brand' },
                  { label: 'Extras', value: (b) => b.extra_revenue_paise, tone: 'good' },
                ]}
              />
            </ChartCard>
            <ChartCard title="Service requests">
              <BarChart
                grouped
                rows={r.series}
                label={(b) => b.label}
                series={[
                  { label: 'Made', value: (b) => b.requests_created, tone: 'warn' },
                  { label: 'Completed', value: (b) => b.requests_completed, tone: 'good' },
                ]}
              />
            </ChartCard>
            <ChartCard title="Growth">
              <BarChart
                grouped
                rows={r.series}
                label={(b) => b.label}
                series={[
                  { label: 'New customers', value: (b) => b.new_customers, tone: 'brand' },
                  { label: 'Properties added', value: (b) => b.properties_added, tone: 'muted' },
                ]}
              />
            </ChartCard>
            <ChartCard title="Support">
              <BarChart
                grouped
                rows={r.series}
                label={(b) => b.label}
                series={[
                  { label: 'Opened', value: (b) => b.tickets_opened, tone: 'warn' },
                  { label: 'Resolved', value: (b) => b.tickets_resolved, tone: 'good' },
                ]}
              />
            </ChartCard>
          </div>
        </>
      ) : report.isPending ? (
        <div className="empty">Loading…</div>
      ) : null}

      {refunds.length ? (
        <div id="refunds" className="stack">
          <div className="section-title">
            Refunds needed · refund it in Razorpay, then tell the customer
          </div>
          <DataTable
            rows={refunds}
            columns={REFUND_COLUMNS}
            rowKey={(x) => x.event_id}
            defaultSort={{ key: 'received', dir: 'desc' }}
            exportName="refunds-needed"
          />
        </div>
      ) : null}
    </div>
  );
}

type Refund = BackofficeDashboard['refunds_needed'][number];
const REFUND_COLUMNS: Column<Refund>[] = [
  {
    key: 'received',
    header: 'Received',
    sort: (x) => x.received_at,
    render: (x) => dateTime(x.received_at),
  },
  {
    key: 'order',
    header: 'Order',
    sort: (x) => x.order_reference,
    render: (x) => <span className="mono">{x.order_reference ?? '—'}</span>,
  },
  {
    key: 'customer',
    header: 'Customer',
    sort: (x) => x.customer_name,
    render: (x) => x.customer_name || '—',
  },
  { key: 'what', header: 'What', sort: (x) => x.description, render: (x) => x.description ?? '—' },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    sort: (x) => x.amount_paise,
    render: (x) => rupees(x.amount_paise),
  },
];

const rank = (l: Level) => (l === 'bad' ? 2 : l === 'warn' ? 1 : 0);

function Kpi({
  label,
  value,
  sub,
  tone = '',
}: {
  label: string;
  value: string | number;
  sub: string;
  tone?: string;
}) {
  return (
    <div className={`stat ${tone}`}>
      <span>{label}</span>
      <b>{value}</b>
      <span>{sub}</span>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
      </div>
      <div className="section-body">{children}</div>
    </section>
  );
}
