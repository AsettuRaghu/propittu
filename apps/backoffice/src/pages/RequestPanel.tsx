import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  PREFERRED_SLOT_LABELS,
  VISIT_CONDITIONS,
  VISIT_CONDITION_LABELS,
  requestExpectedBy,
  requestStatusLabel,
  requestTransitions,
  type BackofficeRequestDetail,
  type ServiceRequestStatus,
  type VisitCondition,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { date, dateTime, rupees } from '../lib/format';
import { Feedback, useAction } from '../ui/action';
import { REQUEST_TONES } from '../ui/status';

const ACTION_LABELS: Partial<Record<ServiceRequestStatus, string>> = {
  confirmed: 'Accept',
  scheduled: 'Schedule visit',
  in_progress: 'Start work',
  completed: 'Complete and publish',
  cancelled: 'Cancel request',
};

/** One request beside the list: what it is, who it's for, and everything staff can do next. */
export function RequestPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
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
          <button className="link" onClick={onClose} aria-label="Close">
            Close
          </button>
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
  return (
    <div className="panel-body">
      <dl className="kv">
        <dt>Customer</dt>
        <dd>
          {r.customer_name || '—'}
          <br />
          <span className="mono">{r.customer_phone ?? ''}</span>
        </dd>
        <dt>Property</dt>
        <dd>
          {r.property?.name ?? 'Property deleted'}
          {r.property_address ? <span className="sub">{r.property_address}</span> : null}
        </dd>
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
            <dt>Notes</dt>
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

      <StatusActions r={r} onChanged={onChanged} />
      {r.coverage === 'extra' &&
      r.order?.status !== 'paid' &&
      !['completed', 'cancelled'].includes(r.status) ? (
        <Price r={r} onChanged={onChanged} />
      ) : null}
      {r.fulfilment === 'assistance' && !['completed', 'cancelled'].includes(r.status) ? (
        <Ask r={r} onChanged={onChanged} />
      ) : null}
      {r.fulfilment === 'visit' ? (
        <Report r={r} onChanged={onChanged} />
      ) : (
        <Outcome r={r} onChanged={onChanged} />
      )}
    </div>
  );
}

function StatusActions({ r, onChanged }: { r: BackofficeRequestDetail; onChanged: () => void }) {
  const next = requestTransitions(r.fulfilment, r.status).filter(
    (s) => s !== 'awaiting_customer' && !(s === 'scheduled' && r.status === 'scheduled'),
  );
  const rescheduling =
    r.status === 'scheduled' && requestTransitions(r.fulfilment, r.status).includes('scheduled');
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const a = useAction(onChanged);
  if (next.length === 0 && !rescheduling) return null;

  const move = (status: ServiceRequestStatus) => {
    if (status === 'scheduled' && !when) return;
    a.mutate({
      path: `/backoffice/requests/${r.id}/status`,
      body: {
        status,
        scheduled_for: status === 'scheduled' ? new Date(when).toISOString() : undefined,
        note: note.trim() || undefined,
      },
      ok: `Moved to ${requestStatusLabel(status, r.fulfilment)}`,
    });
  };

  return (
    <div className="block">
      <h3>Next step</h3>
      {next.includes('scheduled') || rescheduling ? (
        <label className="field">
          Visit date and time
          <input
            id="visit-when"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </label>
      ) : null}
      <label className="field">
        Note to the customer (optional)
        <textarea
          id="status-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
        />
      </label>
      <div className="row">
        {rescheduling ? (
          <button className="btn" disabled={!when || a.isPending} onClick={() => move('scheduled')}>
            Reschedule
          </button>
        ) : null}
        {next.map((s) => (
          <button
            key={s}
            className={`btn ${s === 'cancelled' ? 'danger' : s === next[0] ? 'primary' : ''}`}
            disabled={a.isPending || (s === 'scheduled' && !when)}
            onClick={() => move(s)}
          >
            {ACTION_LABELS[s] ?? requestStatusLabel(s, r.fulfilment)}
          </button>
        ))}
      </div>
      <Feedback a={a} />
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
      {rep?.media.length ? (
        <span className="sub">
          {rep.media.length} photo or video file(s) attached (add them from the app's Backoffice).
        </span>
      ) : null}
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
      {o?.files.length ? (
        <span className="sub">
          {o.files.length} file(s) attached (add them from the app's Backoffice).
        </span>
      ) : null}
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
