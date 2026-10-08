import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  ORDER_DISPLAY_LABELS,
  formatIndianMobile,
  type BackofficeOrder,
  type PublicPlan,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { date, dateTime, rupees } from '../lib/format';
import { useUrlState } from '../lib/params';
import { DataTable, type Column } from '../ui/DataTable';
import { ORDER_TONES } from '../ui/status';
import { Tiles } from '../ui/Tiles';

const PERIODS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
];

const net = (o: BackofficeOrder) => o.amount_paise - o.refunded_paise;

/** Every payment (latest 300) with money tiles, period and kind filters, and the plans on sale. */
export function Payments() {
  const [params, set] = useUrlState();
  const view = params.get('view') ?? 'paid';
  const period = params.get('period') ?? '30';
  const kind = params.get('kind') ?? '';
  const [now] = useState(() => Date.now());
  const { data, error, isPending } = useQuery({
    queryKey: ['bo-payments'],
    queryFn: () => api<BackofficeOrder[]>('/backoffice/payments?status=all'),
  });
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api<PublicPlan[]>('/plans') });

  const from = (() => {
    if (period === 'all') return 0;
    if (period === 'month') {
      const d = new Date(now);
      return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    }
    return now - Number(period) * 86_400_000;
  })();
  const inPeriod =
    data?.filter(
      (o) => Date.parse(o.paid_at ?? o.created_at) >= from && (!kind || o.kind === kind),
    ) ?? [];
  const sum = (list: BackofficeOrder[], f: (o: BackofficeOrder) => number) =>
    list.reduce((n, o) => n + f(o), 0);
  const paid = inPeriod.filter(
    (o) => o.display_status === 'paid' || o.display_status === 'refunded',
  );
  const views = {
    paid: (o: BackofficeOrder) => o.display_status === 'paid' || o.display_status === 'refunded',
    plan: (o: BackofficeOrder) => o.kind === 'plan' && o.paid_at !== null,
    extra: (o: BackofficeOrder) => o.kind === 'extra_service' && o.paid_at !== null,
    refunded: (o: BackofficeOrder) => o.refunded_paise > 0,
    failed: (o: BackofficeOrder) =>
      o.display_status === 'failed' || o.display_status === 'processing',
    all: () => true,
  };
  const rows = data ? inPeriod.filter(views[view as keyof typeof views] ?? views.all) : undefined;

  const columns: Column<BackofficeOrder>[] = [
    {
      key: 'for',
      header: 'For',
      sort: (o) => o.description,
      render: (o) => (
        <>
          {o.description}
          <span className="sub mono">{o.reference}</span>
        </>
      ),
      csv: (o) => `${o.description} ${o.reference}`,
    },
    {
      key: 'kind',
      header: 'Kind',
      sort: (o) => o.kind,
      render: (o) => (o.kind === 'plan' ? 'Plan' : 'Extra service'),
    },
    {
      key: 'customer',
      header: 'Customer',
      sort: (o) => o.customer_phone ?? '',
      render: (o) => (
        <Link to={`/customers?id=${o.account_id}`} onClick={(e) => e.stopPropagation()}>
          {o.customer_phone ? formatIndianMobile(o.customer_phone) : 'Customer'}
        </Link>
      ),
      csv: (o) => o.customer_phone,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sort: (o) => o.amount_paise,
      render: (o) => (
        <>
          {rupees(o.amount_paise)}
          {o.credit_paise > 0 ? <span className="sub">{rupees(o.credit_paise)} credit</span> : null}
          {o.refunded_paise > 0 ? (
            <span className="sub">{rupees(o.refunded_paise)} refunded</span>
          ) : null}
        </>
      ),
      csv: (o) => o.amount_paise / 100,
    },
    {
      key: 'status',
      header: 'Status',
      sort: (o) => o.display_status,
      render: (o) => (
        <span className={`badge ${ORDER_TONES[o.display_status]}`}>
          {ORDER_DISPLAY_LABELS[o.display_status]}
        </span>
      ),
      csv: (o) => ORDER_DISPLAY_LABELS[o.display_status],
    },
    {
      key: 'method',
      header: 'Method',
      sort: (o) => o.payment?.method ?? '',
      render: (o) => (
        <>
          {o.payment?.method ?? '—'}
          {o.payment?.provider_payment_ref ? (
            <span className="sub mono">{o.payment.provider_payment_ref}</span>
          ) : null}
        </>
      ),
      csv: (o) => o.payment?.provider_payment_ref ?? '',
    },
    {
      key: 'date',
      header: 'Date',
      sort: (o) => o.paid_at ?? o.created_at,
      render: (o) => (
        <>
          {o.paid_at ? dateTime(o.paid_at) : date(o.created_at)}
          {o.period ? (
            <span className="sub">
              {date(o.period.starts_at)} – {date(o.period.ends_at)}
            </span>
          ) : null}
        </>
      ),
      csv: (o) => o.paid_at ?? o.created_at,
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Plans &amp; payments</h1>
          <p>The latest 300 payments. To give or change a plan, open the customer.</p>
        </div>
        <div className="row">
          <select
            value={period}
            onChange={(e) => set({ period: e.target.value })}
            aria-label="Period"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            value={kind}
            onChange={(e) => set({ kind: e.target.value || null })}
            aria-label="Kind"
          >
            <option value="">Plans and extras</option>
            <option value="plan">Plans only</option>
            <option value="extra_service">Extras only</option>
          </select>
        </div>
      </div>
      <Tiles
        value={view}
        onChange={(v) => set({ view: v })}
        tiles={[
          {
            value: 'paid',
            label: 'Collected (after refunds)',
            count: data ? rupees(sum(paid, net)) : '–',
            hint: `${paid.length} payments`,
            tone: 'good',
          },
          {
            value: 'plan',
            label: 'From plans',
            count: data ? rupees(sum(inPeriod.filter(views.plan), net)) : '–',
          },
          {
            value: 'extra',
            label: 'From extra services',
            count: data ? rupees(sum(inPeriod.filter(views.extra), net)) : '–',
          },
          {
            value: 'refunded',
            label: 'Refunded',
            count: data ? rupees(sum(inPeriod, (o) => o.refunded_paise)) : '–',
          },
          {
            value: 'failed',
            label: 'Not completed',
            count: data ? inPeriod.filter(views.failed).length : '–',
            tone: 'warn',
          },
          { value: 'all', label: 'Everything', count: data ? inPeriod.length : '–' },
        ]}
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(o) => o.id}
        searchText={(o) =>
          `${o.reference} ${o.description} ${o.customer_phone ?? ''} ${o.payment?.provider_payment_ref ?? ''}`
        }
        searchPlaceholder="Search reference, customer, payment id"
        defaultSort={{ key: 'date', dir: 'desc' }}
        exportName="payments"
        loading={isPending}
        error={error ? errorText(error) : null}
        empty="No payments in this period."
      />
      {plans.data ? (
        <section className="section">
          <div className="section-head">
            <h2>Plans on sale</h2>
            <span className="sub">Prices and terms customers see today.</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th className="num">Price</th>
                  <th className="num">Term</th>
                  <th>Version</th>
                </tr>
              </thead>
              <tbody>
                {plans.data.map((p) => (
                  <tr key={p.code}>
                    <td>
                      {p.name}
                      <span className="sub">{p.description}</span>
                    </td>
                    <td className="num">{rupees(p.price_paise)}</td>
                    <td className="num">{p.term_days} days</td>
                    <td>{p.version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
