import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  LEGAL_CHECK_STATUS_LABELS,
  EC_ENTRY_KIND_LABELS,
  FACT_LABELS,
  PITTU_QUESTION_LABELS,
  PROPERTY_TYPE_LABELS,
  REVIEW_REASON_LABELS,
  type BackofficeProperty,
  type DocumentStatus,
  type EcEntry,
  type EcReading,
  type LegalCheck,
  type StaffDocumentReading,
  type PittuQuestionId,
} from '@propittu/shared';
import { Link, useNavigate } from 'react-router';
import { api, errorText } from '../lib/api';
import { date } from '../lib/format';
import { Feedback, useAction } from '../ui/action';
import { DataTable, type Column } from '../ui/DataTable';
import { LevelBadge, useLegalChecks } from './Legal';

const show = (v: unknown) =>
  v === null || v === undefined || v === ''
    ? '—'
    : typeof v === 'object'
      ? JSON.stringify(v)
      : String(v as string | number | boolean);

type Fact = NonNullable<BackofficeProperty['pittu']>['facts'][number];
const FACT_COLUMNS: Column<Fact>[] = [
  {
    key: 'field',
    header: 'Field',
    sort: (f) => FACT_LABELS[f.key] ?? f.key,
    render: (f) => FACT_LABELS[f.key] ?? f.key,
  },
  { key: 'read', header: 'Read', sort: (f) => show(f.value), render: (f) => show(f.value) },
  {
    key: 'kept',
    header: 'Kept',
    sort: (f) => show(f.final_value),
    render: (f) => show(f.final_value),
  },
  {
    key: 'status',
    header: 'Status',
    sort: (f) => f.status,
    render: (f) => (
      <>
        {f.status}
        {f.confidence ? <span className="sub">{f.confidence}</span> : null}
      </>
    ),
  },
];

/** One property inside the customer panel: details, reach, documents, what Pittu read. */
export function PropertyView({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { data, error, isPending } = useQuery({
    queryKey: ['bo-property', id],
    queryFn: () => api<BackofficeProperty>(`/backoffice/properties/${id}`),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['bo-property', id] });
    void qc.invalidateQueries({ queryKey: ['bo-reviews'] });
  };

  return (
    <div className="panel-body">
      <button className="link back" onClick={onBack}>
        ← Back to the customer
      </button>
      {isPending ? <span className="sub">Loading…</span> : null}
      {error ? <span className="error">{errorText(error)}</span> : null}
      {data ? <Body p={data} onChanged={refresh} /> : null}
    </div>
  );
}

