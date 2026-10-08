import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import type {
  CoverageSummaryRow,
  CoverageZone,
  PincodePage,
  PincodeRow,
  ReachDemand,
  ZoneRuleKind,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { useUrlState } from '../lib/params';
import { Feedback, useAction } from '../ui/action';
import { DataTable, type Column } from '../ui/DataTable';
import { PlacePicker } from '../ui/PlacePicker';
import { Section } from '../ui/Section';
import { Tiles } from '../ui/Tiles';
import { useEscape } from '../ui/useEscape';

export const useCoverageSummary = () =>
  useQuery({
    queryKey: ['bo-coverage-summary'],
    queryFn: () => api<CoverageSummaryRow[]>('/backoffice/coverage/summary'),
    staleTime: 60_000,
  });
export const useZones = () =>
  useQuery({ queryKey: ['bo-zones'], queryFn: () => api<CoverageZone[]>('/backoffice/zones') });

/** "Bangalore|Karnataka" → "Bangalore, Karnataka" */
export const districtLabel = (v: string) => v.split('|').join(', ');
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

type StateRow = {
  state: string;
  pins: number;
  covered: number;
  properties: number;
  districts: number;
};

/** Where we can deliver, built on India's PIN codes: overview, PIN codes, zones, demand. */
export function Coverage() {
  const qc = useQueryClient();
  const [params, set] = useUrlState();
  const tab = params.get('tab') ?? 'overview';
  const summary = useCoverageSummary();
  const zones = useZones();
  const demand = useQuery({
    queryKey: ['bo-demand'],
    queryFn: () => api<ReachDemand[]>('/backoffice/coverage/demand'),
  });
  const refresh = () => {
    for (const k of [
      'bo-zones',
      'bo-coverage-summary',
      'bo-pincodes',
      'bo-demand',
      'bo-service-coverage',
    ])
      void qc.invalidateQueries({ queryKey: [k] });
  };
  const s = summary.data ?? [];
  const total = s.reduce((n, r) => n + r.pins, 0);
  const covered = s.reduce((n, r) => n + r.covered, 0);
  const waiting = demand.data?.reduce((n, d) => n + d.properties, 0) ?? 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Coverage</h1>
          <p>
            Everything is a PIN code. Group them into zones, then choose on each{' '}
            <Link to="/services">service</Link> where it is offered (zones, whole states or
            districts, or single PINs).
          </p>
        </div>
      </div>
      <Tiles
        value={tab}
        onChange={(v) => set({ tab: v, id: null, state: null, district: null })}
        tiles={[
          {
            value: 'overview',
            label: 'PIN codes in India',
            count: summary.data ? total.toLocaleString('en-IN') : '–',
          },
          {
            value: 'pins',
            label: 'Covered by a live zone',
            count: summary.data ? covered.toLocaleString('en-IN') : '–',
            tone: 'good',
          },
          { value: 'zones', label: 'Zones', count: zones.data?.length ?? '–' },
          {
            value: 'demand',
            label: 'Waiting for us',
            count: demand.data ? waiting : '–',
            tone: waiting ? 'warn' : '',
            hint: 'properties outside',
          },
        ]}
      />
      {summary.error ? <div className="error">{errorText(summary.error)}</div> : null}
      {tab === 'zones' ? (
        <Zones zones={zones.data} loading={zones.isPending} onChanged={refresh} />
      ) : tab === 'demand' ? (
        <Demand
          rows={demand.data}
          zones={zones.data ?? []}
          loading={demand.isPending}
          onChanged={refresh}
        />
      ) : tab === 'pins' ? (
        <Pincodes summary={s} zones={zones.data ?? []} onChanged={refresh} />
      ) : (
        <Overview summary={s} loading={summary.isPending} />
      )}
    </div>
  );
}

/* ---- Overview: states, then districts ---- */

