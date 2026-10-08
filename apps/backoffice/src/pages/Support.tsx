import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  STAFF_TICKET_STATUSES,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  formatIndianMobile,
  ticketMoves,
  ticketStage,
  type BackofficeTicket,
  type BackofficeTicketDetail,
  type StaffTicketStatus,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { dateTime, relative } from '../lib/format';
import { useTicketList } from '../lib/lists';
import { useLive } from '../lib/live';
import { useUrlState } from '../lib/params';
import { Age } from '../ui/Age';
import { DataTable, type Column } from '../ui/DataTable';
import { Tiles } from '../ui/Tiles';
import { useEscape } from '../ui/useEscape';

const STAGE_TONES: Record<StaffTicketStatus, string> = {
  open: 'warn',
  in_progress: 'info',
  resolved: 'good',
};
const stageLabel = (s: StaffTicketStatus) => TICKET_STATUS_LABELS[s];
const moveLabel = (from: StaffTicketStatus, to: StaffTicketStatus) =>
  from === 'resolved'
    ? '↺ Reopen (back to in progress)'
    : to === 'resolved'
      ? '→ Mark resolved'
      : '→ Mark in progress';

function StageBadge({ t }: { t: BackofficeTicket }) {
  const s = ticketStage(t.status);
  return <span className={`badge ${STAGE_TONES[s]}`}>{stageLabel(s)}</span>;
}

