import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  TICKET_CATEGORY_LABELS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  type BackofficeTicket,
  type BackofficeTicketDetail,
  type TicketStatus,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { useUrlState } from '../lib/params';
import { dateTime, relative } from '../lib/format';
import { TICKET_TONES } from '../ui/status';

const FILTERS: { value: 'open' | 'all' | TicketStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'waiting_on_customer', label: 'Waiting on customer' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
];

/** The support inbox: newest activity first; pick a ticket to reply beside the list. */
export function Support() {
  const [params, set] = useUrlState();
  const status = params.get('status') ?? 'open';
  const selected = params.get('id');
  const { data, error, isPending } = useQuery({
    queryKey: ['bo-tickets', status],
    queryFn: () => api<BackofficeTicket[]>(`/backoffice/tickets?status=${status}`),
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Support</h1>
          <p>Newest activity first.</p>
        </div>
        <div className="tabs" role="group" aria-label="Status">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              aria-pressed={status === f.value}
              onClick={() => set({ status: f.value, id: null })}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className={`split ${selected ? '' : 'closed'}`}>
        <section className="section">
          {isPending ? <div className="empty">Loading…</div> : null}
          {error ? <div className="empty error">{errorText(error)}</div> : null}
          {data && data.length === 0 ? <div className="empty">No tickets here.</div> : null}
          {data && data.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Customer</th>
                    <th>About</th>
                    <th>Status</th>
                    <th>Last message</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((t) => (
                    <tr
                      key={t.id}
                      className={selected === t.id ? 'selected' : ''}
                      onClick={() => set({ id: t.id })}
                    >
                      <td>
                        {t.subject}
                        <span className="sub mono">
                          {t.reference} · {TICKET_CATEGORY_LABELS[t.category]}
                        </span>
                      </td>
                      <td>
                        {t.customer_name || '—'}
                        <span className="sub">{t.customer_phone ?? ''}</span>
                      </td>
                      <td>{t.service_request?.service?.name ?? t.property?.name ?? '—'}</td>
                      <td>
                        <span className={`badge ${TICKET_TONES[t.status]}`}>
                          {TICKET_STATUS_LABELS[t.status]}
                        </span>
                      </td>
                      <td>{relative(t.last_message_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
        {selected ? <TicketPanel id={selected} onClose={() => set({ id: null })} /> : null}
      </div>
    </div>
  );
}

function TicketPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const {
    data: t,
    error,
    isPending,
  } = useQuery({
    queryKey: ['bo-ticket', id],
    queryFn: () => api<BackofficeTicketDetail>(`/backoffice/tickets/${id}`),
  });
  const [reply, setReply] = useState('');
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['bo-tickets'] });
    void qc.invalidateQueries({ queryKey: ['bo-ticket', id] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const send = useMutation({
    mutationFn: () =>
      api(`/backoffice/tickets/${id}/messages`, { method: 'POST', body: { body: reply } }),
    onSuccess: () => {
      setReply('');
      refresh();
    },
  });
  const setStatus = useMutation({
    mutationFn: (status: TicketStatus) =>
      api(`/backoffice/tickets/${id}/status`, { method: 'POST', body: { status } }),
    onSuccess: refresh,
  });

  return (
    <aside className="panel" aria-label="Ticket">
      <div className="panel-head">
        <div>
          <h2>{t?.subject ?? 'Ticket'}</h2>
          {t ? <span className="mono">{t.reference}</span> : null}
        </div>
        <button className="link" onClick={onClose}>
          Close
        </button>
      </div>
      {isPending ? <div className="empty">Loading…</div> : null}
      {error ? <div className="empty error">{errorText(error)}</div> : null}
      {t ? (
        <div className="panel-body">
          <dl className="kv">
            <dt>Customer</dt>
            <dd>
              {t.customer_name || '—'} <span className="mono">{t.customer_phone ?? ''}</span>
            </dd>
            <dt>Category</dt>
            <dd>{TICKET_CATEGORY_LABELS[t.category]}</dd>
            {t.property ? (
              <>
                <dt>Property</dt>
                <dd>{t.property.name}</dd>
              </>
            ) : null}
            {t.service_request ? (
              <>
                <dt>Request</dt>
                <dd>
                  {t.service_request.service?.name}{' '}
                  <span className="mono">{t.service_request.reference}</span>
                </dd>
              </>
            ) : null}
            <dt>Status</dt>
            <dd>
              <select
                id="ticket-status"
                value={t.status}
                disabled={setStatus.isPending}
                onChange={(e) => setStatus.mutate(e.target.value as TicketStatus)}
              >
                {TICKET_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TICKET_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </dd>
          </dl>
          <div className="thread">
            {t.messages.map((m) => (
              <div key={m.id} className={`msg ${m.author_type === 'staff' ? 'staff' : ''}`}>
                {m.body}
                {m.attachments.length ? <small>{m.attachments.length} attachment(s)</small> : null}
                <small>
                  {m.author_type === 'staff' ? 'Propittu' : 'Customer'} · {dateTime(m.created_at)}
                </small>
              </div>
            ))}
          </div>
          <div className="block">
            <textarea
              id="reply"
              placeholder="Write a reply…"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
            <div className="row">
              <button
                className="btn primary"
                disabled={!reply.trim() || send.isPending}
                onClick={() => send.mutate()}
              >
                {send.isPending ? 'Sending…' : 'Send reply'}
              </button>
            </div>
            {send.error ? <div className="error">{errorText(send.error)}</div> : null}
            {setStatus.error ? <div className="error">{errorText(setStatus.error)}</div> : null}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
