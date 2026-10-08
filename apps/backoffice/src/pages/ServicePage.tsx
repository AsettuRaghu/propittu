import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  CANCEL_POLICIES,
  CANCEL_POLICY_LABELS,
  PAYMENT_TIMINGS,
  PAYMENT_TIMING_LABELS,
  SERVICE_FULFILMENTS,
  SERVICE_FULFILMENT_LABELS,
  requestStatusLabel,
  type CoverageSummaryRow,
  type CoverageZone,
  type ServiceCoverage,
  type StaffService,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { date, rupees } from '../lib/format';
import { useRequestList } from '../lib/lists';
import { REQUEST_TONES } from '../ui/status';
import { districtLabel, useCoverageSummary, useZones } from './Coverage';
import { useCategories, useServices } from './Services';

type Draft = {
  code: string;
  name: string;
  description: string;
  category: StaffService['category'];
  rupees: string;
  is_active: boolean;
  is_extra_available: boolean;
  fulfilment: StaffService['fulfilment'];
  reach: StaffService['reach'];
  includes: string[];
  turnaround: string;
  payment_timing: StaffService['payment_timing'];
  cancel_policy: StaffService['cancel_policy'];
  expected_days: string;
  sort_order: string;
  pricing: 'fixed' | 'quote' | 'plan';
};

const toDraft = (s: StaffService | null): Draft => ({
  code: s?.code ?? '',
  name: s?.name ?? '',
  description: s?.description ?? '',
  category: s?.category ?? 'property_care',
  rupees:
    s?.price_paise === null || s?.price_paise === undefined ? '' : String(s.price_paise / 100),
  is_active: s?.is_active ?? false,
  is_extra_available: s?.is_extra_available ?? true,
  fulfilment: s?.fulfilment ?? 'visit',
  reach: s?.reach ?? 'area',
  includes: s?.includes ?? [],
  turnaround: s?.turnaround ?? '',
  payment_timing: s?.payment_timing ?? 'on_confirmation',
  cancel_policy: s?.cancel_policy ?? 'until_confirmed',
  expected_days: s?.expected_days ? String(s.expected_days) : '',
  sort_order: String(s?.sort_order ?? 100),
  pricing: !s
    ? 'fixed'
    : !s.is_extra_available
      ? 'plan'
      : s.price_paise === null
        ? 'quote'
        : 'fixed',
});

/** Every editable field is sent, so nothing falls back to a default by accident. */
const toBody = (d: Draft) => ({
  name: d.name.trim(),
  description: d.description.trim(),
  category: d.category,
  price_paise:
    d.pricing === 'fixed' && d.rupees.trim() !== '' ? Math.round(Number(d.rupees) * 100) : null,
  is_active: d.is_active,
  is_extra_available: d.pricing !== 'plan',
  fulfilment: d.fulfilment,
  includes: d.includes.map((l) => l.trim()).filter(Boolean),
  turnaround: d.turnaround.trim() || null,
  payment_timing: d.payment_timing,
  cancel_policy: d.cancel_policy,
  expected_days: d.expected_days ? Number(d.expected_days) : null,
  sort_order: Number(d.sort_order) || 0,
});

/** /services/:id — the place to configure one service (or add one at /services/new). */
export function ServicePage() {
  const { id = 'new' } = useParams();
  const { data, error, isPending } = useServices();
  const service = id === 'new' ? null : data?.find((s) => s.id === id);
  if (id !== 'new' && isPending)
    return (
      <div className="page">
        <div className="empty">Loading…</div>
      </div>
    );
  if (error)
    return (
      <div className="page">
        <div className="error">{errorText(error)}</div>
      </div>
    );
  if (id !== 'new' && !service)
    return (
      <div className="page">
        <Link to="/services">← Services</Link>
        <div className="empty">This service was not found.</div>
      </div>
    );
  const nextOrder = Math.max(0, ...(data ?? []).map((x) => x.sort_order)) + 10;
  return <Editor key={service?.id ?? 'new'} service={service ?? null} nextOrder={nextOrder} />;
}

