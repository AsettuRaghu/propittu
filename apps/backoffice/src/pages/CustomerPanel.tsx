import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  LIMIT_LABELS,
  ORDER_DISPLAY_LABELS,
  PLAN_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
  formatIndianMobile,
  requestStatusLabel,
  type AuditEntry,
  type BackofficeAccountDetail,
  type PropertySlot,
  type PublicPlan,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { date, dateTime, rupees } from '../lib/format';
import { Feedback, useAction } from '../ui/action';
import { ORDER_TONES, REQUEST_TONES } from '../ui/status';
import { useEscape } from '../ui/useEscape';
import { PropertyView } from './PropertyView';

const SOURCE_LABELS = { trial: 'Free Trial', payment: 'Paid', staff: 'Given by the team' };

/** One customer beside the list: plan, access, properties, requests, payments, history. */
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
  };
  const a = data?.account;

  return (
    <aside className="panel" aria-label="Customer">
      <div className="panel-head">
        <div>
          <h2>{a ? a.full_name || 'Customer' : 'Customer'}</h2>
          {a?.phone ? <span className="mono">{formatIndianMobile(a.phone)}</span> : null}
        </div>
        <div className="row">
          {a ? (
            <span className={`badge ${a.status === 'active' ? 'good' : 'bad'}`}>{a.status}</span>
          ) : null}
          <button className="link" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      {isPending ? <div className="empty">Loading…</div> : null}
      {error ? <div className="empty error">{errorText(error)}</div> : null}
      {data && propertyId ? (
        <PropertyView id={propertyId} onBack={() => openProperty(null)} />
      ) : null}
      {data && !propertyId ? (
        <Body d={data} openProperty={openProperty} onChanged={refresh} />
      ) : null}
    </aside>
  );
}