function Overview({ summary, loading }: { summary: CoverageSummaryRow[]; loading: boolean }) {
  const [params, set] = useUrlState();
  const state = params.get('state');
  const byState = new Map<string, StateRow>();
  for (const r of summary) {
    const x = byState.get(r.state) ?? {
      state: r.state,
      pins: 0,
      covered: 0,
      properties: 0,
      districts: 0,
    };
    x.pins += r.pins;
    x.covered += r.covered;
    x.properties += r.properties;
    x.districts += 1;
    byState.set(r.state, x);
  }
  const stateCols: Column<StateRow>[] = [
    { key: 'state', header: 'State', sort: (r) => r.state, render: (r) => r.state },
    {
      key: 'districts',
      header: 'Districts',
      align: 'right',
      sort: (r) => r.districts,
      render: (r) => r.districts,
    },
    {
      key: 'pins',
      header: 'PIN codes',
      align: 'right',
      sort: (r) => r.pins,
      render: (r) => r.pins.toLocaleString('en-IN'),
    },
    {
      key: 'covered',
      header: 'Covered',
      align: 'right',
      sort: (r) => r.covered,
      render: (r) => `${r.covered} · ${pct(r.covered, r.pins)}`,
    },
    {
      key: 'props',
      header: 'Properties',
      align: 'right',
      sort: (r) => r.properties,
      render: (r) => r.properties,
    },
  ];
  const distCols: Column<CoverageSummaryRow>[] = [
    { key: 'district', header: 'District', sort: (r) => r.district, render: (r) => r.district },
    {
      key: 'pins',
      header: 'PIN codes',
      align: 'right',
      sort: (r) => r.pins,
      render: (r) => r.pins,
    },
    {
      key: 'covered',
      header: 'Covered',
      align: 'right',
      sort: (r) => r.covered,
      render: (r) => `${r.covered} · ${pct(r.covered, r.pins)}`,
    },
    {
      key: 'props',
      header: 'Properties',
      align: 'right',
      sort: (r) => r.properties,
      render: (r) => r.properties,
    },
  ];
  if (state)
    return (
      <>
        <div className="row">
          <button className="link" onClick={() => set({ state: null })}>
            ← All states
          </button>
          <b>{state}</b>
          <span className="sub">Click a district to see its PIN codes.</span>
        </div>
        <DataTable
          rows={summary.filter((r) => r.state === state)}
          columns={distCols}
          rowKey={(r) => r.district}
          onRowClick={(r) => set({ tab: 'pins', state: r.state, district: r.district })}
          searchText={(r) => r.district}
          searchPlaceholder="Search districts"
          defaultSort={{ key: 'props', dir: 'desc' }}
          exportName={`coverage-${state}`}
        />
      </>
    );
  return (
    <>
      <span className="sub">
        Click a state to see its districts. Properties are customers' properties with that PIN.
      </span>
      <DataTable
        rows={[...byState.values()]}
        columns={stateCols}
        rowKey={(r) => r.state}
        onRowClick={(r) => set({ state: r.state })}
        searchText={(r) => r.state}
        searchPlaceholder="Search states"
        defaultSort={{ key: 'props', dir: 'desc' }}
        exportName="coverage-states"
        loading={loading}
      />
    </>
  );
}

/* ---- PIN codes: the whole directory, searchable and filterable ---- */

