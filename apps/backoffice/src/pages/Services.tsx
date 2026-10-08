import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  CANCEL_POLICIES,
  CANCEL_POLICY_LABELS,
  PAYMENT_TIMINGS,
  PAYMENT_TIMING_LABELS,
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
  SERVICE_FULFILMENTS,
  SERVICE_FULFILMENT_LABELS,
  SERVICE_REACHES,
  SERVICE_REACH_LABELS,
  type StaffService,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { rupees } from '../lib/format';
import { useUrlState } from '../lib/params';
import { Feedback, useAction } from '../ui/action';
import { Coverage } from './Coverage';

/** What we offer (services) and where we can deliver it (areas, states, demand). */
export function Services() {
  const [params, set] = useUrlState();
  const tab = params.get('tab') === 'coverage' ? 'coverage' : 'services';
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Services &amp; coverage</h1>
          <p>
            {tab === 'services'
              ? 'What customers can request, its price and how it is delivered.'
              : 'Where our team can visit, and where people are waiting for us.'}
          </p>
        </div>
        <div className="tabs" role="group" aria-label="View">
          <button aria-pressed={tab === 'services'} onClick={() => set({ tab: null, id: null })}>
            Services
          </button>
          <button
            aria-pressed={tab === 'coverage'}
            onClick={() => set({ tab: 'coverage', id: null })}
          >
            Coverage
          </button>
        </div>
      </div>
      {tab === 'services' ? (
        <ServiceList selected={params.get('id')} select={(id) => set({ id })} />
      ) : (
        <Coverage />
      )}
    </div>
  );
}

function ServiceList({
  selected,
  select,
}: {
  selected: string | null;
  select: (id: string | null) => void;
}) {
  const { data, error, isPending } = useQuery({
    queryKey: ['bo-services'],
    queryFn: () => api<StaffService[]>('/backoffice/services'),
  });
  const current = selected === 'new' ? null : data?.find((s) => s.id === selected);
  return (
    <div className={`split ${selected ? '' : 'closed'}`}>
      <section className="section">
        <div className="section-head">
          <h2>{data ? `${data.length} services` : 'Services'}</h2>
          <button className="btn" onClick={() => select('new')}>
            Add a service
          </button>
        </div>
        {isPending ? <div className="empty">Loading…</div> : null}
        {error ? <div className="empty error">{errorText(error)}</div> : null}
        {data ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Kind</th>
                  <th>Price</th>
                  <th>Where</th>
                  <th>Shown</th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr
                    key={s.id}
                    className={selected === s.id ? 'selected' : ''}
                    onClick={() => select(s.id)}
                  >
                    <td>
                      {s.name}
                      <span className="sub">{SERVICE_CATEGORY_LABELS[s.category]}</span>
                    </td>
                    <td>{SERVICE_FULFILMENT_LABELS[s.fulfilment]}</td>
                    <td>
                      {s.price_paise === null ? 'On quote' : rupees(s.price_paise)}
                      <span className="sub">
                        {s.is_extra_available ? 'Can be bought' : 'Plan only'}
                      </span>
                    </td>
                    <td>{SERVICE_REACH_LABELS[s.reach]}</td>
                    <td>
                      <span className={`badge ${s.is_active ? 'good' : ''}`}>
                        {s.is_active ? 'Live' : 'Hidden'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      {selected && (current || selected === 'new') ? (
        <ServiceForm
          key={selected}
          service={current ?? null}
          onClose={() => select(null)}
          onCreated={(id) => select(id)}
        />
      ) : null}
    </div>
  );
}

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
  includes: string;
  turnaround: string;
  payment_timing: StaffService['payment_timing'];
  cancel_policy: StaffService['cancel_policy'];
  expected_days: string;
  sort_order: string;
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
  includes: s?.includes.join('\n') ?? '',
  turnaround: s?.turnaround ?? '',
  payment_timing: s?.payment_timing ?? 'on_confirmation',
  cancel_policy: s?.cancel_policy ?? 'until_confirmed',
  expected_days: s?.expected_days ? String(s.expected_days) : '',
  sort_order: String(s?.sort_order ?? 100),
});

