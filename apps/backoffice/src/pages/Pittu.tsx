import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import {
  REVIEW_REASON_LABELS,
  formatIndianMobile,
  type AiAccountSpend,
  type AiFailure,
  type AiSummary,
  type ReviewListItem,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { date, dateTime, relative } from '../lib/format';
import { useUrlState } from '../lib/params';
import { Feedback, useAction } from '../ui/action';
import { DataTable, type Column } from '../ui/DataTable';

const usd = (n: number | null) => (n === null ? '—' : `$${n.toFixed(2)}`);
const phone = (p: string | null) => (p ? formatIndianMobile(p) : 'Customer');

/** Pittu, the deed reader: this month's cost and accuracy, failed readings, and reviews. */
export function Pittu() {
  const qc = useQueryClient();
  const navigate = useNavigate();
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

  const failureCols: Column<AiFailure>[] = [
    {
      key: 'property',
      header: 'Property',
      sort: (f) => f.property_name,
      render: (f) => (
        <>
          {f.property_name}
          {f.is_draft ? <span className="sub">Still being added</span> : null}
        </>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      sort: (f) => f.customer_phone ?? '',
      render: (f) => phone(f.customer_phone),
    },
    {
      key: 'problem',
      header: 'Problem',
      sort: (f) => f.error_code ?? '',
      render: (f) => <span className="mono">{f.error_code ?? 'unknown'}</span>,
    },
    {
      key: 'tries',
      header: 'Tries',
      align: 'right',
      sort: (f) => f.attempts,
      render: (f) => f.attempts,
    },
    {
      key: 'when',
      header: 'When',
      sort: (f) => f.updated_at,
      render: (f) => relative(f.updated_at),
    },
    {
      key: 'retry',
      header: '',
      render: (f) =>
        f.can_retry ? (
          <button
            className="btn small"
            disabled={retry.isPending}
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm('Read this deed again? It may cost money.'))
                retry.mutate({
                  path: `/backoffice/ai/analyses/${f.analysis_id}/retry`,
                  ok: 'Reading started again',
                });
            }}
          >
            Try again
          </button>
        ) : null,
    },
  ];
  const spendCols: Column<AiAccountSpend>[] = [
    {
      key: 'customer',
      header: 'Customer',
      sort: (r) => r.customer_name ?? r.customer_phone ?? '',
      render: (r) => r.customer_name || phone(r.customer_phone),
    },
    {
      key: 'calls',
      header: 'Readings',
      align: 'right',
      sort: (r) => r.calls,
      render: (r) => r.calls,
    },
    {
      key: 'cost',
      header: 'Cost',
      align: 'right',
      sort: (r) => r.cost_usd,
      render: (r) => usd(r.cost_usd),
    },
  ];
  const reviewCols: Column<ReviewListItem>[] = [
    {
      key: 'property',
      header: 'Property',
      sort: (r) => r.property_name,
      render: (r) => (
        <>
          {r.property_name}
          {r.note ? <span className="sub">{r.note}</span> : null}
        </>
      ),
    },
    {
      key: 'why',
      header: 'Why',
      sort: (r) => r.reasons.length,
      render: (r) => r.reasons.map((x) => REVIEW_REASON_LABELS[x]).join(' · '),
      csv: (r) => r.reasons.map((x) => REVIEW_REASON_LABELS[x]).join(' · '),
    },
    {
      key: 'customer',
      header: 'Customer',
      sort: (r) => r.customer_phone ?? '',
      render: (r) => phone(r.customer_phone),
    },
    {
      key: 'when',
      header: reviews === 'open' ? 'Since' : 'Checked',
      sort: (r) => (reviews === 'open' ? r.created_at : r.reviewed_at),
      render: (r) => dateTime(reviews === 'open' ? r.created_at : r.reviewed_at),
    },
  ];

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
              <span>
                of {usd(s.budget_usd)} ({Math.round(used * 100)}%) · {usd(s.today_spend_usd)} today
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
            <>
              <div className="page-head">
                <div className="section-title">Readings that failed</div>
                <Feedback a={retry} />
              </div>
              <DataTable
                rows={s.failures}
                columns={failureCols}
                rowKey={(f) => f.analysis_id}
                onRowClick={(f) =>
                  void navigate(`/customers?id=${f.account_id}&property=${f.property_id}`)
                }
                defaultSort={{ key: 'when', dir: 'desc' }}
              />
            </>
          ) : null}
        </>
      ) : null}

      <div className="page-head">
        <div className="section-title">Properties to check</div>
        <div className="tabs" role="group" aria-label="Reviews">
          <button aria-pressed={reviews === 'open'} onClick={() => set({ reviews: null })}>
            To check{s ? ` (${s.review_open})` : ''}
          </button>
          <button aria-pressed={reviews === 'done'} onClick={() => set({ reviews: 'done' })}>
            Checked
          </button>
        </div>
      </div>
      <DataTable
        rows={list.data}
        columns={reviewCols}
        rowKey={(r) => r.property_id}
        onRowClick={(r) => void navigate(`/customers?id=${r.account_id}&property=${r.property_id}`)}
        searchText={(r) => `${r.property_name} ${r.customer_phone ?? ''} ${r.note ?? ''}`}
        searchPlaceholder="Search properties"
        defaultSort={{ key: 'when', dir: 'desc' }}
        exportName="pittu-reviews"
        loading={list.isPending}
        error={list.error ? errorText(list.error) : null}
        empty="Nothing here."
      />

      {s && s.by_account.length > 0 ? (
        <>
          <div className="section-title">Cost by customer this month</div>
          <DataTable
            rows={s.by_account}
            columns={spendCols}
            rowKey={(r) => r.account_id}
            onRowClick={(r) => void navigate(`/customers?id=${r.account_id}`)}
            defaultSort={{ key: 'cost', dir: 'desc' }}
            exportName="pittu-cost"
          />
        </>
      ) : null}
    </div>
  );
}
