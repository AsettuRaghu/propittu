import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import {
  CANCEL_POLICY_LABELS,
  PAYMENT_TIMING_LABELS,
  PREFERRED_SLOT_LABELS,
  SERVICE_FULFILMENT_LABELS,
  formatIndianMobile,
  VISIT_CONDITIONS,
  VISIT_CONDITION_LABELS,
  requestExpectedBy,
  requestStatusLabel,
  type BackofficeRequestDetail,
  type ServiceRequestStatus,
  type VisitCondition,
} from '@propittu/shared';
import { Link } from 'react-router';
import { api, errorText } from '../lib/api';
import { date, dateTime, rupees } from '../lib/format';
import { uploadFile } from '../lib/upload';
import { Feedback, useAction } from '../ui/action';
import { REQUEST_TONES } from '../ui/status';
import { useEscape } from '../ui/useEscape';
import { useServices } from './Services';

/** One request beside the list: what it is, who it's for, and everything staff can do next. */
export function RequestPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  useEscape(onClose);
  const {
    data: r,
    error,
    isPending,
  } = useQuery({
    queryKey: ['bo-request', id],
    queryFn: () => api<BackofficeRequestDetail>(`/backoffice/requests/${id}`),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['bo-requests'] });
    void qc.invalidateQueries({ queryKey: ['bo-request', id] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  return (
    <aside className="panel" aria-label="Request">
      <div className="panel-head">
        <div>
          <h2>{r?.service.name ?? 'Request'}</h2>
          {r ? <span className="mono">{r.reference}</span> : null}
        </div>
        <div className="row">
          {r ? (
            <span className={`badge ${REQUEST_TONES[r.status]}`}>
              {requestStatusLabel(r.status, r.fulfilment)}
            </span>
          ) : null}
        </div>
      </div>
      {isPending ? <div className="empty">Loading…</div> : null}
      {error ? <div className="empty error">{errorText(error)}</div> : null}
      {r ? <Body key={r.updated_at} r={r} onChanged={refresh} /> : null}
    </aside>
  );
}

function Body({ r, onChanged }: { r: BackofficeRequestDetail; onChanged: () => void }) {
  const due = requestExpectedBy(r);
  const [info, setInfo] = useState(false);
  const services = useServices();
  const service = services.data?.find((s) => s.id === r.service.id);
  const open = !['completed', 'cancelled'].includes(r.status);
  const showReport = ['scheduled', 'in_progress', 'completed'].includes(r.status) || !!r.report;
  const showOutcome =
    ['in_progress', 'awaiting_customer', 'completed'].includes(r.status) || !!r.outcome;
  return (
    <div className="request-pane">
      <StepBar r={r} />
      <div className="request-grid">
        <div className="request-side">
          <div className="card-block">
            <h3>Customer and property</h3>
            <div className="row between">
              <Link to={`/customers?id=${r.account_id}`} className="strong">
                {r.customer_name || 'Customer'}
              </Link>
              <span className="sub">
                {r.customer_phone ? formatIndianMobile(r.customer_phone) : ''}
              </span>
            </div>
            <div className="row between">
              <span>{r.property?.name ?? 'Property deleted'}</span>
              <span className="sub">{r.property?.city ?? ''}</span>
            </div>
            {r.property_address ? (
              <span className="sub clip" title={r.property_address}>
                {r.property_address}
              </span>
            ) : null}
          </div>

          <div className="card-block">
            <div className="row between">
              <h3>Request</h3>
              <button
                className={`info-btn ${info ? 'on' : ''}`}
                onClick={() => setInfo((v) => !v)}
                aria-expanded={info}
                title="What the customer was shown for this service"
              >
                i
              </button>
            </div>
            {info ? (
              <div className="service-info">
                <b>{r.service.name}</b>
                {service?.description ? <span>{service.description}</span> : null}
                {r.service.includes.length ? (
                  <ul>
                    {r.service.includes.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                ) : null}
                <span className="sub">
                  {SERVICE_FULFILMENT_LABELS[r.fulfilment]}
                  {r.service.turnaround ? ` · ${r.service.turnaround}` : ''}
                  {r.service.expected_days
                    ? ` · usually ${r.service.expected_days} working days`
                    : ''}
                </span>
                <span className="sub">
                  {PAYMENT_TIMING_LABELS[r.payment_timing]} ·{' '}
                  {CANCEL_POLICY_LABELS[r.cancel_policy]}
                </span>
              </div>
            ) : null}
            <dl className="kv">
              <dt>Requested</dt>
              <dd>{dateTime(r.created_at)}</dd>
              {r.fulfilment === 'visit' ? (
                <>
                  <dt>Preferred</dt>
                  <dd>
                    {r.preferred_date ? date(r.preferred_date) : 'Any day'}
                    {r.preferred_slot ? ` · ${PREFERRED_SLOT_LABELS[r.preferred_slot]}` : ''}
                  </dd>
                </>
              ) : null}
              {r.scheduled_for ? (
                <>
                  <dt>Visit</dt>
                  <dd>{dateTime(r.scheduled_for)}</dd>
                </>
              ) : null}
              <dt>Due</dt>
              <dd>{due ? date(due) : '—'}</dd>
              <dt>Cost</dt>
              <dd>
                {r.coverage === 'included'
                  ? 'Included in plan'
                  : r.price_paise === null
                    ? 'On quote — not priced yet'
                    : rupees(r.price_paise)}
                {r.order ? <span className="sub">Payment: {r.order.status}</span> : null}
              </dd>
              {r.description ? (
                <>
                  <dt>Customer notes</dt>
                  <dd>{r.description}</dd>
                </>
              ) : null}
              {r.status_note ? (
                <>
                  <dt>Last update</dt>
                  <dd>{r.status_note}</dd>
                </>
              ) : null}
            </dl>
          </div>

          <History r={r} />
        </div>
        <div className="request-main">
          <DoNext r={r} onChanged={onChanged} />
          {r.coverage === 'extra' && r.order?.status !== 'paid' && open ? (
            <Price r={r} onChanged={onChanged} />
          ) : null}
          {r.fulfilment === 'assistance' && open && r.status !== 'requested' ? (
            <Ask r={r} onChanged={onChanged} />
          ) : null}
          {r.fulfilment === 'visit' && showReport ? <Report r={r} onChanged={onChanged} /> : null}
          {r.fulfilment === 'assistance' && showOutcome ? (
            <Outcome r={r} onChanged={onChanged} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

type Step = { key: ServiceRequestStatus; label: string };
const VISIT_STEPS: Step[] = [
  { key: 'requested', label: 'Requested' },
  { key: 'confirmed', label: 'Accepted' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
];
const PAPERWORK_STEPS: Step[] = [
  { key: 'requested', label: 'Requested' },
  { key: 'confirmed', label: 'Accepted' },
  { key: 'in_progress', label: 'Working on it' },
  { key: 'completed', label: 'Completed' },
];

/** Where the request is on its path, as a bar across the top. */
function StepBar({ r }: { r: BackofficeRequestDetail }) {
  const steps = r.fulfilment === 'visit' ? VISIT_STEPS : PAPERWORK_STEPS;
  const at = r.status === 'awaiting_customer' ? 'in_progress' : r.status;
  const idx = steps.findIndex((s) => s.key === at);
  return (
    <ol className={`stepbar ${r.status === 'cancelled' ? 'cancelled' : ''}`}>
      {steps.map((s, i) => (
        <li key={s.key} className={i < idx ? 'done' : i === idx ? 'now' : ''}>
          <span className="dotnum">{i < idx ? '✓' : i + 1}</span>
          {s.key === 'in_progress' && r.status === 'awaiting_customer'
            ? 'Waiting for the customer'
            : s.label}
        </li>
      ))}
      {r.status === 'cancelled' ? (
        <li className="now cancel">
          <span className="dotnum">×</span>Cancelled
        </li>
      ) : null}
    </ol>
  );
}

/** One card with only what the current step needs. */
function DoNext({ r, onChanged }: { r: BackofficeRequestDetail; onChanged: () => void }) {
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const visit = r.fulfilment === 'visit';
  const ready = visit ? !!r.report : !!r.outcome;

  const go = async (steps: { status: ServiceRequestStatus; withDate?: boolean }[], ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      for (const st of steps)
        await api(`/backoffice/requests/${r.id}/status`, {
          method: 'POST',
          body: {
            status: st.status,
            scheduled_for: st.withDate ? new Date(when).toISOString() : undefined,
            note: note.trim() || undefined,
          },
        });
      setMsg({ ok: true, text: ok });
      setNote('');
      onChanged();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  const cancel = () => {
    if (
      window.confirm(
        'Cancel this request? The customer is told, and any plan visit it used is given back.',
      )
    )
      void go([{ status: 'cancelled' }], 'Cancelled');
  };
  const dateField = (label: string) => (
    <label className="field">
      {label}
      <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
    </label>
  );
  const noteField = (
    <label className="field">
      Note to the customer (optional)
      <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
    </label>
  );

  let title = '';
  let body: ReactNode = null;
  switch (r.status) {
    case 'requested':
      title = visit ? 'Accept and schedule the visit' : 'Accept the request';
      body = (
        <>
          {visit ? dateField('Visit date and time') : null}
          {noteField}
          <div className="row">
            {visit ? (
              <>
                <button
                  className="btn primary"
                  disabled={!when || busy}
                  onClick={() =>
                    void go(
                      [{ status: 'confirmed' }, { status: 'scheduled', withDate: true }],
                      'Accepted and scheduled — the customer sees the date',
                    )
                  }
                >
                  Accept and schedule
                </button>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => void go([{ status: 'confirmed' }], 'Accepted')}
                >
                  Accept without a date
                </button>
              </>
            ) : (
              <button
                className="btn primary"
                disabled={busy}
                onClick={() => void go([{ status: 'confirmed' }], 'Accepted')}
              >
                Accept
              </button>
            )}
            <button className="btn danger" disabled={busy} onClick={cancel}>
              Cancel request
            </button>
          </div>
        </>
      );
      break;
    case 'confirmed':
      title = visit ? 'Schedule the visit' : 'Start the work';
      body = (
        <>
          {visit ? dateField('Visit date and time') : null}
          {noteField}
          <div className="row">
            {visit ? (
              <button
                className="btn primary"
                disabled={!when || busy}
                onClick={() =>
                  void go(
                    [{ status: 'scheduled', withDate: true }],
                    'Scheduled — the customer sees the date',
                  )
                }
              >
                Schedule visit
              </button>
            ) : (
              <button
                className="btn primary"
                disabled={busy}
                onClick={() => void go([{ status: 'in_progress' }], 'Started')}
              >
                Start work
              </button>
            )}
            <button className="btn danger" disabled={busy} onClick={cancel}>
              Cancel request
            </button>
          </div>
        </>
      );
      break;
    case 'scheduled':
      title = `Visit on ${dateTime(r.scheduled_for)}`;
      body = (
        <>
          <span className="sub">
            Write the report below as you go; it reaches the customer only when you complete the
            request.
          </span>
          <div className="row">
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => void go([{ status: 'in_progress' }], 'Visit started')}
            >
              Start the visit
            </button>
            <button
              className="btn"
              disabled={!ready || busy}
              title={ready ? undefined : 'Save the visit report first'}
              onClick={() =>
                void go([{ status: 'completed' }], 'Completed — the report is published')
              }
            >
              Complete and publish
            </button>
          </div>
          <details className="more">
            <summary>Reschedule or cancel</summary>
            {dateField('New date and time')}
            {noteField}
            <div className="row">
              <button
                className="btn"
                disabled={!when || busy}
                onClick={() => void go([{ status: 'scheduled', withDate: true }], 'Rescheduled')}
              >
                Reschedule
              </button>
              <button className="btn danger" disabled={busy} onClick={cancel}>
                Cancel request
              </button>
            </div>
          </details>
        </>
      );
      break;
    case 'in_progress':
    case 'awaiting_customer':
      title =
        r.status === 'awaiting_customer'
          ? 'Waiting for the customer'
          : visit
            ? 'Finish the visit report, then complete'
            : 'Record the outcome, then complete';
      body = (
        <>
          {r.status === 'awaiting_customer' ? (
            <span className="sub">
              We asked the customer for information
              {r.info_ticket ? (
                <>
                  {' '}
                  (
                  <Link to={`/support?status=all&id=${r.info_ticket.id}`}>
                    {r.info_ticket.reference}
                  </Link>
                  )
                </>
              ) : null}
              . Their reply moves it back to working on it.
            </span>
          ) : (
            <span className="sub">
              {ready
                ? `The ${visit ? 'report' : 'outcome'} is saved. Completing publishes it to the customer.`
                : `Save the ${visit ? 'visit report' : 'outcome'} below first.`}
            </span>
          )}
          {noteField}
          <div className="row">
            <button
              className="btn primary"
              disabled={!ready || busy}
              onClick={() =>
                void go(
                  [{ status: 'completed' }],
                  `Completed — the ${visit ? 'report' : 'outcome'} is published`,
                )
              }
            >
              Complete and publish
            </button>
            {r.status === 'awaiting_customer' ? (
              <button
                className="btn"
                disabled={busy}
                onClick={() => void go([{ status: 'in_progress' }], 'Back to working on it')}
              >
                Continue without their reply
              </button>
            ) : null}
            <button className="btn danger" disabled={busy} onClick={cancel}>
              Cancel request
            </button>
          </div>
        </>
      );
      break;
    case 'completed':
      title = 'Completed';
      body = (
        <span className="sub">
          Done on {dateTime(r.completed_at)}. What was published is shown below.
        </span>
      );
      break;
    case 'cancelled':
      title = 'Cancelled';
      body = (
        <span className="sub">
          Cancelled {r.cancelled_by === 'customer' ? 'by the customer' : 'by our team'} on{' '}
          {dateTime(r.cancelled_at)}.
        </span>
      );
      break;
  }
  return (
    <div className="donext">
      <h3>{title}</h3>
      {body}
      {msg ? <span className={msg.ok ? 'note-ok' : 'error'}>{msg.text}</span> : null}
    </div>
  );
}

/** What happened so far, newest first. */
function History({ r }: { r: BackofficeRequestDetail }) {
  const rows = [
    { at: r.created_at, text: 'Requested by the customer' },
    r.confirmed_at ? { at: r.confirmed_at, text: 'Accepted' } : null,
    r.scheduled_for ? { at: r.scheduled_for, text: 'Visit scheduled for this time' } : null,
    r.completed_at ? { at: r.completed_at, text: 'Completed and published' } : null,
    r.cancelled_at
      ? {
          at: r.cancelled_at,
          text: `Cancelled by ${r.cancelled_by === 'customer' ? 'the customer' : 'our team'}`,
        }
      : null,
  ].filter((x): x is { at: string; text: string } => !!x);
  return (
    <div className="card-block">
      <h3>History</h3>
      <ul className="history">
        {rows
          .sort((a, b) => b.at.localeCompare(a.at))
          .map((h) => (
            <li key={h.text}>
              <span>{h.text}</span>
              <span className="sub">{dateTime(h.at)}</span>
            </li>
          ))}
      </ul>
      {r.status_note ? (
        <span className="sub">Last note to the customer: “{r.status_note}”</span>
      ) : null}
    </div>
  );
}

function Price({ r, onChanged }: { r: BackofficeRequestDetail; onChanged: () => void }) {
  const [rupeesValue, setRupees] = useState(r.price_paise ? String(r.price_paise / 100) : '');
  const a = useAction(onChanged);
  const paise = Math.round(Number(rupeesValue.replace(/[₹,\s]/g, '')) * 100);
  return (
    <div className="block">
      <h3>Price</h3>
      <div className="row">
        <input
          id="price"
          inputMode="decimal"
          placeholder="₹"
          value={rupeesValue}
          onChange={(e) => setRupees(e.target.value)}
        />
        <button
          className="btn"
          disabled={!paise || a.isPending}
          onClick={() =>
            a.mutate({
              path: `/backoffice/requests/${r.id}/price`,
              body: { price_paise: paise },
              ok: 'Price saved — the customer can pay in the app',
            })
          }
        >
          {r.price_paise === null ? 'Set the quote' : 'Change the price'}
        </button>
      </div>
      <Feedback a={a} />
    </div>
  );
}

function Ask({ r, onChanged }: { r: BackofficeRequestDetail; onChanged: () => void }) {
  const [message, setMessage] = useState('');
  const a = useAction(onChanged);
  return (
    <div className="block">
      <h3>Ask the customer</h3>
      <textarea
        id="ask"
        placeholder="What do you need from them?"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <div className="row">
        <button
          className="btn"
          disabled={message.trim().length < 3 || a.isPending}
          onClick={() =>
            a.mutate({
              path: `/backoffice/requests/${r.id}/ask`,
              body: { message },
              ok: 'Sent — the request waits for their reply',
            })
          }
        >
          Send and wait for reply
        </button>
        {r.info_ticket ? <span className="sub">Thread {r.info_ticket.reference}</span> : null}
      </div>
      <Feedback a={a} />
    </div>
  );
}

function Report({ r, onChanged }: { r: BackofficeRequestDetail; onChanged: () => void }) {
  const rep = r.report;
  const [v, setV] = useState({
    visited_at: rep?.visited_at?.slice(0, 10) ?? '',
    condition: (rep?.condition ?? '') as VisitCondition | '',
    observations: rep?.observations ?? '',
    issues: rep?.issues ?? '',
    recommendations: rep?.recommendations ?? '',
  });
  const a = useAction(onChanged);
  const locked = r.status === 'completed';
  return (
    <div className="block">
      <h3>Visit report {locked ? '(published)' : ''}</h3>
      <div className="row">
        <label className="field">
          Visited on
          <input
            id="visited-at"
            type="date"
            value={v.visited_at}
            disabled={locked}
            onChange={(e) => setV({ ...v, visited_at: e.target.value })}
          />
        </label>
        <label className="field">
          Condition
          <select
            id="condition"
            value={v.condition}
            disabled={locked}
            onChange={(e) => setV({ ...v, condition: e.target.value as VisitCondition })}
          >
            <option value="">Choose</option>
            {VISIT_CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {VISIT_CONDITION_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {(['observations', 'issues', 'recommendations'] as const).map((k) => (
        <label key={k} className="field">
          {k === 'observations' ? 'What we saw' : k === 'issues' ? 'Issues' : 'Recommendations'}
          <textarea
            id={`report-${k}`}
            value={v[k]}
            disabled={locked}
            onChange={(e) => setV({ ...v, [k]: e.target.value })}
          />
        </label>
      ))}
      {rep ? (
        <Media r={r} locked={locked} onChanged={onChanged} />
      ) : (
        <span className="sub">Save the report once to add photos and videos.</span>
      )}
      {!locked ? (
        <div className="row">
          <button
            className="btn"
            disabled={!v.visited_at || !v.condition || a.isPending}
            onClick={() =>
              a.mutate({
                path: `/backoffice/requests/${r.id}/report`,
                method: 'PUT',
                body: v,
                ok: 'Report saved (published when you complete the request)',
              })
            }
          >
            Save report
          </button>
        </div>
      ) : null}
      <Feedback a={a} />
    </div>
  );
}

function Outcome({ r, onChanged }: { r: BackofficeRequestDetail; onChanged: () => void }) {
  const o = r.outcome;
  const [v, setV] = useState({
    summary: o?.summary ?? '',
    findings: o?.findings ?? '',
    reference_number: o?.reference_number ?? '',
    next_due_date: o?.next_due_date ?? '',
  });
  const a = useAction(onChanged);
  const locked = r.status === 'completed';
  return (
    <div className="block">
      <h3>Outcome {locked ? '(published)' : ''}</h3>
      <label className="field">
        What was done
        <textarea
          id="outcome-summary"
          value={v.summary}
          disabled={locked}
          onChange={(e) => setV({ ...v, summary: e.target.value })}
        />
      </label>
      <label className="field">
        Findings
        <textarea
          id="outcome-findings"
          value={v.findings}
          disabled={locked}
          onChange={(e) => setV({ ...v, findings: e.target.value })}
        />
      </label>
      <div className="row">
        <label className="field">
          Reference number
          <input
            id="outcome-ref"
            value={v.reference_number}
            disabled={locked}
            onChange={(e) => setV({ ...v, reference_number: e.target.value })}
          />
        </label>
        <label className="field">
          Next due
          <input
            id="outcome-due"
            type="date"
            value={v.next_due_date}
            disabled={locked}
            onChange={(e) => setV({ ...v, next_due_date: e.target.value })}
          />
        </label>
      </div>
      {o ? (
        <Files r={r} locked={locked} onChanged={onChanged} />
      ) : (
        <span className="sub">Save the outcome once to attach files.</span>
      )}
      {!locked ? (
        <div className="row">
          <button
            className="btn"
            disabled={!v.summary.trim() || a.isPending}
            onClick={() =>
              a.mutate({
                path: `/backoffice/requests/${r.id}/outcome`,
                method: 'PUT',
                body: { ...v, next_due_date: v.next_due_date || null },
                ok: 'Outcome saved (published when you complete the request)',
              })
            }
          >
            Save outcome
          </button>
        </div>
      ) : null}
      <Feedback a={a} />
    </div>
  );
}

const PHOTO_MAX = 5 * 1024 * 1024;
const VIDEO_MAX = 50 * 1024 * 1024;

/** Photos and videos of the visit: shown, removable while a draft, added from this computer. */
function Media({
  r,
  locked,
  onChanged,
}: {
  r: BackofficeRequestDetail;
  locked: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const media = r.report?.media ?? [];
  const add = async (files: FileList | null) => {
    setErr(null);
    for (const f of Array.from(files ?? [])) {
      const kind = f.type.startsWith('video/') ? 'video' : 'photo';
      if (!['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'].includes(f.type)) {
        setErr(`${f.name}: use JPG or PNG photos, or MP4 / MOV videos.`);
        continue;
      }
      if (f.size > (kind === 'photo' ? PHOTO_MAX : VIDEO_MAX)) {
        setErr(
          `${f.name}: ${kind === 'photo' ? 'photos must be under 5 MB' : 'videos must be under 50 MB'}.`,
        );
        continue;
      }
      setBusy(f.name);
      try {
        await uploadFile(
          f,
          `/backoffice/requests/${r.id}/report/media/intent`,
          { kind, mime_type: f.type, file_size: f.size },
          (id) => `/backoffice/requests/${r.id}/report/media/${id}/confirm`,
        );
      } catch (e) {
        setErr(`${f.name}: ${errorText(e)}`);
      }
    }
    setBusy(null);
    onChanged();
  };
  return (
    <div className="stack">
      <div className="thumbs">
        {media.map((m) => (
          <div key={m.id} className="thumb">
            {m.url ? (
              m.kind === 'photo' ? (
                <a href={m.url} target="_blank" rel="noreferrer">
                  <img src={m.url} alt="Visit photo" />
                </a>
              ) : (
                <video src={m.url} controls />
              )
            ) : null}
            {!locked ? (
              <button
                className="thumb-x"
                aria-label="Remove"
                onClick={() => {
                  if (!window.confirm('Remove this file from the report?')) return;
                  void api(`/backoffice/requests/${r.id}/report/media/${m.id}`, {
                    method: 'DELETE',
                  })
                    .then(onChanged)
                    .catch((e: unknown) => setErr(errorText(e)));
                }}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {!locked ? (
        <label className="btn small upload">
          {busy ? `Uploading ${busy}…` : 'Add photos or videos'}
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,video/mp4,video/quicktime"
            disabled={!!busy}
            onChange={(e) => {
              void add(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      ) : null}
      {err ? <span className="error">{err}</span> : null}
    </div>
  );
}

/** Files for the outcome (e.g. the tax receipt): saved into the property's Documents on completion. */
function Files({
  r,
  locked,
  onChanged,
}: {
  r: BackofficeRequestDetail;
  locked: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const files = r.outcome?.files ?? [];
  const add = async (list: FileList | null) => {
    setErr(null);
    for (const f of Array.from(list ?? [])) {
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(f.type)) {
        setErr(`${f.name}: use a PDF, JPG or PNG file.`);
        continue;
      }
      if (f.size > 10 * 1024 * 1024) {
        setErr(`${f.name}: files must be under 10 MB.`);
        continue;
      }
      setBusy(f.name);
      try {
        await uploadFile(
          f,
          `/backoffice/requests/${r.id}/outcome/files/intent`,
          { file_name: f.name, mime_type: f.type, file_size: f.size, document_type: null },
          (id) => `/backoffice/requests/${r.id}/outcome/files/${id}/confirm`,
        );
      } catch (e) {
        setErr(`${f.name}: ${errorText(e)}`);
      }
    }
    setBusy(null);
    onChanged();
  };
  return (
    <div className="stack">
      {files.length ? (
        <ul className="list">
          {files.map((f) => (
            <li key={f.id}>
              {f.url ? (
                <a href={f.url} target="_blank" rel="noreferrer">
                  {f.file_name}
                </a>
              ) : (
                f.file_name
              )}
              {f.saved_to_documents ? <span className="badge good">In Documents</span> : null}
              {!locked ? (
                <button
                  className="link"
                  onClick={() => {
                    if (!window.confirm(`Remove ${f.file_name}?`)) return;
                    void api(`/backoffice/requests/${r.id}/outcome/files/${f.id}`, {
                      method: 'DELETE',
                    })
                      .then(onChanged)
                      .catch((e: unknown) => setErr(errorText(e)));
                  }}
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {!locked ? (
        <label className="btn small upload">
          {busy ? `Uploading ${busy}…` : 'Add files (PDF, JPG, PNG)'}
          <input
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png"
            disabled={!!busy}
            onChange={(e) => {
              void add(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      ) : null}
      {err ? <span className="error">{err}</span> : null}
    </div>
  );
}
