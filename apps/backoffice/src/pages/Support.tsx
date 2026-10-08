import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  formatIndianMobile,
  type BackofficeTicket,
  type BackofficeTicketDetail,
  type TicketStatus,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { dateTime, relative } from '../lib/format';
import { useTicketList } from '../lib/lists';
import { useLive } from '../lib/live';
import { useUrlState } from '../lib/params';
import { DataTable, type Column } from '../ui/DataTable';
import { Age } from '../ui/Age';
import { TICKET_TONES } from '../ui/status';
import { Tiles } from '../ui/Tiles';
import { useEscape } from '../ui/useEscape';

const onUs = (t: BackofficeTicket) => t.status === 'open' || t.status === 'in_progress';

/** The support inbox: live, newest activity first; pick a ticket to reply beside the list. */
export function Support() {
  const [params, set] = useUrlState();
  const view = params.get('status') ?? 'on_us';
  const category = params.get('category') ?? '';
  const selected = params.get('id');
  const { data, error, isPending } = useTicketList();
  const { unseen } = useLive();
  const [now] = useState(() => Date.now());

  const views = {
    on_us: onUs,
    new: (t: BackofficeTicket) => unseen.has(t.id),
    waiting_on_customer: (t: BackofficeTicket) => t.status === 'waiting_on_customer',
    resolved: (t: BackofficeTicket) => t.status === 'resolved' || t.status === 'closed',
    all: () => true,
  };
  const count = (f: (t: BackofficeTicket) => boolean) => data?.filter(f).length ?? '–';
  const rows = data?.filter(
    (t) => (views[view as keyof typeof views] ?? onUs)(t) && (!category || t.category === category),
  );

  const columns: Column<BackofficeTicket>[] = [
    {
      key: 'subject',
      header: 'Ticket',
      sort: (t) => t.subject,
      render: (t) => (
        <>
          {t.subject}
          {unseen.has(t.id) ? <span className="badge warn new">New reply</span> : null}
          <span className="sub mono">{t.reference}</span>
        </>
      ),
      csv: (t) => `${t.subject} ${t.reference}`,
    },
    {
      key: 'customer',
      header: 'Customer',
      sort: (t) => t.customer_name ?? '',
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
      key: 'category',
      header: 'Topic',
      sort: (t) => TICKET_CATEGORY_LABELS[t.category],
      render: (t) => (
        <>
          {TICKET_CATEGORY_LABELS[t.category]}
          <span className="sub">{t.service_request?.service?.name ?? t.property?.name ?? ''}</span>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sort: (t) => t.status,
      render: (t) => (
        <span className={`badge ${TICKET_TONES[t.status]}`}>{TICKET_STATUS_LABELS[t.status]}</span>
      ),
      csv: (t) => TICKET_STATUS_LABELS[t.status],
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
        onUs(t) ? <Age since={t.last_message_at} now={now} /> : relative(t.last_message_at),
      csv: (t) => t.last_message_at,
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Support</h1>
          <p>Live: new tickets and replies appear as they arrive. Waiting on us by default.</p>
        </div>
      </div>
      <Tiles
        value={view}
        onChange={(v) => set({ status: v, id: null })}
        tiles={[
          { value: 'on_us', label: 'Waiting on us', count: count(onUs), tone: 'warn' },
          {
            value: 'new',
            label: 'New replies',
            count: unseen.size,
            tone: unseen.size ? 'bad' : '',
          },
          {
            value: 'waiting_on_customer',
            label: 'Waiting on customer',
            count: count(views.waiting_on_customer),
          },
          { value: 'resolved', label: 'Resolved', count: count(views.resolved), tone: 'good' },
          { value: 'all', label: 'Everything', count: data?.length ?? '–' },
        ]}
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(t) => t.id}
        selected={selected}
        onRowClick={(t) => set({ id: t.id })}
        onClose={() => set({ id: null, full: null })}
        detail={
          selected ? (
            <TicketPanel id={selected} onClose={() => set({ id: null, full: null })} />
          ) : null
        }
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
      </div>
      {isPending ? <div className="empty">Loading…</div> : null}
      {error ? <div className="empty error">{errorText(error)}</div> : null}
      {t ? (
        <div className="panel-body chat">
          <div className="chat-side">
            <dl className="kv">
              <dt>Customer</dt>
              <dd>
                <Link to={`/customers?id=${t.account_id}`}>
                  {t.customer_name || 'Open customer'}
                </Link>
                <br />
                <span className="mono">
                  {t.customer_phone ? formatIndianMobile(t.customer_phone) : ''}
                </span>
              </dd>
              <dt>Opened</dt>
              <dd>{dateTime(t.created_at)}</dd>
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
                    <Link to={`/requests?status=all&id=${t.service_request.id}`}>
                      {t.service_request.service?.name ?? 'Service request'}
                    </Link>{' '}
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
          </div>
          <div className="chat-main">
            <div className="thread">
              {t.messages.map((m) => (
                <div key={m.id} className={`msg ${m.author_type === 'staff' ? 'staff' : ''}`}>
                  {m.body}
                  {m.attachments.length ? (
                    <small>{m.attachments.length} attachment(s)</small>
                  ) : null}
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
        </div>
      ) : null}
    </aside>
  );
}
