import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  requestStatusLabel,
  type BackofficeDashboard,
  type ServiceRequestStatus,
} from '@propittu/shared';
import { useState } from 'react';
import { api, errorText } from '../lib/api';
import { dateTime, relative, rupees } from '../lib/format';
import { useRequestList, useTicketList } from '../lib/lists';
import { REQUEST_TONES } from '../ui/status';

/** Today at a glance — every number opens the matching list. */
export function Dashboard() {
  const { data, error, isPending } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<BackofficeDashboard>('/backoffice/dashboard'),
    refetchInterval: 60_000,
  });
  const requests = useRequestList();
  const tickets = useTicketList();
  const [now] = useState(() => Date.now());
  const toConfirm = (requests.data ?? [])
    .filter((r) => r.status === 'requested')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, 8);
  const comingUp = (requests.data ?? [])
    .filter(
      (r) =>
        r.status === 'scheduled' &&
        r.scheduled_for &&
        Date.parse(r.scheduled_for) >= now - 86_400_000,
    )
    .sort((a, b) => (a.scheduled_for ?? '').localeCompare(b.scheduled_for ?? ''))
    .slice(0, 8);
  const waiting = (tickets.data ?? [])
    .filter((t) => t.status === 'open' || t.status === 'in_progress')
    .sort((a, b) => a.last_message_at.localeCompare(b.last_message_at))
    .slice(0, 8);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Today at a glance. Refreshes every minute.</p>
        </div>
      </div>
      {isPending ? <div className="empty">Loading…</div> : null}
      {error ? <div className="error">{errorText(error)}</div> : null}
      {data ? (
        <>
          <div className="grid">
            <Stat
              to="/requests?status=requested"
              tone="warn"
              value={data.requests.requested ?? 0}
              label="New requests to confirm"
            />
            <Stat
              to="/requests"
              tone={data.overdue ? 'bad' : ''}
              value={data.overdue}
              label="Overdue requests"
            />
            <Stat
              to="/requests?status=scheduled"
              value={data.visits_this_week}
              label="Visits in the next 7 days"
            />
            <Stat
              to="/support"
              tone={data.tickets_waiting ? 'warn' : ''}
              value={data.tickets_waiting}
              label="Tickets waiting on us"
            />
            <Stat
              tone="good"
              value={rupees(data.payments_today.amount_paise)}
              label={`Payments today · ${data.payments_today.count}`}
            />
            <Stat
              tone={data.refunds_needed.length ? 'bad' : ''}
              value={data.refunds_needed.length}
              label="Refunds needed"
            />
            <Stat value={data.new_customers_7d} label="New customers this week" />
            <Stat
              value={`$${data.ai_spend_month_usd.toFixed(2)}`}
              label="Pittu AI cost this month"
            />
          </div>

          <div className="three-col">
            <Queue
              title="To confirm (oldest first)"
              more="/requests?status=requested"
              empty="Nothing waiting."
              rows={toConfirm.map((r) => ({
                key: r.id,
                to: `/requests?status=requested&id=${r.id}`,
                main: r.service.name,
                sub: `${r.customer_name || r.customer_phone || 'Customer'} · ${r.property?.name ?? 'Property deleted'}`,
                side: relative(r.created_at),
              }))}
            />
            <Queue
              title="Visits coming up"
              more="/requests?status=scheduled"
              empty="No visits scheduled."
              rows={comingUp.map((r) => ({
                key: r.id,
                to: `/requests?status=scheduled&id=${r.id}`,
                main: r.property?.name ?? r.service.name,
                sub: `${r.service.name} · ${r.customer_name || r.customer_phone || 'Customer'}`,
                side: dateTime(r.scheduled_for),
              }))}
            />
            <Queue
              title="Tickets waiting on us"
              more="/support"
              empty="Inbox clear."
              rows={waiting.map((t) => ({
                key: t.id,
                to: `/support?id=${t.id}`,
                main: t.subject,
                sub: t.customer_name || t.customer_phone || 'Customer',
                side: relative(t.last_message_at),
              }))}
            />
          </div>

          <section className="section">
            <div className="section-head">
              <h2>Open requests by status</h2>
              <Link to="/requests">All requests</Link>
            </div>
            <div className="section-body chips">
              {Object.keys(data.requests).length === 0 ? (
                <span className="sub">Nothing open.</span>
              ) : (
                (Object.entries(data.requests) as [ServiceRequestStatus, number][]).map(
                  ([s, n]) => (
                    <Link
                      key={s}
                      to={`/requests?status=${s}`}
                      className={`badge ${REQUEST_TONES[s]}`}
                    >
                      {requestStatusLabel(s, 'visit')} · {n}
                    </Link>
                  ),
                )
              )}
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2>Refunds needed</h2>
              <span className="sub">
                Money that arrived for something already paid or no longer valid. Refund it in
                Razorpay, then tell the customer.
              </span>
            </div>
            {data.refunds_needed.length === 0 ? (
              <div className="empty">None — nothing was paid twice.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Received</th>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>What</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.refunds_needed.map((r) => (
                      <tr key={r.event_id}>
                        <td>{dateTime(r.received_at)}</td>
                        <td className="mono">{r.order_reference ?? '—'}</td>
                        <td>{r.customer_name || '—'}</td>
                        <td>{r.description ?? '—'}</td>
                        <td>{rupees(r.amount_paise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function Stat({
  to,
  tone = '',
  value,
  label,
}: {
  to?: string;
  tone?: string;
  value: number | string;
  label: string;
}) {
  const body = (
    <>
      <b>{value}</b>
      <span>{label}</span>
    </>
  );
  return to ? (
    <Link to={to} className={`stat ${tone}`}>
      {body}
    </Link>
  ) : (
    <div className={`stat ${tone}`}>{body}</div>
  );
}

function Queue({
  title,
  more,
  empty,
  rows,
}: {
  title: string;
  more: string;
  empty: string;
  rows: { key: string; to: string; main: string; sub: string; side: string }[];
}) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        <Link to={more}>See all</Link>
      </div>
      {rows.length === 0 ? <div className="empty">{empty}</div> : null}
      <ul className="queue">
        {rows.map((r) => (
          <li key={r.key}>
            <Link to={r.to}>
              <span>
                {r.main}
                <small>{r.sub}</small>
              </span>
              <em>{r.side}</em>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
