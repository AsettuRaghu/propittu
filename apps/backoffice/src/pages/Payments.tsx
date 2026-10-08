import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { ORDER_DISPLAY_LABELS, formatIndianMobile, type BackofficeOrder } from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { date, dateTime, rupees } from '../lib/format';
import { useUrlState } from '../lib/params';
import { DataTable, type Column } from '../ui/DataTable';
import { ORDER_TONES } from '../ui/status';
import { Tiles } from '../ui/Tiles';
import { useEscape } from '../ui/useEscape';

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
  const method = params.get('method') ?? '';
  const selected = params.get('id');
  const [now] = useState(() => Date.now());
  const { data, error, isPending } = useQuery({
    queryKey: ['bo-payments'],
    queryFn: () => api<BackofficeOrder[]>('/backoffice/payments?status=all'),
  });

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
  const methods = [
    ...new Set(data?.flatMap((o) => (o.payment?.method ? [o.payment.method] : []))),
  ].sort();
  const rows = data
    ? inPeriod
        .filter(views[view as keyof typeof views] ?? views.all)
        .filter((o) => !method || o.payment?.method === method)
    : undefined;
  const open = data?.find((o) => o.id === selected);

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
          <h1>Payments</h1>
          <p>
            Every payment for plans and extra services (the latest 300). Plans themselves are set up
            under Plans.
          </p>
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
        selected={selected}
        onRowClick={(o) => set({ id: o.id })}
        onClose={() => set({ id: null, full: null })}
        detail={
          open ? <PaymentPanel o={open} onClose={() => set({ id: null, full: null })} /> : null
        }
        toolbar={
          <select
            value={method}
            onChange={(e) => set({ method: e.target.value || null })}
            aria-label="Method"
          >
            <option value="">Any method</option>
            {methods.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        }
        searchText={(o) =>
          `${o.reference} ${o.description} ${o.customer_phone ?? ''} ${o.payment?.provider_payment_ref ?? ''} ${o.payment?.method ?? ''} ${ORDER_DISPLAY_LABELS[o.display_status]}`
        }
        searchPlaceholder="Search anything: reference, what for, customer, payment id"
        defaultSort={{ key: 'date', dir: 'desc' }}
        exportName="payments"
        loading={isPending}
        error={error ? errorText(error) : null}
        empty="No payments in this period."
      />
    </div>
  );
}

/** One payment beside the list: every figure, the provider reference, and where it came from. */
function PaymentPanel({ o, onClose }: { o: BackofficeOrder; onClose: () => void }) {
  useEscape(onClose);
  return (
    <aside className="panel" aria-label="Payment">
      <div className="panel-head">
        <div>
          <h2>{o.description}</h2>
          <span className="mono">{o.reference}</span>
        </div>
        <div className="row">
          <span className={`badge ${ORDER_TONES[o.display_status]}`}>
            {ORDER_DISPLAY_LABELS[o.display_status]}
          </span>
        </div>
      </div>
      <div className="panel-body">
        <div className="block">
          <h3>Amount</h3>
          <dl className="kv">
            <dt>Charged</dt>
            <dd>{rupees(o.amount_paise)}</dd>
            {o.list_price_paise !== o.amount_paise ? (
              <>
                <dt>List price</dt>
                <dd>{rupees(o.list_price_paise)}</dd>
              </>
            ) : null}
            {o.credit_paise > 0 ? (
              <>
                <dt>Upgrade credit</dt>
                <dd>{rupees(o.credit_paise)}</dd>
              </>
            ) : null}
            <dt>Refunded</dt>
            <dd>{o.refunded_paise ? rupees(o.refunded_paise) : '—'}</dd>
            <dt>Kept</dt>
            <dd>{rupees(net(o))}</dd>
          </dl>
        </div>
        <div className="block">
          <h3>Payment</h3>
          <dl className="kv">
            <dt>Provider</dt>
            <dd>{o.payment?.provider ?? '—'}</dd>
            <dt>Method</dt>
            <dd>{o.payment?.method ?? '—'}</dd>
            <dt>Attempt</dt>
            <dd>{o.payment?.status ?? 'Not started'}</dd>
            <dt>Payment id</dt>
            <dd className="mono">{o.payment?.provider_payment_ref ?? '—'}</dd>
            <dt>Started</dt>
            <dd>{dateTime(o.created_at)}</dd>
            <dt>Paid</dt>
            <dd>{o.paid_at ? dateTime(o.paid_at) : '—'}</dd>
          </dl>
        </div>
        <div className="block">
          <h3>For</h3>
          <dl className="kv">
            <dt>Kind</dt>
            <dd>{o.kind === 'plan' ? 'Plan' : 'Extra service'}</dd>
            {o.period ? (
              <>
                <dt>Period</dt>
                <dd>
                  {date(o.period.starts_at)} – {date(o.period.ends_at)}
                </dd>
              </>
            ) : null}
            <dt>Customer</dt>
            <dd>
              <Link to={`/customers?id=${o.account_id}`}>
                {o.customer_phone ? formatIndianMobile(o.customer_phone) : 'Open customer'}
              </Link>
            </dd>
            {o.service_request_id ? (
              <>
                <dt>Request</dt>
                <dd>
                  <Link to={`/requests?status=all&id=${o.service_request_id}`}>
                    Open the service request
                  </Link>
                </dd>
              </>
            ) : null}
          </dl>
        </div>
      </div>
    </aside>
  );
}
