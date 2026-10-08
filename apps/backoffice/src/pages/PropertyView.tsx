import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  FACT_LABELS,
  PITTU_QUESTION_LABELS,
  PROPERTY_TYPE_LABELS,
  REVIEW_REASON_LABELS,
  type BackofficeProperty,
  type DocumentStatus,
  type PittuQuestionId,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { date } from '../lib/format';
import { Feedback, useAction } from '../ui/action';

const show = (v: unknown) =>
  v === null || v === undefined || v === ''
    ? '—'
    : typeof v === 'object'
      ? JSON.stringify(v)
      : String(v as string | number | boolean);

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
        <table className="compact">
          <thead>
            <tr>
              <th>Field</th>
              <th>Read</th>
              <th>Kept</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {pittu.facts.map((f) => (
              <tr key={f.key}>
                <td>{FACT_LABELS[f.key] ?? f.key}</td>
                <td>{show(f.value)}</td>
                <td>{show(f.final_value)}</td>
                <td>
                  {f.status}
                  {f.confidence ? <span className="sub">{f.confidence}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
