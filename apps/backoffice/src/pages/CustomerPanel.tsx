import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  LIMIT_LABELS,
  ORDER_DISPLAY_LABELS,
  PLAN_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
  formatIndianMobile,
  formatStorageMb,
  requestStatusLabel,
  type AuditEntry,
  type BackofficeAccountDetail,
  type BackofficeRequest,
  type Order,
  type PropertySlot,
  type PublicPlan,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { date, dateTime, rupees } from '../lib/format';
import { Feedback, useAction } from '../ui/action';
import { DataTable, type Column } from '../ui/DataTable';
import { Section } from '../ui/Section';
import { ORDER_TONES, REQUEST_TONES } from '../ui/status';
import { useEscape } from '../ui/useEscape';
import { PropertyView } from './PropertyView';

const SOURCE_LABELS = {
  trial: 'Free Trial',
  payment: 'Paid by the customer',
  staff: 'Given by the team',
};
const DAY = 86_400_000;

/** One customer: who they are, their plan, and everything they have with us. */
export function CustomerPanel({
  id,
  propertyId,
  openProperty,
  onClose,
}: {
  id: string;
  propertyId: string | null;
  openProperty: (id: string | null) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  useEscape(onClose);
  const { data, error, isPending } = useQuery({
    queryKey: ['bo-account', id],
    queryFn: () => api<BackofficeAccountDetail>(`/backoffice/accounts/${id}`),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['bo-accounts'] });
    void qc.invalidateQueries({ queryKey: ['bo-account', id] });
    void qc.invalidateQueries({ queryKey: ['bo-slots', id] });
    void qc.invalidateQueries({ queryKey: ['bo-activity', id] });
  };

  if (isPending) return <div className="empty">Loading…</div>;
  if (error || !data) return <div className="empty error">{errorText(error)}</div>;
  const a = data.account;

  return (
    <div className="customer">
      <header className="ticket-head">
        <div>
          <h2>{a.full_name || (a.phone ? formatIndianMobile(a.phone) : 'Customer')}</h2>
          <span className="sub">
            {a.phone ? formatIndianMobile(a.phone) : 'No phone'} · customer since{' '}
            {date(a.created_at)}
          </span>
        </div>
        <div className="row">
          <span className={`badge ${data.plan.status === 'expired' ? 'bad' : 'good'}`}>
            {data.plan.plan?.name ?? 'No plan'} · {PLAN_STATUS_LABELS[data.plan.status]}
          </span>
          <span className={`badge ${a.status === 'active' ? 'good' : 'bad'}`}>{a.status}</span>
        </div>
      </header>
      {data.blocked_reason ? (
        <div className="callout warn">Blocked: {data.blocked_reason}</div>
      ) : null}

      {propertyId ? (
        <PropertyView id={propertyId} onBack={() => openProperty(null)} />
      ) : (
        <div className="sections">
          <PlanSection d={data} onChanged={refresh} />
          <Section title="Properties" count={data.properties.length}>
            <Properties d={data} open={openProperty} />
          </Section>
          <Section title="Service requests" count={data.requests.length}>
            <Requests rows={data.requests} />
          </Section>
          <Section title="Payments" count={data.orders.length}>
            <Payments rows={data.orders} />
          </Section>
          <Slots accountId={a.id} onChanged={refresh} />
          <Section title="Account" open={false}>
            <AccountStatus d={data} onChanged={refresh} />
          </Section>
          <Section title="History" open={false}>
            <Activity accountId={a.id} />
          </Section>
        </div>
      )}
    </div>
  );
}

/* ---- Plan: what they have, what they use, and the three things we can do ---- */