/** The support inbox, live: what needs a reply first; open a ticket to answer it. */
export function Support() {
  const [params, set] = useUrlState();
  const view = params.get('status') ?? 'reply';
  const category = params.get('category') ?? '';
  const selected = params.get('id');
  const { data, error, isPending } = useTicketList();
  const { unseen } = useLive();
  const [now] = useState(() => Date.now());

  const views = {
    reply: (t: BackofficeTicket) => t.awaiting_staff,
    open: (t: BackofficeTicket) => ticketStage(t.status) === 'open',
    in_progress: (t: BackofficeTicket) => ticketStage(t.status) === 'in_progress',
    resolved: (t: BackofficeTicket) => ticketStage(t.status) === 'resolved',
    all: () => true,
  };
  const count = (k: keyof typeof views) => data?.filter(views[k]).length ?? '–';
  const rows = data?.filter(
    (t) =>
      (views[view as keyof typeof views] ?? views.reply)(t) &&
      (!category || t.category === category),
  );
  const close = () => set({ id: null, full: null });

  const columns: Column<BackofficeTicket>[] = [
    {
      key: 'subject',
      header: 'Ticket',
      sort: (t) => t.subject,
      render: (t) => (
        <>
          {t.subject}
          {unseen.has(t.id) ? <span className="badge bad new">New reply</span> : null}
          <span className="sub mono">{t.reference}</span>
        </>
      ),
      csv: (t) => `${t.subject} ${t.reference}`,
    },
    {
      key: 'customer',
      header: 'Customer',
      sort: (t) => t.customer_name ?? t.customer_phone ?? '',
      render: (t) => (
        <>
          {t.customer_name || '—'}
          <span className="sub">
            {t.customer_phone ? formatIndianMobile(t.customer_phone) : ''}
          </span>
        </>
      ),
      csv: (t) => `${t.customer_name ?? ''} ${t.customer_phone ?? ''}`.trim(),
    },
    {
      key: 'topic',
      header: 'Topic',
      sort: (t) => TICKET_CATEGORY_LABELS[t.category],
      render: (t) => (
        <>
          {TICKET_CATEGORY_LABELS[t.category]}
          <span className="sub">{t.service_request?.service?.name ?? t.property?.name ?? ''}</span>
        </>
      ),
      csv: (t) => TICKET_CATEGORY_LABELS[t.category],
    },
    {
      key: 'status',
      header: 'Status',
      sort: (t) => STAFF_TICKET_STATUSES.indexOf(ticketStage(t.status)),
      render: (t) => (
        <>
          <StageBadge t={t} />
          {t.awaiting_staff ? <span className="sub warn-text">Needs a reply</span> : null}
        </>
      ),
      csv: (t) => stageLabel(ticketStage(t.status)),
    },
    {
      key: 'created',
      header: 'Opened',
      sort: (t) => t.created_at,
      render: (t) => relative(t.created_at),
    },
    {
      key: 'last',
      header: 'Last message',
      sort: (t) => t.last_message_at,
      render: (t) =>
        t.awaiting_staff ? (
          <Age since={t.last_message_at} now={now} />
        ) : (
          relative(t.last_message_at)
        ),
      csv: (t) => t.last_message_at,
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Support tickets</h1>
          <p>Live: new tickets and replies appear as they arrive. Tickets needing a reply first.</p>
        </div>
      </div>
      <Tiles
        value={view}
        onChange={(v) => set({ status: v, id: null })}
        tiles={[
          { value: 'reply', label: 'Needs a reply', count: count('reply'), tone: 'bad' },
          { value: 'open', label: 'Open', count: count('open'), tone: 'warn' },
          { value: 'in_progress', label: 'In progress', count: count('in_progress') },
          { value: 'resolved', label: 'Resolved', count: count('resolved'), tone: 'good' },
          { value: 'all', label: 'Everything', count: data?.length ?? '–' },
        ]}
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(t) => t.id}
        selected={selected}
        onRowClick={(t) => set({ id: t.id })}
        onClose={close}
        detail={selected ? <TicketPanel id={selected} onClose={close} /> : null}
        searchText={(t) =>
          `${t.reference} ${t.subject} ${t.customer_name ?? ''} ${t.customer_phone ?? ''} ${TICKET_CATEGORY_LABELS[t.category]} ${t.property?.name ?? ''} ${t.service_request?.service?.name ?? ''}`
        }
        searchPlaceholder="Search anything: reference, subject, customer, phone, topic"
        defaultSort={{ key: 'last', dir: 'desc' }}
        exportName="tickets"
        loading={isPending}
        error={error ? errorText(error) : null}
        empty="No tickets here."
        toolbar={
          <select
            value={category}
            onChange={(e) => set({ category: e.target.value || null })}
            aria-label="Topic"
          >
            <option value="">All topics</option>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {TICKET_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        }
      />
    </div>
  );
}

/** One ticket: a tidy summary on the left, the conversation and reply on the right. */
function TicketPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const {
    data: t,
    error,
    isPending,
  } = useQuery({
    queryKey: ['bo-ticket', id],
    queryFn: () => api<BackofficeTicketDetail>(`/backoffice/tickets/${id}`),
    refetchInterval: 60_000,
  });
  const { markSeen } = useLive();
  useEscape(onClose);
  const lastAt = t?.last_message_at;
  useEffect(() => {
    // Open (or a new message while open) counts as seen.
    markSeen(id);
  }, [id, lastAt, markSeen]);
  const [reply, setReply] = useState('');
  // Open on the newest message, and follow new ones as they arrive.
  const thread = useRef<HTMLDivElement>(null);
  const count = t?.messages.length ?? 0;
  useEffect(() => {
    const el = thread.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count, id]);
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
    mutationFn: (status: StaffTicketStatus) =>
      api(`/backoffice/tickets/${id}/status`, { method: 'POST', body: { status } }),
    onSuccess: refresh,
  });

  if (isPending) return <div className="empty">Loading…</div>;
  if (error || !t) return <div className="empty error">{errorText(error)}</div>;
  const stage = ticketStage(t.status);

  return (
    <div className="ticket">
      <header className="ticket-head">
        <div>
          <h2>{t.subject}</h2>
          <span className="sub">
            <span className="mono">{t.reference}</span> · {TICKET_CATEGORY_LABELS[t.category]} ·
            opened {dateTime(t.created_at)}
          </span>
        </div>
        <label className="status-pick">
          Status
          <select
            value=""
            disabled={setStatus.isPending}
            onChange={(e) =>
              e.target.value && setStatus.mutate(e.target.value as StaffTicketStatus)
            }
            className={`tone-${STAGE_TONES[stage]}`}
          >
            <option value="">{stageLabel(stage)}</option>
            {ticketMoves(t.status).map((s) => (
              <option key={s} value={s}>
                {moveLabel(stage, s)}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="ticket-grid">
        <aside className="ticket-side">
          <div className="card-block">
            <h3>Customer</h3>
            <Link to={`/customers?id=${t.account_id}`} className="strong">
              {t.customer_name || 'Customer'}
            </Link>
            <span className="sub">
              {t.customer_phone ? formatIndianMobile(t.customer_phone) : 'No phone'}
            </span>
          </div>
          {t.property || t.service_request ? (
            <div className="card-block">
              <h3>About</h3>
              {t.service_request ? (
                <>
                  <Link to={`/requests?status=all&id=${t.service_request.id}`} className="strong">
                    {t.service_request.service?.name ?? 'Service request'}
                  </Link>
                  <span className="sub mono">{t.service_request.reference}</span>
                </>
              ) : null}
              {t.property ? <span>{t.property.name}</span> : null}
            </div>
          ) : null}
          <div className="card-block">
            <h3>Timeline</h3>
            <span className="sub">Last message {relative(t.last_message_at)}</span>
            {t.resolved_at ? <span className="sub">Resolved {dateTime(t.resolved_at)}</span> : null}
            {t.awaiting_staff ? (
              <span className="warn-text">The customer is waiting for a reply.</span>
            ) : null}
          </div>
          {setStatus.error ? <div className="error">{errorText(setStatus.error)}</div> : null}
        </aside>

        <section className="ticket-chat">
          <div className="thread" ref={thread}>
            {t.messages.map((m) => (
              <div key={m.id} className={`msg ${m.author_type === 'staff' ? 'staff' : ''}`}>
                {m.body}
                {m.attachments.length ? <small>{m.attachments.length} attachment(s)</small> : null}
                <small>
                  {m.author_type === 'staff' ? 'Propittu' : t.customer_name || 'Customer'} ·{' '}
                  {dateTime(m.created_at)}
                </small>
              </div>
            ))}
          </div>
          <div className="composer">
            <textarea
              placeholder="Write a reply…  (Ctrl/⌘ + Enter to send)"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && reply.trim()) send.mutate();
              }}
            />
            <div className="row between">
              {send.error ? <span className="error">{errorText(send.error)}</span> : <span />}
              <button
                className="btn primary"
                disabled={!reply.trim() || send.isPending}
                onClick={() => send.mutate()}
              >
                {send.isPending ? 'Sending…' : 'Send reply'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
