import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  REVIEW_REASON_LABELS,
  formatIndianMobile,
  type AiSummary,
  type ReviewListItem,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { date, dateTime, relative } from '../lib/format';
import { useUrlState } from '../lib/params';
import { Feedback, useAction } from '../ui/action';

const usd = (n: number | null) => (n === null ? '—' : `$${n.toFixed(2)}`);

/** Pittu, the deed reader: this month's cost and accuracy, failed readings, and reviews. */
export function Pittu() {
  const qc = useQueryClient();
  const [params, set] = useUrlState();
  const reviews = params.get('reviews') === 'done' ? 'done' : 'open';
  const summary = useQuery({
    queryKey: ['bo-ai'],
    queryFn: () => api<AiSummary>('/backoffice/ai/summary'),
  });
  const list = useQuery({
    queryKey: ['bo-reviews', reviews],
    queryFn: () => api<ReviewListItem[]>(`/backoffice/ai/reviews?status=${reviews}`),
  });
  const retry = useAction(() => void qc.invalidateQueries({ queryKey: ['bo-ai'] }));
  const s = summary.data;
  const used = s && s.budget_usd > 0 ? Math.min(1, s.spend_usd / s.budget_usd) : 0;
  const facts = s ? s.facts.confirmed + s.facts.edited + s.facts.rejected : 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Pittu</h1>
          <p>
            {s
              ? `${s.enabled ? 'On' : 'Off'} · ${s.pilot_accounts} pilot customers · since ${date(s.month_start)}`
              : 'Deed reading this month.'}
          </p>
        </div>
      </div>
      {summary.error ? <div className="error">{errorText(summary.error)}</div> : null}

      {s ? (
        <>
          <div className="grid">
            <div className={`stat ${used > 0.8 ? 'warn' : ''}`}>
              <span>Spent this month</span>
              <b>{usd(s.spend_usd)}</b>
              <div className={`bar ${used > 0.8 ? 'warn' : ''}`}>
                <span style={{ width: `${Math.round(used * 100)}%` }} />
              </div>
              <span>
                of {usd(s.budget_usd)} · {usd(s.today_spend_usd)} today
              </span>
            </div>
            <div className={`stat ${s.calls.failed > 0 ? 'bad' : ''}`}>
              <span>Readings</span>
              <b>{s.calls.ok}</b>
              <span>{s.calls.failed} failed</span>
            </div>
            <div className="stat">
              <span>Per reading</span>
              <b>{usd(s.avg_cost_usd)}</b>
              <span>{s.avg_seconds === null ? '—' : `${Math.round(s.avg_seconds)} seconds`}</span>
            </div>
            <div className="stat good">
              <span>Values kept as read</span>
              <b>{facts ? `${Math.round((s.facts.confirmed / facts) * 100)}%` : '—'}</b>
              <span>
                {s.facts.edited} edited · {s.facts.rejected} rejected
              </span>
            </div>
          </div>

          {s.failures.length > 0 ? (
            <section className="section">
              <div className="section-head">
                <h2>Readings that failed</h2>
                <Feedback a={retry} />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>Customer</th>
                      <th>Problem</th>
                      <th>Tries</th>
                      <th>When</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {s.failures.map((f) => (
                      <tr key={f.analysis_id} className="static">
                        <td>
                          {f.property_name}
                          {f.is_draft ? <span className="sub">Still being added</span> : null}
                        </td>
                        <td>
                          <Link to={`/customers?id=${f.account_id}`}>
                            {f.customer_phone ? formatIndianMobile(f.customer_phone) : 'Customer'}
                          </Link>
                        </td>
                        <td className="mono">{f.error_code ?? 'unknown'}</td>
                        <td>{f.attempts}</td>
                        <td>{relative(f.updated_at)}</td>
                        <td>
                          {f.can_retry ? (
                            <button
                              className="btn"
                              disabled={retry.isPending}
                              onClick={() => {
                                if (window.confirm('Read this deed again? It may cost money.'))
                                  retry.mutate({
                                    path: `/backoffice/ai/analyses/${f.analysis_id}/retry`,
                                    ok: 'Reading started again',
                                  });
                              }}
                            >
                              Try again
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {s.by_account.length > 0 ? (
            <section className="section">
              <div className="section-head">
                <h2>Cost by customer</h2>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Readings</th>
                      <th>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.by_account.map((r) => (
                      <tr key={r.account_id} className="static">
                        <td>
                          <Link to={`/customers?id=${r.account_id}`}>
                            {r.customer_name ||
                              (r.customer_phone
                                ? formatIndianMobile(r.customer_phone)
                                : 'Customer')}
                          </Link>
                        </td>
                        <td>{r.calls}</td>
                        <td>{usd(r.cost_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      <section className="section">
        <div className="section-head">
          <h2>Properties to check</h2>
          <div className="tabs" role="group" aria-label="Reviews">
            <button aria-pressed={reviews === 'open'} onClick={() => set({ reviews: null })}>
              To check{s ? ` (${s.review_open})` : ''}
            </button>
            <button aria-pressed={reviews === 'done'} onClick={() => set({ reviews: 'done' })}>
              Checked
            </button>
          </div>
        </div>
        {list.isPending ? <div className="empty">Loading…</div> : null}
        {list.error ? <div className="empty error">{errorText(list.error)}</div> : null}
        {list.data && list.data.length === 0 ? <div className="empty">Nothing here.</div> : null}
        {list.data && list.data.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Why</th>
                  <th>Customer</th>
                  <th>{reviews === 'open' ? 'Since' : 'Checked'}</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((r) => (
                  <tr key={r.property_id} className="static">
                    <td>
                      <Link to={`/customers?id=${r.account_id}&property=${r.property_id}`}>
                        {r.property_name}
                      </Link>
                      {r.note ? <span className="sub">{r.note}</span> : null}
                    </td>
                    <td>{r.reasons.map((x) => REVIEW_REASON_LABELS[x]).join(' · ')}</td>
                    <td>{r.customer_phone ? formatIndianMobile(r.customer_phone) : '—'}</td>
                    <td>{dateTime(reviews === 'open' ? r.created_at : r.reviewed_at)}</td>
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