function PlanSection({ d, onChanged }: { d: BackofficeAccountDetail; onChanged: () => void }) {
  const { plan } = d;
  const limits = plan.plan?.benefits.limits ?? {};
  const u = plan.usage;
  const rows: { label: string; used: number; limit?: number; fmt?: (n: number) => string }[] = [
    { label: 'Properties (this term)', used: u.property_slots_used, limit: limits.max_properties },
    {
      label: LIMIT_LABELS.max_storage_mb,
      used: Math.ceil(u.storage_bytes / (1024 * 1024)),
      limit: limits.max_storage_mb,
      fmt: formatStorageMb,
    },
    {
      label: 'Documents (fullest property)',
      used: u.max_documents_on_a_property,
      limit: limits.max_documents_per_property,
    },
    {
      label: 'Photos (fullest property)',
      used: u.max_photos_on_a_property,
      limit: limits.max_photos_per_property,
    },
    {
      label: 'Videos (fullest property)',
      used: u.max_videos_on_a_property,
      limit: limits.max_videos_per_property,
    },
    ...u.included.map((i) => ({
      label: `Included: ${i.code.replace(/_/g, ' ')}`,
      used: i.used,
      limit: i.quantity,
    })),
  ];
  return (
    <Section title="Plan">
      <div className="facts">
        <div>
          <span>Plan</span>
          <b>{plan.plan?.name ?? 'No active plan'}</b>
        </div>
        <div>
          <span>Status</span>
          <b>{PLAN_STATUS_LABELS[plan.status]}</b>
        </div>
        <div>
          <span>Source</span>
          <b>{plan.current ? SOURCE_LABELS[plan.current.source] : '—'}</b>
        </div>
        <div>
          <span>Ends</span>
          <b>
            {plan.current
              ? `${date(plan.current.ends_at)} · ${plan.current.days_left} days left`
              : '—'}
          </b>
        </div>
      </div>
      <table className="usage">
        <tbody>
          {rows.map((r) => {
            const pct = r.limit ? Math.min(100, Math.round((r.used / r.limit) * 100)) : 0;
            const f = r.fmt ?? String;
            return (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td className="num">
                  {f(r.used)}
                  {r.limit !== undefined ? ` of ${f(r.limit)}` : ' · no limit'}
                </td>
                <td className="bar-col">
                  {r.limit !== undefined ? (
                    <div className={`bar ${pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : ''}`}>
                      <span style={{ width: `${pct}%` }} />
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <span className="sub">
        Received so far: {plan.received.services_completed} services · {plan.received.visit_reports}{' '}
        visit reports · {plan.received.paid_orders} paid orders
      </span>
      <PlanActions d={d} onChanged={onChanged} />
    </Section>
  );
}

function PlanActions({ d, onChanged }: { d: BackofficeAccountDetail; onChanged: () => void }) {
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api<PublicPlan[]>('/plans') });
  const a = useAction(onChanged);
  const base = `/backoffice/accounts/${d.account.id}/plan`;
  const current = d.plan.current;
  const [extra, setExtra] = useState(7);
  const [code, setCode] = useState('');
  const [days, setDays] = useState('');
  const chosen = plans.data?.find((p) => p.code === code);
  const newEnd = current ? new Date(Date.parse(current.ends_at) + extra * DAY).toISOString() : null;

  return (
    <div className="actions-grid">
      {current ? (
        <div className="action-card">
          <h4>Add time to the current plan</h4>
          <p className="sub">
            Keeps the same plan and pushes its end date later. Nothing is charged.
          </p>
          <div className="row">
            {[7, 30, 90].map((n) => (
              <button
                key={n}
                className={`btn small ${extra === n ? 'primary' : ''}`}
                onClick={() => setExtra(n)}
              >
                +{n} days
              </button>
            ))}
            <input
              className="short"
              type="number"
              min={1}
              max={365}
              value={extra}
              onChange={(e) => setExtra(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
              aria-label="Days to add"
            />
          </div>
          <p>
            Ends <b>{date(current.ends_at)}</b> → <b>{date(newEnd)}</b>
          </p>
          <button
            className="btn primary"
            disabled={a.isPending}
            onClick={() => {
              if (window.confirm(`Add ${extra} days? The plan will end on ${date(newEnd)}.`))
                a.mutate({
                  path: `${base}/extend`,
                  body: { days: extra },
                  ok: `Added ${extra} days`,
                });
            }}
          >
            Add {extra} days
          </button>
        </div>
      ) : null}

      <div className="action-card">
        <h4>Give a different plan</h4>
        <p className="sub">
          Starts today and replaces the current plan. A paid period is ended, not refunded. Leave
          days empty for the plan's normal term.
        </p>
        <div className="row">
          <select value={code} onChange={(e) => setCode(e.target.value)} aria-label="Plan to give">
            <option value="">Choose a plan…</option>
            {plans.data?.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name} ({p.term_days} days)
              </option>
            ))}
          </select>
          <input
            className="short"
            type="number"
            min={1}
            max={3660}
            placeholder="Days"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            aria-label="Days (optional)"
          />
        </div>
        <button
          className="btn"
          disabled={!chosen || a.isPending}
          onClick={() => {
            if (!chosen) return;
            const n = days ? Number(days) : undefined;
            if (
              window.confirm(
                `Give ${chosen.name} for ${n ?? chosen.term_days} days, starting today?`,
              )
            )
              a.mutate({
                path: base,
                body: { plan_code: code, days: n },
                ok: `${chosen.name} given`,
              });
          }}
        >
          Give {chosen?.name ?? 'plan'}
        </button>
      </div>

      {current ? (
        <div className="action-card">
          <h4>End the plan now</h4>
          <p className="sub">
            The customer moves to limited access straight away. Their data is kept.
          </p>
          <button
            className="btn danger"
            disabled={a.isPending}
            onClick={() => {
              if (window.confirm('End the current plan now? The customer loses its benefits.'))
                a.mutate({ path: `${base}/end`, ok: 'Plan ended' });
            }}
          >
            End plan
          </button>
        </div>
      ) : null}
      <Feedback a={a} />
    </div>
  );
}

/* ---- What they have with us ---- */

type Prop = BackofficeAccountDetail['properties'][number];
function Properties({ d, open }: { d: BackofficeAccountDetail; open: (id: string) => void }) {
  const cols: Column<Prop>[] = [
    { key: 'name', header: 'Property', sort: (p) => p.name, render: (p) => p.name },
    {
      key: 'type',
      header: 'Type',
      sort: (p) => p.property_type,
      render: (p) => PROPERTY_TYPE_LABELS[p.property_type],
    },
    { key: 'city', header: 'City', sort: (p) => p.city, render: (p) => p.city ?? '—' },
    {
      key: 'docs',
      header: 'Documents',
      align: 'right',
      sort: (p) => p.document_count,
      render: (p) => p.document_count,
    },
    {
      key: 'photos',
      header: 'Photos',
      align: 'right',
      sort: (p) => p.photo_count,
      render: (p) => p.photo_count,
    },
    {
      key: 'videos',
      header: 'Videos',
      align: 'right',
      sort: (p) => p.video_count,
      render: (p) => p.video_count,
    },
  ];
  return (
    <DataTable
      rows={d.properties}
      columns={cols}
      rowKey={(p) => p.id}
      onRowClick={(p) => open(p.id)}
      defaultSort={{ key: 'name', dir: 'asc' }}
      empty="No properties yet."
    />
  );
}

function Requests({ rows }: { rows: BackofficeRequest[] }) {
  const navigate = useNavigate();
  const cols: Column<BackofficeRequest>[] = [
    {
      key: 'service',
      header: 'Service',
      sort: (r) => r.service.name,
      render: (r) => (
        <>
          {r.service.name}
          <span className="sub mono">{r.reference}</span>
        </>
      ),
    },
    {
      key: 'property',
      header: 'Property',
      sort: (r) => r.property?.name ?? '',
      render: (r) => r.property?.name ?? 'Property deleted',
    },
    {
      key: 'status',
      header: 'Status',
      sort: (r) => r.status,
      render: (r) => (
        <span className={`badge ${REQUEST_TONES[r.status]}`}>
          {requestStatusLabel(r.status, r.fulfilment)}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Requested',
      sort: (r) => r.created_at,
      render: (r) => date(r.created_at),
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={cols}
      rowKey={(r) => r.id}
      onRowClick={(r) => void navigate(`/requests?status=all&id=${r.id}`)}
      defaultSort={{ key: 'date', dir: 'desc' }}
      empty="No service requests yet."
    />
  );
}

function Payments({ rows }: { rows: Order[] }) {
  const navigate = useNavigate();
  const cols: Column<Order>[] = [
    {
      key: 'for',
      header: 'For',
      sort: (o) => o.description,
      render: (o) => (
        <>
          {o.description}
          <span className="sub mono">{o.reference}</span>
        </>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sort: (o) => o.amount_paise,
      render: (o) => rupees(o.amount_paise),
    },
    {
      key: 'status',
      header: 'Status',
      sort: (o) => o.display_status,
      render: (o) => (
        <span className={`badge ${ORDER_TONES[o.display_status]}`}>
          {ORDER_DISPLAY_LABELS[o.display_status]}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      sort: (o) => o.paid_at ?? o.created_at,
      render: (o) => date(o.paid_at ?? o.created_at),
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={cols}
      rowKey={(o) => o.id}
      onRowClick={(o) => void navigate(`/payments?view=all&period=all&id=${o.id}`)}
      defaultSort={{ key: 'date', dir: 'desc' }}
      empty="No payments yet."
    />
  );
}

function Slots({ accountId, onChanged }: { accountId: string; onChanged: () => void }) {
  const { data } = useQuery({
    queryKey: ['bo-slots', accountId],
    queryFn: () => api<PropertySlot[]>(`/backoffice/accounts/${accountId}/slots`),
  });
  const a = useAction(onChanged);
  const held = data?.filter((s) => s.property_deleted_at && !s.released_at) ?? [];
  if (held.length === 0) return null;
  return (
    <Section
      title="Deleted but still counted"
      count={held.length}
      aside={<span className="sub">Uses a property slot until the term ends</span>}
    >
      <ul className="list">
        {held.map((s) => (
          <li key={s.id}>
            {s.property_name}
            <span className="sub">Deleted {date(s.property_deleted_at)}</span>
            <button
              className="btn small"
              disabled={a.isPending}
              onClick={() => {
                const reason = window.prompt('Why free this slot? (kept in the history)');
                if (reason && reason.trim().length >= 3)
                  a.mutate({
                    path: `/backoffice/slots/${s.id}/release`,
                    body: { reason: reason.trim() },
                    ok: 'Slot freed',
                  });
              }}
            >
              Free this slot
            </button>
          </li>
        ))}
      </ul>
      <Feedback a={a} />
    </Section>
  );
}

const SUSPEND_PHRASE = 'SUSPEND THE ACCOUNT';

function AccountStatus({ d, onChanged }: { d: BackofficeAccountDetail; onChanged: () => void }) {
  const a = useAction(onChanged);
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState('');
  const path = `/backoffice/accounts/${d.account.id}/status`;
  if (d.account.status === 'closed') return <span className="sub">This account is closed.</span>;
  if (d.account.status !== 'active')
    return (
      <div className="stack">
        <span className="sub">This customer is suspended and cannot use the app.</span>
        <div className="row">
          <button
            className="btn"
            disabled={a.isPending}
            onClick={() => a.mutate({ path, body: { status: 'active' }, ok: 'Reactivated' })}
          >
            Reactivate
          </button>
        </div>
        <Feedback a={a} />
      </div>
    );
  return (
    <div className="stack">
      <span className="sub">
        Suspending stops the customer using the app until you reactivate them. Nothing is deleted.
      </span>
      {!asking ? (
        <div className="row">
          <button className="btn danger" onClick={() => setAsking(true)}>
            Suspend…
          </button>
        </div>
      ) : (
        <div className="danger-zone">
          <b>Are you sure? This locks the customer out of the app.</b>
          <label className="field">
            Type <span className="mono strong">{SUSPEND_PHRASE}</span> to confirm
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={SUSPEND_PHRASE}
              autoFocus
              onPaste={(e) => e.preventDefault()}
            />
          </label>
          <div className="row">
            <button
              className="btn danger-solid"
              disabled={typed.trim() !== SUSPEND_PHRASE || a.isPending}
              onClick={() =>
                a.mutate(
                  { path, body: { status: 'suspended' }, ok: 'Suspended' },
                  {
                    onSuccess: () => {
                      setAsking(false);
                      setTyped('');
                    },
                  },
                )
              }
            >
              Suspend the account
            </button>
            <button
              className="btn"
              onClick={() => {
                setAsking(false);
                setTyped('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <Feedback a={a} />
    </div>
  );
}

function Activity({ accountId }: { accountId: string }) {
  const { data, error, isPending } = useQuery({
    queryKey: ['bo-activity', accountId],
    queryFn: () => api<AuditEntry[]>(`/backoffice/accounts/${accountId}/activity?kind=events`),
  });
  const cols: Column<AuditEntry>[] = [
    {
      key: 'when',
      header: 'When',
      sort: (e) => e.created_at,
      render: (e) => dateTime(e.created_at),
    },
    {
      key: 'what',
      header: 'What happened',
      sort: (e) => e.action,
      render: (e) => <span className="mono">{e.action}</span>,
    },
    {
      key: 'who',
      header: 'By',
      sort: (e) => e.actor_name ?? e.actor_type,
      render: (e) => e.actor_name ?? e.actor_type,
    },
  ];
  return (
    <DataTable
      rows={data}
      columns={cols}
      rowKey={(e) => e.id}
      searchText={(e) => `${e.action} ${e.actor_name ?? ''}`}
      searchPlaceholder="Search history"
      defaultSort={{ key: 'when', dir: 'desc' }}
      loading={isPending}
      error={error ? errorText(error) : null}
      empty="Nothing recorded yet."
      pageSize={20}
    />
  );
}