function Body({ p, onChanged }: { p: BackofficeProperty; onChanged: () => void }) {
  const pr = p.property;
  const place = [pr.address_line, pr.city, pr.state, pr.pincode].filter(Boolean).join(', ');
  return (
    <>
      <div className="block">
        <h3>{pr.name}</h3>
        <dl className="kv">
          <dt>Type</dt>
          <dd>{PROPERTY_TYPE_LABELS[pr.property_type]}</dd>
          <dt>Address</dt>
          <dd>{place || '—'}</dd>
          {pr.survey_number ? (
            <>
              <dt>Survey no.</dt>
              <dd>{pr.survey_number}</dd>
            </>
          ) : null}
          {pr.khata_number ? (
            <>
              <dt>Khata no.</dt>
              <dd>{pr.khata_number}</dd>
            </>
          ) : null}
          {pr.latitude !== null && pr.longitude !== null ? (
            <>
              <dt>Map</dt>
              <dd>
                <a
                  href={`https://www.google.com/maps?q=${pr.latitude},${pr.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open the pin
                </a>
              </dd>
            </>
          ) : null}
        </dl>
      </div>
      <Reach p={p} onChanged={onChanged} />
      <Documents p={p} onChanged={onChanged} />
      {p.photos.length > 0 ? (
        <div className="block">
          <h3>Photos ({p.photos.length})</h3>
          <div className="thumbs">
            {p.photos.map((ph) =>
              ph.url ? (
                <a key={ph.id} href={ph.url} target="_blank" rel="noreferrer">
                  <img src={ph.url} alt={ph.caption ?? 'Property photo'} />
                </a>
              ) : null,
            )}
          </div>
        </div>
      ) : null}
      <LegalChecks p={p} />
      <Pittu p={p} onChanged={onChanged} />
    </>
  );
}

function Reach({ p, onChanged }: { p: BackofficeProperty; onChanged: () => void }) {
  const a = useAction(onChanged);
  const r = p.reach;
  if (!r) return null;
  const path = `/backoffice/properties/${p.property.id}/reach-exception`;
  return (
    <div className="block">
      <h3>Can our team reach it</h3>
      <dl className="kv">
        <dt>Visits</dt>
        <dd>
          {r.visits ? 'Yes' : 'No'}
          {r.area_name ? ` · ${r.area_name}` : ''}
          {r.exception ? ' (served by exception)' : ''}
        </dd>
        <dt>Paperwork</dt>
        <dd>
          {r.paperwork ? 'Yes' : 'No'}
          {r.state ? ` · ${r.state}` : ''}
        </dd>
        {r.exception_reason ? (
          <>
            <dt>Why</dt>
            <dd>{r.exception_reason}</dd>
          </>
        ) : null}
      </dl>
      <div className="row">
        {r.exception ? (
          <button
            className="btn"
            disabled={a.isPending}
            onClick={() => a.mutate({ path, method: 'DELETE', ok: 'Exception removed' })}
          >
            Remove the exception
          </button>
        ) : !r.visits ? (
          <button
            className="btn"
            disabled={a.isPending}
            onClick={() => {
              const reason = window.prompt('Why serve this property anyway?');
              if (reason && reason.trim().length >= 3)
                a.mutate({ path, body: { reason: reason.trim() }, ok: 'We will serve it' });
            }}
          >
            Serve it anyway
          </button>
        ) : null}
      </div>
      <Feedback a={a} />
    </div>
  );
}

function Documents({ p, onChanged }: { p: BackofficeProperty; onChanged: () => void }) {
  const a = useAction(onChanged);
  const [opening, setOpening] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const open = async (id: string) => {
    setOpening(id);
    setFailed(null);
    // Open the tab first so the browser doesn't block it as a pop-up.
    const tab = window.open('', '_blank');
    try {
      const { url } = await api<{ url: string }>(`/backoffice/documents/${id}/download`);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch (err) {
      tab?.close();
      setFailed(errorText(err));
    } finally {
      setOpening(null);
    }
  };
  return (
    <div className="block">
      <h3>Documents ({p.documents.length})</h3>
      {p.documents.length === 0 ? <span className="sub">None yet.</span> : null}
      <ul className="list">
        {p.documents.map((d) => (
          <li key={d.id}>
            <button className="link" disabled={opening === d.id} onClick={() => void open(d.id)}>
              {d.file_name}
            </button>
            <span className="sub">
              {DOCUMENT_TYPE_LABELS[d.document_type]} · {date(d.created_at)}
            </span>
            <select
              value={d.status}
              aria-label="Document status"
              disabled={a.isPending}
              onChange={(e) =>
                a.mutate({
                  path: `/backoffice/documents/${d.id}/status`,
                  body: { status: e.target.value },
                  ok: `Marked ${DOCUMENT_STATUS_LABELS[e.target.value as DocumentStatus]}`,
                })
              }
            >
              {DOCUMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {DOCUMENT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            {d.document_type === 'encumbrance_certificate' || d.document_type === 'sale_deed' ? (
              <DocReading documentId={d.id} kind={d.document_type} />
            ) : null}
          </li>
        ))}
      </ul>
      {failed ? <div className="error">{failed}</div> : null}
      <Feedback a={a} />
    </div>
  );
}

function Pittu({ p, onChanged }: { p: BackofficeProperty; onChanged: () => void }) {
  const a = useAction(onChanged);
  const [note, setNote] = useState(p.pittu?.review?.note ?? '');
  const pittu = p.pittu;
  if (!pittu) return null;
  const review = pittu.review;
  const answers = Object.entries(pittu.answers) as [PittuQuestionId, string][];
  return (
    <div className="block">
      <h3>What Pittu read</h3>
      {review ? (
        <div className="callout">
          <b>{review.status === 'open' ? 'Needs a look' : 'Checked'}</b>
          <span className="sub">
            {review.reasons.map((r) => REVIEW_REASON_LABELS[r]).join(' · ') || 'No reasons'}
          </span>
          <textarea
            placeholder="Note for the team (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="row">
            <button
              className="btn primary"
              disabled={a.isPending}
              onClick={() =>
                a.mutate({
                  path: `/backoffice/properties/${p.property.id}/review`,
                  body: {
                    status: review.status === 'open' ? 'done' : 'open',
                    note: note.trim() || undefined,
                  },
                  ok: review.status === 'open' ? 'Marked checked' : 'Opened again',
                })
              }
            >
              {review.status === 'open' ? 'Mark checked' : 'Open again'}
            </button>
          </div>
          <Feedback a={a} />
        </div>
      ) : null}
      {answers.length > 0 ? (
        <dl className="kv">
          {answers.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>{PITTU_QUESTION_LABELS[k]}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {pittu.facts.length > 0 ? (
        <DataTable
          rows={pittu.facts}
          columns={FACT_COLUMNS}
          rowKey={(f) => f.key}
          defaultSort={{ key: 'field', dir: 'asc' }}
        />
      ) : null}
    </div>
  );
}

/** Pittu Read on one document: start it, follow it, and (for an EC) show what it found. */
function DocReading({
  documentId,
  kind,
}: {
  documentId: string;
  kind: 'encumbrance_certificate' | 'sale_deed';
}) {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const key = ['bo-reading', documentId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () =>
      api<StaffDocumentReading>(`/backoffice/documents/${documentId}/reading`).catch(() => null),
    refetchInterval: (q) => {
      const st = q.state.data?.status;
      return st === 'queued' || st === 'reading' ? 4000 : false;
    },
  });
  const [open, setOpen] = useState(false);
  const start = async () => {
    setErr(null);
    try {
      await api(`/backoffice/documents/${documentId}/read`, { method: 'POST' });
      await qc.invalidateQueries({ queryKey: key });
      setOpen(true);
    } catch (e) {
      setErr(errorText(e));
    }
  };
  const label = kind === 'encumbrance_certificate' ? 'EC' : 'deed';
  return (
    <div className="doc-reading">
      {!data ? (
        <button className="btn small" onClick={() => void start()}>
          Read with Pittu
        </button>
      ) : data.status === 'queued' || data.status === 'reading' ? (
        <span className="sub">Pittu is reading the {label}…</span>
      ) : data.status === 'failed' ? (
        <span className="error">
          Pittu couldn't read it ({data.error_code ?? 'failed'}).{' '}
          {data.error_code === 'failed' || data.error_code === 'unavailable' ? (
            <button className="link" onClick={() => void start()}>
              Try again
            </button>
          ) : null}
        </span>
      ) : kind === 'encumbrance_certificate' ? (
        <button className="link" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide' : 'Show'} what Pittu read
        </button>
      ) : (
        <span className="sub">Read — see “What Pittu read” below.</span>
      )}
      {err ? <span className="error">{err}</span> : null}
      {open && data?.status === 'ready' && kind === 'encumbrance_certificate' ? (
        <EcView ec={data.result as EcReading} />
      ) : null}
    </div>
  );
}

const EC_COLUMNS: Column<EcEntry>[] = [
  {
    key: 'date',
    header: 'Registered',
    sort: (e) => e.registration_date,
    render: (e) => e.registration_date ?? '—',
  },
  {
    key: 'kind',
    header: 'Type',
    sort: (e) => e.kind,
    render: (e) => (
      <>
        <span
          className={`badge ${e.kind === 'mortgage' || e.kind === 'court_order' ? 'warn' : e.kind === 'release' ? 'good' : ''}`}
        >
          {EC_ENTRY_KIND_LABELS[e.kind]}
        </span>
        <span className="sub">{e.kind_as_written ?? ''}</span>
      </>
    ),
  },
  {
    key: 'doc',
    header: 'Document no.',
    sort: (e) => e.document_number,
    render: (e) => <span className="mono">{e.document_number ?? '—'}</span>,
  },
  {
    key: 'parties',
    header: 'From → to',
    sort: (e) => e.from_parties.join(', '),
    render: (e) => (
      <>
        {e.from_parties.join(', ') || '—'} → {e.to_parties.join(', ') || '—'}
      </>
    ),
    csv: (e) => `${e.from_parties.join('; ')} -> ${e.to_parties.join('; ')}`,
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    sort: (e) => e.consideration_inr,
    render: (e) => (e.consideration_inr ? `₹${e.consideration_inr.toLocaleString('en-IN')}` : '—'),
  },
  {
    key: 'conf',
    header: 'Sure?',
    sort: (e) => e.confidence,
    render: (e) => (
      <span className={e.confidence === 'low' ? 'warn-text' : 'sub'}>{e.confidence ?? '—'}</span>
    ),
  },
];

function EcView({ ec }: { ec: EcReading }) {
  return (
    <div className="ec-view">
      <dl className="kv">
        <dt>Issued by</dt>
        <dd>{ec.issuing_office ?? '—'}</dd>
        <dt>Period</dt>
        <dd>
          {ec.period_from ?? '?'} to {ec.period_to ?? '?'}
        </dd>
        <dt>Property</dt>
        <dd>
          {ec.property_as_written ?? '—'}
          <span className="sub">
            {[ec.village, ec.survey_numbers.join(', ')].filter(Boolean).join(' · ')}
          </span>
        </dd>
      </dl>
      {ec.nil_encumbrance ? (
        <span className="badge good">No transactions found for this period</span>
      ) : (
        <DataTable
          rows={ec.entries}
          columns={EC_COLUMNS}
          rowKey={(e) => `${e.document_number}-${e.registration_date}-${e.kind}`}
          defaultSort={{ key: 'date', dir: 'asc' }}
          exportName="ec-entries"
        />
      )}
      <span className="sub">
        Pittu Read lists what the EC says; it doesn't judge risk. Check anything marked “low”.
      </span>
    </div>
  );
}

/** Pittu Legal on this property: run the EC check, see earlier checks. */
function LegalChecks({ p }: { p: BackofficeProperty }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const checks = useLegalChecks(p.property.id);
  const ecs = p.documents.filter((d) => d.document_type === 'encumbrance_certificate');
  const [ec, setEc] = useState(ecs[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const c = await api<LegalCheck>(`/backoffice/properties/${p.property.id}/legal-checks`, {
        method: 'POST',
        body: { ec_document_id: ec },
      });
      void qc.invalidateQueries({ queryKey: ['bo-legal'] });
      void navigate(`/legal?status=all&id=${c.id}`);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="block">
      <h3>Legal check (Pittu Legal)</h3>
      {ecs.length === 0 ? (
        <span className="sub">
          Add the property's Encumbrance Certificate (document type “Encumbrance Certificate (EC)”),
          read it with Pittu, then run the check here.
        </span>
      ) : (
        <div className="row">
          <select value={ec} onChange={(e) => setEc(e.target.value)} aria-label="EC">
            {ecs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.file_name}
              </option>
            ))}
          </select>
          <button className="btn small primary" disabled={!ec || busy} onClick={() => void run()}>
            {busy ? 'Checking…' : 'Run the EC check'}
          </button>
        </div>
      )}
      {err ? <span className="error">{err}</span> : null}
      {checks.data?.length ? (
        <ul className="list">
          {checks.data.map((c) => (
            <li key={c.id}>
              <Link to={`/legal?status=all&id=${c.id}`}>Check of {date(c.created_at)}</Link>
              <LevelBadge level={c.overall} />
              <span className="sub">{LEGAL_CHECK_STATUS_LABELS[c.status]}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
