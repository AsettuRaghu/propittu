import { useQuery } from '@tanstack/react-query';
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
import { ORDER_TONES } from '../ui/status';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Not paid yet' },
] as const;

/** Every payment (newest 100), and the Plans customers can buy today. */
export function Payments() {
  const [params, set] = useUrlState();
  const status = params.get('status') ?? 'all';
  const { data, error, isPending } = useQuery({
    queryKey: ['bo-payments', status],
    queryFn: () => api<BackofficeOrder[]>(`/backoffice/payments?status=${status}`),
  });
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api<PublicPlan[]>('/plans') });
  const paid = data?.filter((o) => o.display_status === 'paid') ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Plans &amp; payments</h1>
          <p>The latest 100 payments. To give or change a customer’s plan, open the customer.</p>
        </div>
        <div className="tabs" role="group" aria-label="Status">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              aria-pressed={status === f.value}
              onClick={() => set({ status: f.value })}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {plans.data ? (
        <div className="grid">
          {plans.data.map((p) => (
            <div key={p.code} className="stat">
              <span>{p.name}</span>
              <b>{rupees(p.price_paise)}</b>
              <span>
                {p.term_days} days · version {p.version}
              </span>
            </div>
          ))}
          {data ? (
            <div className="stat good">
              <span>Paid in this list</span>
              <b>{rupees(paid.reduce((n, o) => n + o.amount_paise - o.refunded_paise, 0))}</b>
              <span>{paid.length} payments, after refunds</span>
            </div>
          ) : null}
        </div>
      ) : null}

      <section className="section">
        {isPending ? <div className="empty">Loading…</div> : null}
        {error ? <div className="empty error">{errorText(error)}</div> : null}
        {data && data.length === 0 ? <div className="empty">No payments here.</div> : null}
        {data && data.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>For</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Method</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {data.map((o) => (
                  <tr key={o.id} className="static">
                    <td>
                      {o.description}
                      <span className="sub mono">{o.reference}</span>
                    </td>
                    <td>
                      <Link to={`/customers?id=${o.account_id}`}>
                        {o.customer_phone ? formatIndianMobile(o.customer_phone) : 'Customer'}
                      </Link>
                    </td>
                    <td>
                      {rupees(o.amount_paise)}
                      {o.credit_paise > 0 ? (
                        <span className="sub">{rupees(o.credit_paise)} upgrade credit</span>
                      ) : null}
                      {o.refunded_paise > 0 ? (
                        <span className="sub">{rupees(o.refunded_paise)} refunded</span>
                      ) : null}
                    </td>
                    <td>
                      <span className={`badge ${ORDER_TONES[o.display_status]}`}>
                        {ORDER_DISPLAY_LABELS[o.display_status]}
                      </span>
                    </td>
                    <td>
                      {o.payment?.method ?? '—'}
                      {o.payment?.provider_payment_ref ? (
                        <span className="sub mono">{o.payment.provider_payment_ref}</span>
                      ) : null}
                    </td>
                    <td>
                      {o.paid_at ? dateTime(o.paid_at) : date(o.created_at)}
                      {o.period ? (
                        <span className="sub">
                          {date(o.period.starts_at)} – {date(o.period.ends_at)}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
