import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  LEGAL_CHECK_STATUS_LABELS,
  LEGAL_LEVEL_LABELS,
  formatIndianMobile,
  type LegalCheck,
  type LegalFinding,
  type LegalLevel,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { date, dateTime } from '../lib/format';
import { useUrlState } from '../lib/params';
import { DataTable, type Column } from '../ui/DataTable';
import { Tiles } from '../ui/Tiles';
import { useEscape } from '../ui/useEscape';

const LEVEL_TONES: Record<LegalLevel, string> = { green: 'good', amber: 'warn', red: 'bad' };

export function LevelBadge({ level }: { level: LegalLevel | null }) {
  if (!level) return <span className="badge">No findings</span>;
  return <span className={`badge ${LEVEL_TONES[level]}`}>{LEGAL_LEVEL_LABELS[level]}</span>;
}

export const useLegalChecks = (propertyId?: string) =>
  useQuery({
    queryKey: ['bo-legal', propertyId ?? 'all'],
    queryFn: () =>
      api<LegalCheck[]>(`/backoffice/legal-checks${propertyId ? `?property=${propertyId}` : ''}`),
  });

/** Pittu Legal: EC checks waiting for review, ready to share, and shared. */
export function Legal() {
  const [params, set] = useUrlState();
  const view = params.get('status') ?? 'in_review';
  const selected = params.get('id');
  const { data, error, isPending } = useLegalChecks();
  const close = () => set({ id: null, full: null });
  const count = (s: string) => data?.filter((c) => s === 'all' || c.status === s).length ?? '–';
  const rows = data?.filter((c) => view === 'all' || c.status === view);
  const columns: Column<LegalCheck>[] = [
    {
      key: 'property',
      header: 'Property',
      sort: (c) => c.property_name ?? '',
      render: (c) => (
        <>
          {c.property_name ?? 'Property'}
          <span className="sub">
            {c.customer_name || (c.customer_phone ? formatIndianMobile(c.customer_phone) : '')}
          </span>
        </>
      ),
    },
    {
      key: 'overall',
      header: 'Result',
      sort: (c) => ({ red: 0, amber: 1, green: 2 })[c.overall ?? 'green'] ?? 3,
      render: (c) => <LevelBadge level={c.overall} />,
      csv: (c) => c.overall ?? '',
    },
    {
      key: 'open',
      header: 'To review',
      align: 'right',
      sort: (c) => c.findings.filter((f) => f.level !== 'green' && f.review === 'open').length,
      render: (c) =>
        c.findings.filter((f) => f.level !== 'green' && f.review === 'open').length || '—',
    },
    {
      key: 'period',
      header: 'EC period',
      sort: (c) => c.ec_period_from,
      render: (c) => `${date(c.ec_period_from)} – ${date(c.ec_period_to)}`,
    },
    {
      key: 'status',
      header: 'Status',
      sort: (c) => c.status,
      render: (c) => <span className="badge">{LEGAL_CHECK_STATUS_LABELS[c.status]}</span>,
    },
    {
      key: 'updated',
      header: 'Updated',
      sort: (c) => c.updated_at,
      render: (c) => dateTime(c.updated_at),
    },
  ];
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Pittu Legal</h1>
          <p>
            EC checks: Pittu reads the EC, our rules compare it with the sale deed, and the team
            reviews every amber or red finding before the customer sees anything. Start a check from
            a property's EC.
          </p>
        </div>
      </div>
      <Tiles
        value={view}
        onChange={(v) => set({ status: v, id: null })}
        tiles={[
          { value: 'in_review', label: 'In review', count: count('in_review'), tone: 'warn' },
          { value: 'ready', label: 'Ready to share', count: count('ready'), tone: 'good' },
          { value: 'shared', label: 'Shared', count: count('shared') },
          { value: 'all', label: 'Everything', count: count('all') },
        ]}
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(c) => c.id}
        selected={selected}
        onRowClick={(c) => set({ id: c.id })}
        onClose={close}
        detail={selected ? <CheckPane id={selected} onClose={close} /> : null}
        searchText={(c) =>
          `${c.property_name ?? ''} ${c.customer_name ?? ''} ${c.customer_phone ?? ''}`
        }
        searchPlaceholder="Search property or customer"
        defaultSort={{ key: 'updated', dir: 'desc' }}
        exportName="legal-checks"
        loading={isPending}
        error={error ? errorText(error) : null}
        empty="No checks here."
      />
    </div>
  );
}