/** Every editable field is sent, so nothing falls back to a default by accident. */
const toBody = (d: Draft) => ({
  name: d.name.trim(),
  description: d.description.trim(),
  category: d.category,
  price_paise: d.rupees.trim() === '' ? null : Math.round(Number(d.rupees) * 100),
  is_active: d.is_active,
  is_extra_available: d.is_extra_available,
  fulfilment: d.fulfilment,
  reach: d.reach,
  includes: d.includes
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean),
  turnaround: d.turnaround.trim() || null,
  payment_timing: d.payment_timing,
  cancel_policy: d.cancel_policy,
  expected_days: d.expected_days ? Number(d.expected_days) : null,
  sort_order: Number(d.sort_order) || 0,
});

function ServiceForm({
  service,
  onClose,
  onCreated,
}: {
  service: StaffService | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [d, setD] = useState(() => toDraft(service));
  const a = useAction(() => void qc.invalidateQueries({ queryKey: ['bo-services'] }));
  const put = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const save = () => {
    if (service) {
      a.mutate({
        path: `/backoffice/services/${service.id}`,
        method: 'PATCH',
        body: toBody(d),
        ok: 'Saved',
      });
    } else {
      api<StaffService>('/backoffice/services', {
        method: 'POST',
        body: { code: d.code.trim(), ...toBody(d) },
      })
        .then((row) => {
          void qc.invalidateQueries({ queryKey: ['bo-services'] });
          onCreated(row.id);
        })
        .catch((err: unknown) => window.alert(errorText(err)));
    }
  };

  const select = <K extends keyof Draft>(
    k: K,
    label: string,
    values: readonly string[],
    labels: Record<string, string>,
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
    </label>
  );

  return (
    <aside className="panel" aria-label="Service">
      <div className="panel-head">
        <div>
          <h2>{service ? service.name : 'New service'}</h2>
          {service ? <span className="mono">{service.code}</span> : null}
        </div>
        <button className="link" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="panel-body">
        <div className="form-grid">
          {!service ? (
            <label className="field wide">
              Code (permanent, e.g. site_visit)
              <input value={d.code} onChange={(e) => put('code', e.target.value)} />
            </label>
          ) : null}
          <label className="field wide">
            Name
            <input value={d.name} onChange={(e) => put('name', e.target.value)} />
          </label>
          <label className="field wide">
            Description
            <textarea value={d.description} onChange={(e) => put('description', e.target.value)} />
          </label>
          {select('category', 'Category', SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS)}
          {select('fulfilment', 'Delivered as', SERVICE_FULFILMENTS, SERVICE_FULFILMENT_LABELS)}
          <label className="field">
            Price in ₹ (empty = on quote)
            <input
              type="number"
              min={0}
              value={d.rupees}
              onChange={(e) => put('rupees', e.target.value)}
            />
          </label>
          {select('reach', 'Where', SERVICE_REACHES, SERVICE_REACH_LABELS)}
          {select('payment_timing', 'Paid', PAYMENT_TIMINGS, PAYMENT_TIMING_LABELS)}
          {select('cancel_policy', 'Customer can cancel', CANCEL_POLICIES, CANCEL_POLICY_LABELS)}
          <label className="field">
            Usual working days
            <input
              type="number"
              min={1}
              max={365}
              value={d.expected_days}
              onChange={(e) => put('expected_days', e.target.value)}
            />
          </label>
          <label className="field">
            Order in the list
            <input
              type="number"
              min={0}
              value={d.sort_order}
              onChange={(e) => put('sort_order', e.target.value)}
            />
          </label>
          <label className="field wide">
            How long it takes (shown to customers)
            <input value={d.turnaround} onChange={(e) => put('turnaround', e.target.value)} />
          </label>
          <label className="field wide">
            What it includes (one per line, up to 10)
            <textarea value={d.includes} onChange={(e) => put('includes', e.target.value)} />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={d.is_extra_available}
              onChange={(e) => put('is_extra_available', e.target.checked)}
            />
            Can be bought as an extra
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={d.is_active}
              onChange={(e) => put('is_active', e.target.checked)}
            />
            Live in the app
          </label>
        </div>
        <div className="row">
          <button className="btn primary" disabled={a.isPending} onClick={save}>
            {service ? 'Save' : 'Add service'}
          </button>
        </div>
        <Feedback a={a} />
      </div>
    </aside>
  );
}