function Pincodes({
  summary,
  zones,
  onChanged,
}: {
  summary: CoverageSummaryRow[];
  zones: CoverageZone[];
  onChanged: () => void;
}) {
  const [params, set] = useUrlState();
  const state = params.get('state') ?? '';
  const district = params.get('district') ?? '';
  const zone = params.get('zone') ?? '';
  const coveredF = params.get('covered') ?? '';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [page, setPage] = useState(0);
  const [target, setTarget] = useState('');
  const a = useAction(onChanged);
  const size = 200;
  const query = new URLSearchParams({
    ...(params.get('q') ? { q: params.get('q')! } : {}),
    ...(state ? { state } : {}),
    ...(district ? { district } : {}),
    ...(zone ? { zone } : {}),
    ...(coveredF ? { covered: coveredF } : {}),
    limit: String(size),
    offset: String(page * size),
  }).toString();
  const { data, error, isPending } = useQuery({
    queryKey: ['bo-pincodes', query],
    queryFn: () => api<PincodePage>(`/backoffice/pincodes?${query}`),
  });
  const states = [...new Set(summary.map((r) => r.state))].sort();
  const districts = summary.filter((r) => r.state === state).map((r) => r.district);
  const put = (patch: Record<string, string | null>) => {
    setPage(0);
    set(patch);
  };

  // Adding what is on screen to a zone: a whole district or state when that is the filter.
  const addToZone = () => {
    if (!target) return;
    const path = `/backoffice/zones/${target}/rules`;
    const plain = !params.get('q') && !zone && !coveredF;
    if (plain && district)
      return a.mutate({
        path,
        body: { kind: 'district', values: [`${district}|${state}`] },
        ok: `${district} added to the zone`,
      });
    if (plain && state && !district)
      return a.mutate({
        path,
        body: { kind: 'state', values: [state] },
        ok: `${state} added to the zone`,
      });
    const pins = data?.rows.map((r) => r.pincode) ?? [];
    if (pins.length)
      a.mutate({
        path,
        body: { kind: 'pincode', values: pins },
        ok: `${pins.length} PIN codes added to the zone`,
      });
  };
  const addLabel =
    !params.get('q') && !zone && !coveredF && district
      ? `Add district ${district}`
      : !params.get('q') && !zone && !coveredF && state
        ? `Add all of ${state}`
        : `Add these ${data?.rows.length ?? 0} PINs`;

  const cols: Column<PincodeRow>[] = [
    {
      key: 'pin',
      header: 'PIN code',
      sort: (r) => r.pincode,
      render: (r) => <span className="mono strong">{r.pincode}</span>,
    },
    {
      key: 'place',
      header: 'Place',
      sort: (r) => r.place,
      render: (r) => (
        <>
          {r.place}
          <span className="sub clip" title={r.localities.join(', ')}>
            {r.localities
              .filter((l) => l !== r.place)
              .slice(0, 4)
              .join(', ')}
          </span>
        </>
      ),
    },
    { key: 'district', header: 'District', sort: (r) => r.district, render: (r) => r.district },
    { key: 'state', header: 'State', sort: (r) => r.state, render: (r) => r.state },
    {
      key: 'zones',
      header: 'Zones',
      sort: (r) => r.zones.length,
      render: (r) =>
        r.zones.length ? r.zones.join(', ') : <span className="sub">Not covered</span>,
      csv: (r) => r.zones.join('; '),
    },
    {
      key: 'props',
      header: 'Properties',
      align: 'right',
      sort: (r) => r.properties,
      render: (r) => r.properties || '—',
    },
  ];
  return (
    <>
      <div className="filters">
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            put({ q: q.trim() || null });
          }}
        >
          <input
            type="search"
            className="search"
            placeholder="PIN code, place or locality"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn small">Search</button>
        </form>
        <select
          value={state}
          onChange={(e) => put({ state: e.target.value || null, district: null })}
          aria-label="State"
        >
          <option value="">All states</option>
          {states.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select
          value={district}
          disabled={!state}
          onChange={(e) => put({ district: e.target.value || null })}
          aria-label="District"
        >
          <option value="">{state ? 'All districts' : 'Choose a state first'}</option>
          {districts.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select
          value={zone}
          onChange={(e) => put({ zone: e.target.value || null })}
          aria-label="Zone"
        >
          <option value="">Any zone</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
        <select
          value={coveredF}
          onChange={(e) => put({ covered: e.target.value || null })}
          aria-label="Covered"
        >
          <option value="">Covered or not</option>
          <option value="yes">Covered</option>
          <option value="no">Not covered</option>
        </select>
      </div>
      <div className="row between">
        <span className="sub">
          {data ? `${data.total.toLocaleString('en-IN')} PIN codes` : 'Loading…'}
          {data && data.total > size
            ? ` · showing ${page * size + 1}–${Math.min((page + 1) * size, data.total)}`
            : ''}
        </span>
        <div className="row">
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-label="Zone to add to"
          >
            <option value="">Add to a zone…</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
          <button
            className="btn small primary"
            disabled={!target || !data?.rows.length || a.isPending}
            onClick={addToZone}
          >
            {addLabel}
          </button>
        </div>
      </div>
      <Feedback a={a} />
      <DataTable
        rows={data?.rows}
        columns={cols}
        rowKey={(r) => r.pincode}
        defaultSort={{ key: 'pin', dir: 'asc' }}
        exportName="pincodes"
        loading={isPending}
        error={error ? errorText(error) : null}
        empty="No PIN codes match."
        pageSize={size}
      />
      {data && data.total > size ? (
        <div className="row">
          <button className="btn small" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            ← Previous
          </button>
          <button
            className="btn small"
            disabled={(page + 1) * size >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      ) : null}
    </>
  );
}

/* ---- Zones ---- */

const ruleSummary = (z: CoverageZone) => {
  const n = (k: ZoneRuleKind) => z.rules.filter((r) => r.kind === k).length;
  return [
    n('state') && `${n('state')} state${n('state') > 1 ? 's' : ''}`,
    n('district') && `${n('district')} district${n('district') > 1 ? 's' : ''}`,
    n('pincode') && `${n('pincode')} PINs`,
    n('exclude') && `${n('exclude')} left out`,
  ]
    .filter(Boolean)
    .join(' · ');
};

function Zones({
  zones,
  loading,
  onChanged,
}: {
  zones: CoverageZone[] | undefined;
  loading: boolean;
  onChanged: () => void;
}) {
  const [params, set] = useUrlState();
  const selected = params.get('id');
  const [name, setName] = useState('');
  const a = useAction(onChanged);
  const close = () => set({ id: null, full: null });
  const open = zones?.find((z) => z.id === selected);
  const cols: Column<CoverageZone>[] = [
    { key: 'name', header: 'Zone', sort: (z) => z.name, render: (z) => z.name },
    {
      key: 'rules',
      header: 'Made of',
      sort: (z) => z.rules.length,
      render: (z) => ruleSummary(z) || <span className="sub">Empty</span>,
    },
    {
      key: 'pins',
      header: 'PIN codes',
      align: 'right',
      sort: (z) => z.pin_count,
      render: (z) => z.pin_count.toLocaleString('en-IN'),
    },
    {
      key: 'props',
      header: 'Properties',
      align: 'right',
      sort: (z) => z.properties,
      render: (z) => z.properties,
    },
    {
      key: 'services',
      header: 'Used by',
      sort: (z) => z.services.length,
      render: (z) => (z.services.length ? `${z.services.length} services` : '—'),
    },
    {
      key: 'live',
      header: 'Status',
      sort: (z) => (z.is_active ? 1 : 0),
      render: (z) => (
        <span className={`badge ${z.is_active ? 'good' : ''}`}>
          {z.is_active ? 'Live' : 'Paused'}
        </span>
      ),
    },
  ];
  return (
    <>
      <Feedback a={a} />
      <DataTable
        rows={zones}
        columns={cols}
        rowKey={(z) => z.id}
        selected={selected}
        onRowClick={(z) => set({ id: z.id })}
        onClose={close}
        detail={open ? <ZonePane zone={open} onChanged={onChanged} onClose={close} /> : null}
        searchText={(z) => z.name}
        searchPlaceholder="Search zones"
        defaultSort={{ key: 'name', dir: 'asc' }}
        exportName="zones"
        loading={loading}
        toolbar={
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              a.mutate(
                { path: '/backoffice/zones', body: { name: name.trim() }, ok: 'Zone added' },
                { onSuccess: () => setName('') },
              );
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New zone, e.g. Bengaluru East"
            />
            <button className="btn small primary" disabled={!name.trim() || a.isPending}>
              Add zone
            </button>
          </form>
        }
      />
    </>
  );
}

function ZonePane({
  zone,
  onChanged,
  onClose,
}: {
  zone: CoverageZone;
  onChanged: () => void;
  onClose: () => void;
}) {
  useEscape(onClose);
  const a = useAction(onChanged);
  const summary = useCoverageSummary();
  const [excl, setExcl] = useState('');
  const base = `/backoffice/zones/${zone.id}`;
  const add = (kind: ZoneRuleKind, values: string[] | string, ok: string, after?: () => void) =>
    a.mutate({ path: `${base}/rules`, body: { kind, values }, ok }, { onSuccess: after });
  const chips = (kind: ZoneRuleKind, fmt: (v: string) => string = (v) => v) => {
    const list = zone.rules.filter((r) => r.kind === kind);
    if (!list.length) return <span className="sub">None.</span>;
    return (
      <div className="pins">
        {list.map((r) => (
          <span key={r.id} className="pin">
            {fmt(r.value)}
            <button
              aria-label={`Remove ${r.value}`}
              disabled={a.isPending}
              onClick={() =>
                a.mutate({ path: `${base}/rules/${r.id}`, method: 'DELETE', ok: 'Removed' })
              }
            >
              ×
            </button>
          </span>
        ))}
      </div>
    );
  };
  return (
    <div className="customer">
      <header className="ticket-head">
        <div>
          <h2>{zone.name}</h2>
          <span className="sub">
            {zone.pin_count.toLocaleString('en-IN')} PIN codes · {zone.properties} properties ·{' '}
            {ruleSummary(zone) || 'empty'}
          </span>
        </div>
        <div className="row">
          <button
            className="btn small"
            onClick={() => {
              const n = window.prompt('Zone name', zone.name);
              if (n?.trim() && n.trim() !== zone.name)
                a.mutate({ path: base, method: 'PATCH', body: { name: n.trim() }, ok: 'Renamed' });
            }}
          >
            Rename
          </button>
          <button
            className={`btn small ${zone.is_active ? 'danger' : 'primary'}`}
            disabled={a.isPending}
            onClick={() => {
              if (
                zone.is_active &&
                !window.confirm(
                  `Pause ${zone.name}? Services offered through it stop reaching these PINs.`,
                )
              )
                return;
              a.mutate({
                path: base,
                method: 'PATCH',
                body: { is_active: !zone.is_active },
                ok: zone.is_active ? 'Paused' : 'Live again',
              });
            }}
          >
            {zone.is_active ? 'Pause' : 'Make live'}
          </button>
          <button
            className="btn small danger"
            disabled={zone.services.length > 0 || a.isPending}
            title={zone.services.length ? 'Remove it from its services first' : undefined}
            onClick={() => {
              if (window.confirm(`Delete ${zone.name}?`))
                a.mutate({ path: base, method: 'DELETE', ok: 'Deleted' }, { onSuccess: onClose });
            }}
          >
            Delete
          </button>
        </div>
      </header>
      <Feedback a={a} />
      <div className="sections">
        <Section
          title="What's in this zone"
          count={zone.rules.filter((r) => r.kind !== 'exclude').length}
        >
          <div className="chip-group">
            <b>Whole states (every PIN, now and later)</b>
            {chips('state')}
          </div>
          <div className="chip-group">
            <b>Whole districts</b>
            {chips('district', districtLabel)}
          </div>
          <div className="chip-group">
            <b>Single PIN codes</b>
            {chips('pincode')}
          </div>
          <div className="chip-group">
            <b>Add places</b>
            <PlacePicker
              summary={summary.data ?? []}
              busy={a.isPending}
              taken={(kind, value) => zone.rules.some((r) => r.kind === kind && r.value === value)}
              onAdd={(kind, values) => add(kind, values, `${values.length} added`)}
            />
          </div>
        </Section>
        <Section
          title="Left out"
          count={zone.rules.filter((r) => r.kind === 'exclude').length}
          open={zone.rules.some((r) => r.kind === 'exclude')}
          aside={
            <span className="sub">PINs not covered even inside a state or district above</span>
          }
        >
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              add('exclude', excl, 'Left out', () => setExcl(''));
            }}
          >
            <input
              className="grow"
              value={excl}
              onChange={(e) => setExcl(e.target.value)}
              placeholder="PIN codes to leave out"
            />
            <button className="btn small" disabled={!excl.trim() || a.isPending}>
              Leave out
            </button>
          </form>
          {chips('exclude')}
        </Section>
        <Section title="Services offered through this zone" count={zone.services.length}>
          {zone.services.length ? (
            <ul className="list">
              {zone.services.map((s) => (
                <li key={s.id}>
                  <Link to={`/services/${s.id}`}>{s.name}</Link>
                </li>
              ))}
            </ul>
          ) : (
            <span className="sub">
              None yet. Add this zone to a service on the service's page, under “Where it's
              offered”.
            </span>
          )}
          <Link to={`/coverage?tab=pins&zone=${zone.id}`}>See its PIN codes</Link>
        </Section>
      </div>
    </div>
  );
}