/** One check: findings to confirm or dismiss, a summary, then ready / share, and the report. */
function CheckPane({ id, onClose }: { id: string; onClose: () => void }) {
  useEscape(onClose);
  const qc = useQueryClient();
  const {
    data: c,
    error,
    isPending,
  } = useQuery({
    queryKey: ['bo-legal-check', id],
    queryFn: () => api<LegalCheck>(`/backoffice/legal-checks/${id}`),
  });
  const [err, setErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const refresh = (next: LegalCheck) => {
    qc.setQueryData(['bo-legal-check', id], next);
    void qc.invalidateQueries({ queryKey: ['bo-legal'] });
  };
  const call = async (path: string, method: string, body: unknown) => {
    setErr(null);
    try {
      refresh(await api<LegalCheck>(path, { method, body }));
    } catch (e) {
      setErr(errorText(e));
    }
  };
  if (isPending) return <div className="empty">Loading…</div>;
  if (error || !c) return <div className="empty error">{errorText(error)}</div>;
  const locked = c.status === 'shared';
  const open = c.findings.filter((f) => f.level !== 'green' && f.review === 'open').length;
  const text = summary ?? c.summary ?? '';
  return (
    <div className="customer">
      <header className="ticket-head">
        <div>
          <h2>{c.property_name ?? 'Property'}</h2>
          <span className="sub">
            EC from {c.ec_office ?? 'the sub-registrar'} · {date(c.ec_period_from)} –{' '}
            {date(c.ec_period_to)} · rules {c.rules_version}
          </span>
        </div>
        <div className="row">
          <LevelBadge level={c.overall} />
          <span className="badge">{LEGAL_CHECK_STATUS_LABELS[c.status]}</span>
        </div>
      </header>
      <div className="row">
        <Link to={`/customers?id=${c.account_id}&property=${c.property_id}`}>
          Open the property
        </Link>
        <a href={`/legal/${c.id}/report`} target="_blank" rel="noreferrer">
          Open the report (print or save as PDF)
        </a>
      </div>
      <div className="sections">
        {c.findings.map((f, i) => (
          <FindingCard
            key={i}
            f={f}
            locked={locked}
            onReview={(review, note) =>
              void call(`/backoffice/legal-checks/${c.id}/findings`, 'POST', {
                index: i,
                review,
                staff_note: note,
              })
            }
          />
        ))}
        {c.findings.length === 0 ? <span className="sub">No findings.</span> : null}
      </div>
      <div className="card-block">
        <h3>Summary for the customer</h3>
        <textarea
          value={text}
          disabled={locked}
          placeholder="Two or three plain sentences: what we checked, what we found, what to do next."
          onChange={(e) => setSummary(e.target.value)}
        />
        {!locked ? (
          <div className="row">
            <button
              className="btn small"
              disabled={summary === null || summary === (c.summary ?? '')}
              onClick={() =>
                void call(`/backoffice/legal-checks/${c.id}`, 'PATCH', {
                  summary: text.trim() || null,
                }).then(() => setSummary(null))
              }
            >
              Save summary
            </button>
          </div>
        ) : null}
      </div>
      {!locked ? (
        <div className="donext">
          <h3>
            {open
              ? `Review ${open} amber or red finding${open > 1 ? 's' : ''}`
              : c.status === 'ready'
                ? 'Ready to share'
                : 'Mark it ready'}
          </h3>
          <span className="sub">
            Confirm each finding that stands, dismiss any that is wrong (with a note). Sharing shows
            the report to the customer in the app and locks it.
          </span>
          <div className="row">
            {c.status === 'in_review' ? (
              <button
                className="btn primary"
                disabled={open > 0}
                onClick={() =>
                  void call(`/backoffice/legal-checks/${c.id}`, 'PATCH', { status: 'ready' })
                }
              >
                Mark ready
              </button>
            ) : (
              <>
                <button
                  className="btn primary"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Share this report with the customer? It is locked after sharing.',
                      )
                    )
                      void call(`/backoffice/legal-checks/${c.id}`, 'PATCH', { status: 'shared' });
                  }}
                >
                  Share with the customer
                </button>
                <button
                  className="btn"
                  onClick={() =>
                    void call(`/backoffice/legal-checks/${c.id}`, 'PATCH', { status: 'in_review' })
                  }
                >
                  Back to review
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <span className="sub">Shared {dateTime(c.shared_at)}. Locked.</span>
      )}
      {err ? <span className="error">{err}</span> : null}
    </div>
  );
}

function FindingCard({
  f,
  locked,
  onReview,
}: {
  f: LegalFinding;
  locked: boolean;
  onReview: (review: LegalFinding['review'], note: string | null) => void;
}) {
  const [note, setNote] = useState(f.staff_note ?? '');
  return (
    <div className={`finding ${f.level} ${f.review === 'dismissed' ? 'dismissed' : ''}`}>
      <div className="row between">
        <b>{f.title}</b>
        <span className={`badge ${LEVEL_TONES[f.level]}`}>{LEGAL_LEVEL_LABELS[f.level]}</span>
      </div>
      <span>{f.detail}</span>
      {f.evidence.length ? (
        <span className="sub">
          EC entries:{' '}
          {f.evidence
            .map(
              (e) =>
                `${e.document_number ?? 'no number'} (${e.registration_date ?? 'no date'}, page ${e.pages.join(', ') || '?'})`,
            )
            .join(' · ')}
        </span>
      ) : null}
      {f.level !== 'green' ? (
        <div className="row">
          <input
            className="grow"
            value={note}
            disabled={locked}
            placeholder="Note (what you checked)"
            onChange={(e) => setNote(e.target.value)}
          />
          {(['confirmed', 'dismissed'] as const).map((r) => (
            <button
              key={r}
              className={`btn small ${f.review === r ? (r === 'confirmed' ? 'primary' : 'danger-solid') : ''}`}
              disabled={locked}
              onClick={() => onReview(r, note.trim() || null)}
            >
              {r === 'confirmed' ? 'Confirm' : 'Dismiss'}
            </button>
          ))}
          {f.review !== 'open' && !locked ? (
            <button className="link" onClick={() => onReview('open', note.trim() || null)}>
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