function Editor({ service, nextOrder }: { service: StaffService | null; nextOrder: number }) {
  const categories = useCategories();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(() => ({
    ...toDraft(service),
    sort_order: String(service?.sort_order ?? nextOrder),
  }));
  const [d, setD] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const put = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setMsg(null);
    setD((x) => ({ ...x, [k]: v }));
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (service) {
        await api(`/backoffice/services/${service.id}`, { method: 'PATCH', body: toBody(d) });
        setSaved(d);
        setMsg({ ok: true, text: 'Saved. Customers see the change straight away.' });
      } else {
        const row = await api<StaffService>('/backoffice/services', {
          method: 'POST',
          body: { code: d.code.trim(), reach: 'area', ...toBody(d) },
        });
        void navigate(`/services/${row.id}`, { replace: true });
      }
      void qc.invalidateQueries({ queryKey: ['bo-services'] });
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const select = <K extends keyof Draft>(
    k: K,
    label: string,
    values: readonly string[],
    labels: Record<string, string>,
    help?: string,
  ) => (
    <label className="field">
      {label}
      <select value={d[k] as string} onChange={(e) => put(k, e.target.value as Draft[K])}>
        {values.map((v) => (
          <option key={v} value={v}>
            {labels[v]}
          </option>
        ))}
      </select>
      {help ? <small>{help}</small> : null}
    </label>
  );

  return (
    <div className="page">
      <Link to="/services">← Services</Link>
      <div className="page-head">
        <div>
          <h1>{service ? d.name || service.name : 'New service'}</h1>
          <p>
            {service ? (
              <span className="mono">{service.code}</span>
            ) : (
              'Fill in the details, then add it. It stays hidden until you make it live.'
            )}
          </p>
        </div>
        <div className="row">
          <span className={`badge ${d.is_active ? 'good' : ''}`}>
            {d.is_active ? 'Live in the app' : 'Hidden'}
          </span>
        </div>
      </div>

      <div className="config">
        <div className="config-main">
          <section className="section">
            <div className="section-head">
              <h2>What it is</h2>
            </div>
            <div className="section-body form-grid">
              {!service ? (
                <label className="field wide">
                  Code (permanent; lowercase, e.g. site_visit)
                  <input value={d.code} onChange={(e) => put('code', e.target.value)} />
                </label>
              ) : null}
              <label className="field wide">
                Name
                <input value={d.name} onChange={(e) => put('name', e.target.value)} />
              </label>
              <label className="field wide">
                Description (what the customer reads)
                <textarea
                  value={d.description}
                  onChange={(e) => put('description', e.target.value)}
                />
              </label>
              <label className="field">
                Category
                <select value={d.category} onChange={(e) => put('category', e.target.value)}>
                  {(categories.data ?? []).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <small>
                  Manage categories under{' '}
                  <Link to="/services?tab=categories">Services → Categories</Link>. The order in the
                  app is set with “Change order” on the Services list.
                </small>
              </label>
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2>Price and payment</h2>
            </div>
            <div className="section-body form-grid">
              <div className="field wide pricing">
                Pricing
                <label className="check">
                  <input
                    type="radio"
                    checked={d.pricing === 'fixed'}
                    onChange={() => put('pricing', 'fixed')}
                  />
                  <span>
                    Fixed price
                    <small>
                      Customers see the price and pay it when they book (or when confirmed).
                    </small>
                  </span>
                </label>
                {d.pricing === 'fixed' ? (
                  <input
                    className="short"
                    type="number"
                    min={0}
                    placeholder="₹"
                    value={d.rupees}
                    onChange={(e) => put('rupees', e.target.value)}
                    aria-label="Price in rupees"
                  />
                ) : null}
                <label className="check">
                  <input
                    type="radio"
                    checked={d.pricing === 'quote'}
                    onChange={() => put('pricing', 'quote')}
                  />
                  <span>
                    On quote
                    <small>
                      Customers request it without a price; the team sets a price on each request
                      (Service requests → the request → Price), and the customer pays in the app.
                    </small>
                  </span>
                </label>
                <label className="check">
                  <input
                    type="radio"
                    checked={d.pricing === 'plan'}
                    onChange={() => put('pricing', 'plan')}
                  />
                  <span>
                    Plan only
                    <small>
                      Not sold on its own: only customers whose plan includes it can request it.
                    </small>
                  </span>
                </label>
              </div>
              {select(
                'payment_timing',
                'When the customer pays',
                PAYMENT_TIMINGS,
                PAYMENT_TIMING_LABELS,
              )}
              {select(
                'cancel_policy',
                'Customer can cancel',
                CANCEL_POLICIES,
                CANCEL_POLICY_LABELS,
              )}
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2>How it is delivered</h2>
            </div>
            <div className="section-body form-grid">
              {select('fulfilment', 'Delivered as', SERVICE_FULFILMENTS, SERVICE_FULFILMENT_LABELS)}
              <label className="field">
                Usual working days
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={d.expected_days}
                  onChange={(e) => put('expected_days', e.target.value)}
                />
                <small>Sets “Expected by” and the overdue warning. Empty: we confirm a date.</small>
              </label>
              <label className="field">
                How long it takes (shown to customers)
                <input
                  value={d.turnaround}
                  placeholder="e.g. Within 3–5 days of confirming"
                  onChange={(e) => put('turnaround', e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2>What it includes</h2>
              <span className="sub">Up to 10 short lines, shown before booking.</span>
            </div>
            <div className="section-body stack">
              {d.includes.map((line, i) => (
                <div key={i} className="row">
                  <input
                    className="grow"
                    value={line}
                    onChange={(e) =>
                      put(
                        'includes',
                        d.includes.map((x, j) => (j === i ? e.target.value : x)),
                      )
                    }
                    aria-label={`Includes line ${i + 1}`}
                  />
                  <button
                    className="btn small"
                    disabled={i === 0}
                    onClick={() => {
                      const next = [...d.includes];
                      [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                      put('includes', next);
                    }}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    className="btn small danger"
                    onClick={() =>
                      put(
                        'includes',
                        d.includes.filter((_, j) => j !== i),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              {d.includes.length < 10 ? (
                <div>
                  <button
                    className="btn small"
                    onClick={() => put('includes', [...d.includes, ''])}
                  >
                    Add a line
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="config-side">
          <section className="section">
            <div className="section-head">
              <h2>In the app</h2>
            </div>
            <div className="section-body stack">
              <label className="check">
                <input
                  type="checkbox"
                  checked={d.is_active}
                  onChange={(e) => put('is_active', e.target.checked)}
                />
                Live — customers can see and request it
              </label>
              <button
                className="btn primary"
                disabled={busy || (!dirty && !!service)}
                onClick={() => void save()}
              >
                {busy ? 'Saving…' : service ? 'Save changes' : 'Add service'}
              </button>
              {dirty && service ? (
                <span className="warn-text">You have unsaved changes.</span>
              ) : null}
              {msg ? <span className={msg.ok ? 'note-ok' : 'error'}>{msg.text}</span> : null}
            </div>
          </section>
          {service ? (
            <Where serviceId={service.id} />
          ) : (
            <span className="sub">After you add the service, choose where it's offered here.</span>
          )}
          <Preview d={d} />
          {service ? <Activity serviceId={service.id} /> : null}
        </aside>
      </div>
    </div>
  );
}

/** Where the service is offered: zones, whole states or districts, single PINs, or everywhere. */
function Where({ serviceId }: { serviceId: string }) {
  const qc = useQueryClient();
  const zones = useZones();
  const summary = useCoverageSummary();
  const { data } = useQuery({
    queryKey: ['bo-service-coverage', serviceId],
    queryFn: () => api<ServiceCoverage>(`/backoffice/services/${serviceId}/coverage`),
  });
  return data ? (
    <WhereEditor
      key={JSON.stringify(data.rules)}
      saved={data}
      zones={zones.data ?? []}
      summary={summary.data ?? []}
      onSave={async (rules) => {
        await api(`/backoffice/services/${serviceId}/coverage`, { method: 'PUT', body: { rules } });
        await qc.invalidateQueries({ queryKey: ['bo-service-coverage', serviceId] });
        void qc.invalidateQueries({ queryKey: ['bo-services'] });
        void qc.invalidateQueries({ queryKey: ['bo-zones'] });
      }}
    />
  ) : (
    <section className="section">
      <div className="section-body sub">Loading where it's offered…</div>
    </section>
  );
}

type Rule = ServiceCoverage['rules'][number];

function WhereEditor({
  saved,
  zones,
  summary,
  onSave,
}: {
  saved: ServiceCoverage;
  zones: CoverageZone[];
  summary: CoverageSummaryRow[];
  onSave: (rules: Rule[]) => Promise<void>;
}) {
  const [rules, setRules] = useState<Rule[]>(saved.rules);
  const [st, setSt] = useState('');
  const [dSt, setDSt] = useState('');
  const [dist, setDist] = useState('');
  const [pins, setPins] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(rules) !== JSON.stringify(saved.rules);
  const has = (kind: Rule['kind'], value = '') =>
    rules.some((r) => r.kind === kind && r.value === value);
  const toggle = (kind: Rule['kind'], value = '') =>
    setRules((rs) =>
      has(kind, value)
        ? rs.filter((r) => !(r.kind === kind && r.value === value))
        : [...rs, { kind, value }],
    );
  const addMany = (kind: Rule['kind'], values: string[]) =>
    setRules((rs) => [
      ...rs,
      ...values
        .filter((v) => !rs.some((r) => r.kind === kind && r.value === v))
        .map((value) => ({ kind, value })),
    ]);
  const everywhere = has('everywhere');
  const states = [...new Set(summary.map((r) => r.state))].sort();
  const districts = summary.filter((r) => r.state === dSt).map((r) => r.district);
  const list = (kind: Rule['kind'], fmt: (v: string) => string = (v) => v) =>
    rules
      .filter((r) => r.kind === kind)
      .map((r) => (
        <span key={r.value} className="pin">
          {fmt(r.value)}
          <button aria-label={`Remove ${r.value}`} onClick={() => toggle(kind, r.value)}>
            ×
          </button>
        </span>
      ));
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await onSave(rules);
      setMsg({ ok: true, text: 'Saved. The app uses it straight away.' });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={`section ${dirty ? 'publish dirty' : ''}`}>
      <div className="section-head">
        <h2>Where it's offered</h2>
        <Link to="/coverage">Coverage</Link>
      </div>
      <div className="section-body stack">
        <span className="sub">
          {saved.everywhere
            ? 'Now: everywhere in India.'
            : `Now: ${saved.pins.toLocaleString('en-IN')} PIN codes · ${saved.properties} customer properties.`}
        </span>
        <label className="check">
          <input type="checkbox" checked={everywhere} onChange={() => toggle('everywhere')} />
          Everywhere in India (no location needed)
        </label>
        {!everywhere ? (
          <>
            <div className="where-block">
              <b>Zones</b>
              {zones.length === 0 ? (
                <span className="sub">No zones yet — make them under Coverage → Zones.</span>
              ) : null}
              {zones.map((z) => (
                <label key={z.id} className="check">
                  <input
                    type="checkbox"
                    checked={has('zone', z.id)}
                    onChange={() => toggle('zone', z.id)}
                  />
                  {z.name}
                  <span className="sub inline">
                    {' '}
                    · {z.pin_count} PINs{z.is_active ? '' : ' · paused'}
                  </span>
                </label>
              ))}
            </div>
            <div className="where-block">
              <b>Whole states</b>
              <div className="pins">{list('state')}</div>
              <div className="row">
                <select value={st} onChange={(e) => setSt(e.target.value)} aria-label="State">
                  <option value="">Choose a state…</option>
                  {states.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <button
                  className="btn small"
                  disabled={!st}
                  onClick={() => {
                    addMany('state', [st]);
                    setSt('');
                  }}
                >
                  Add
                </button>
              </div>
            </div>
            <div className="where-block">
              <b>Whole districts</b>
              <div className="pins">{list('district', districtLabel)}</div>
              <div className="row">
                <select
                  value={dSt}
                  onChange={(e) => {
                    setDSt(e.target.value);
                    setDist('');
                  }}
                  aria-label="State"
                >
                  <option value="">State…</option>
                  {states.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <select
                  value={dist}
                  disabled={!dSt}
                  onChange={(e) => setDist(e.target.value)}
                  aria-label="District"
                >
                  <option value="">District…</option>
                  {districts.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <button
                  className="btn small"
                  disabled={!dist}
                  onClick={() => {
                    addMany('district', [`${dist}|${dSt}`]);
                    setDist('');
                  }}
                >
                  Add
                </button>
              </div>
            </div>
            <div className="where-block">
              <b>Single PIN codes</b>
              <div className="pins">{list('pincode')}</div>
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  addMany(
                    'pincode',
                    pins.split(/[\s,;]+/).filter((p) => /^[1-9][0-9]{5}$/.test(p)),
                  );
                  setPins('');
                }}
              >
                <input
                  className="grow"
                  value={pins}
                  onChange={(e) => setPins(e.target.value)}
                  placeholder="Paste PIN codes"
                />
                <button className="btn small" disabled={!pins.trim()}>
                  Add
                </button>
              </form>
            </div>
          </>
        ) : null}
        <div className="row">
          <button className="btn primary" disabled={!dirty || busy} onClick={() => void save()}>
            Save where it's offered
          </button>
          {dirty ? (
            <button className="btn" onClick={() => setRules(saved.rules)}>
              Undo
            </button>
          ) : null}
        </div>
        {!everywhere && rules.length === 0 ? (
          <span className="warn-text">
            Offered nowhere: customers will see “Not in your area yet”.
          </span>
        ) : null}
        {msg ? <span className={msg.ok ? 'note-ok' : 'error'}>{msg.text}</span> : null}
      </div>
    </section>
  );
}

/** Roughly how the customer sees the service before booking. */
function Preview({ d }: { d: Draft }) {
  const lines = d.includes.filter((l) => l.trim());
  return (
    <section className="section">
      <div className="section-head">
        <h2>What customers see</h2>
      </div>
      <div className="section-body stack preview">
        <b>{d.name || 'Service name'}</b>
        <span>
          {d.pricing === 'plan'
            ? 'Included in plans'
            : d.pricing === 'quote' || d.rupees.trim() === ''
              ? 'On quote'
              : rupees(Math.round(Number(d.rupees) * 100))}
        </span>
        <span className="sub">{d.description || 'Description'}</span>
        {lines.length ? (
          <ul>
            {lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        ) : null}
        {d.turnaround ? <span className="sub">{d.turnaround}</span> : null}
      </div>
    </section>
  );
}

function Activity({ serviceId }: { serviceId: string }) {
  const { data } = useRequestList();
  const mine = (data ?? []).filter((r) => r.service.id === serviceId);
  const open = mine.filter((r) => !['completed', 'cancelled'].includes(r.status));
  const done = mine.filter((r) => r.status === 'completed').length;
  return (
    <section className="section">
      <div className="section-head">
        <h2>Requests</h2>
        <Link to={`/requests?status=all`}>All requests</Link>
      </div>
      <div className="section-body stack">
        <span className="sub">
          {open.length} open · {done} completed · {mine.length} in the recent list
        </span>
        <ul className="list">
          {mine.slice(0, 8).map((r) => (
            <li key={r.id}>
              <Link to={`/requests?status=all&id=${r.id}`}>
                {r.customer_name || r.customer_phone || 'Customer'}
              </Link>
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
    </section>
  );
}