/* ---- Waiting for us ---- */

function Demand({
  rows,
  zones,
  loading,
  onChanged,
}: {
  rows: ReachDemand[] | undefined;
  zones: CoverageZone[];
  loading: boolean;
  onChanged: () => void;
}) {
  const a = useAction(onChanged);
  const [zone, setZone] = useState('');
  const cols: Column<ReachDemand>[] = [
    {
      key: 'pincode',
      header: 'PIN code',
      sort: (d) => d.pincode,
      render: (d) => <span className="mono">{d.pincode ?? 'No PIN code'}</span>,
    },
    { key: 'place', header: 'Place', sort: (d) => d.place, render: (d) => d.place ?? '—' },
    {
      key: 'properties',
      header: 'Properties',
      align: 'right',
      sort: (d) => d.properties,
      render: (d) => d.properties,
    },
    {
      key: 'interested',
      header: 'Asked to hear',
      align: 'right',
      sort: (d) => d.interested,
      render: (d) => d.interested,
    },
    {
      key: 'add',
      header: '',
      render: (d) =>
        d.pincode && zone ? (
          <button
            className="btn small"
            disabled={a.isPending}
            onClick={(e) => {
              e.stopPropagation();
              a.mutate({
                path: `/backoffice/zones/${zone}/rules`,
                body: { kind: 'pincode', values: [d.pincode] },
                ok: `${d.pincode} added`,
              });
            }}
          >
            Add to zone
          </button>
        ) : null,
    },
  ];
  return (
    <>
      <span className="sub">
        Customers' properties whose PIN code is in no live zone, most wanted first.
      </span>
      <Feedback a={a} />
      <DataTable
        rows={rows}
        columns={cols}
        rowKey={(d) => d.pincode ?? 'none'}
        searchText={(d) => `${d.pincode ?? ''} ${d.place ?? ''}`}
        searchPlaceholder="Search PIN code or place"
        defaultSort={{ key: 'properties', dir: 'desc' }}
        exportName="demand"
        loading={loading}
        empty="Every property is inside a live zone."
        toolbar={
          <select
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            aria-label="Zone to add to"
          >
            <option value="">Add PIN codes to a zone…</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        }
      />
    </>
  );
}