function Body({
  d,
  openProperty,
  onChanged,
}: {
  d: BackofficeAccountDetail;
  openProperty: (id: string) => void;
  onChanged: () => void;
}) {
  return (
    <div className="panel-body">
      <dl className="kv">
        <dt>Customer since</dt>
        <dd>{date(d.account.created_at)}</dd>
        <dt>Access</dt>
        <dd className={d.blocked_reason ? 'error' : ''}>{d.blocked_reason ?? 'Full access'}</dd>
      </dl>
      <Plan d={d} onChanged={onChanged} />
      <div className="block">
        <h3>Properties ({d.properties.length})</h3>
        {d.properties.length === 0 ? <span className="sub">None yet.</span> : null}
        <ul className="list">
          {d.properties.map((p) => (
            <li key={p.id}>
              <button className="link" onClick={() => openProperty(p.id)}>
                {p.name}
              </button>
              <span className="sub">
                {PROPERTY_TYPE_LABELS[p.property_type]}
                {p.city ? ` · ${p.city}` : ''} · {p.document_count} documents · {p.photo_count}{' '}
                photos · {p.video_count} videos
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="block">
        <h3>Requests ({d.requests.length})</h3>
        {d.requests.length === 0 ? <span className="sub">None yet.</span> : null}
        <ul className="list">
          {d.requests.map((r) => (
            <li key={r.id}>
              <Link to={`/requests?status=all&id=${r.id}`}>{r.service.name}</Link>{' '}
              <span className={`badge ${REQUEST_TONES[r.status]}`}>
                {requestStatusLabel(r.status, r.fulfilment)}
              </span>
              <span className="sub">
                {r.property?.name ?? 'Property deleted'} · {date(r.created_at)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="block">
        <h3>Payments ({d.orders.length})</h3>
        {d.orders.length === 0 ? <span className="sub">None yet.</span> : null}
        <ul className="list">
          {d.orders.map((o) => (
            <li key={o.id}>
              {o.description} · {rupees(o.amount_paise)}{' '}
              <span className={`badge ${ORDER_TONES[o.display_status]}`}>
                {ORDER_DISPLAY_LABELS[o.display_status]}
              </span>
              <span className="sub mono">
                {o.reference} · {date(o.paid_at ?? o.created_at)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <Slots accountId={d.account.id} onChanged={onChanged} />
      <AccountStatus d={d} onChanged={onChanged} />
      <Activity accountId={d.account.id} />
    </div>
  );
}

function Plan({ d, onChanged }: { d: BackofficeAccountDetail; onChanged: () => void }) {
  const { plan } = d;
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api<PublicPlan[]>('/plans') });
  const [code, setCode] = useState('');
  const [days, setDays] = useState('');
  const [extra, setExtra] = useState('7');
  const a = useAction(onChanged);
  const base = `/backoffice/accounts/${d.account.id}/plan`;
  const limits = plan.plan?.benefits.limits ?? {};
  const chosen = plans.data?.find((p) => p.code === code);

  const give = () => {
    if (!chosen) return;
    const n = days ? Number(days) : undefined;
    if (
      !window.confirm(
        `Give ${chosen.name}${n ? ` for ${n} days` : ''}? It starts now and replaces the current plan (a paid period is ended, not refunded).`,
      )
    )
      return;
    a.mutate({ path: base, body: { plan_code: code, days: n }, ok: `${chosen.name} given` });
  };

  return (
    <div className="block">
      <h3>Plan</h3>
      <dl className="kv">
        <dt>Plan</dt>
        <dd>
          {plan.plan?.name ?? 'No active plan'} ·{' '}
          <span className="badge">{PLAN_STATUS_LABELS[plan.status]}</span>
        </dd>
        {plan.current ? (
          <>
            <dt>Source</dt>
            <dd>{SOURCE_LABELS[plan.current.source]}</dd>
            <dt>Ends</dt>
            <dd>
              {date(plan.current.ends_at)} ({plan.current.days_left} days left)
              {plan.current.cancel_at_period_end ? ' · will not renew' : ''}
            </dd>
          </>
        ) : null}
        <dt>Properties</dt>
        <dd>
          {plan.usage.properties}
          {limits.max_properties !== undefined ? ` of ${limits.max_properties}` : ''} ·{' '}
          {plan.usage.property_slots_used} slots used this term
        </dd>
        <dt>Storage</dt>
        <dd>{Math.ceil(plan.usage.storage_bytes / (1024 * 1024))} MB</dd>
        <dt>Files</dt>
        <dd>
          {plan.usage.documents} documents · {plan.usage.photos} photos · {plan.usage.videos} videos
        </dd>
        {plan.over_limit.length > 0 ? (
          <>
            <dt>Over limit</dt>
            <dd className="error">{plan.over_limit.map((l) => LIMIT_LABELS[l]).join(', ')}</dd>
          </>
        ) : null}
        <dt>Received</dt>
        <dd>
          {plan.received.services_completed} services · {plan.received.visit_reports} visit reports
          · {plan.received.paid_orders} paid orders
        </dd>
      </dl>
      <div className="row">
        <select value={code} onChange={(e) => setCode(e.target.value)} aria-label="Plan to give">
          <option value="">Give a plan…</option>
          {plans.data?.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
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
        <button className="btn primary" disabled={!chosen || a.isPending} onClick={give}>
          Give
        </button>
      </div>
      {plan.current ? (
        <div className="row">
          <input
            className="short"
            type="number"
            min={1}
            max={365}
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            aria-label="Days to add"
          />
          <button
            className="btn"
            disabled={!Number(extra) || a.isPending}
            onClick={() =>
              a.mutate({
                path: `${base}/extend`,
                body: { days: Number(extra) },
                ok: `Added ${extra} days`,
              })
            }
          >
            Add days
          </button>
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

function Slots({ accountId, onChanged }: { accountId: string; onChanged: () => void }) {
  const { data } = useQuery({
    queryKey: ['bo-slots', accountId],
    queryFn: () => api<PropertySlot[]>(`/backoffice/accounts/${accountId}/slots`),
  });
  const a = useAction(onChanged);
  const held = data?.filter((s) => s.property_deleted_at && !s.released_at) ?? [];
  if (held.length === 0) return null;
  return (
    <div className="block">
      <h3>Deleted but still counted</h3>
      <ul className="list">
        {held.map((s) => (
          <li key={s.id}>
            {s.property_name}
            <span className="sub">Deleted {date(s.property_deleted_at)}</span>
            <button
              className="link"
              disabled={a.isPending}
              onClick={() => {
                const reason = window.prompt('Why free this slot? (shown in the audit log)');
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
    </div>
  );
}

function AccountStatus({ d, onChanged }: { d: BackofficeAccountDetail; onChanged: () => void }) {
  const a = useAction(onChanged);
  const path = `/backoffice/accounts/${d.account.id}/status`;
  if (d.account.status === 'closed') return null;
  return (
    <div className="block">
      <h3>Account</h3>
      <div className="row">
        {d.account.status === 'active' ? (
          <button
            className="btn danger"
            disabled={a.isPending}
            onClick={() => {
              if (
                window.confirm('Suspend this customer? They cannot use the app until reactivated.')
              )
                a.mutate({ path, body: { status: 'suspended' }, ok: 'Suspended' });
            }}
          >
            Suspend
          </button>
        ) : (
          <button
            className="btn"
            disabled={a.isPending}
            onClick={() => a.mutate({ path, body: { status: 'active' }, ok: 'Reactivated' })}
          >
            Reactivate
          </button>
        )}
      </div>
      <Feedback a={a} />
    </div>
  );
}

function Activity({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const { data, error, isPending } = useQuery({
    queryKey: ['bo-activity', accountId],
    queryFn: () => api<AuditEntry[]>(`/backoffice/accounts/${accountId}/activity?kind=events`),
    enabled: open,
  });
  return (
    <div className="block">
      <h3>History</h3>
      {!open ? (
        <button className="link" onClick={() => setOpen(true)}>
          Show what happened on this account
        </button>
      ) : null}
      {open && isPending ? <span className="sub">Loading…</span> : null}
      {error ? <span className="error">{errorText(error)}</span> : null}
      {data ? (
        <ul className="list">
          {data.length === 0 ? <li className="sub">Nothing recorded yet.</li> : null}
          {data.map((e) => (
            <li key={e.id}>
              <span className="mono">{e.action}</span>
              <span className="sub">
                {dateTime(e.created_at)} · {e.actor_name ?? e.actor_type}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
