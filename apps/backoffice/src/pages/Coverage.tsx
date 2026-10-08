import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  SERVICE_REACH_LABELS,
  type BackofficeCoverage,
  type ReachDemand,
  type StaffService,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { useUrlState } from '../lib/params';
import { Feedback, useAction } from '../ui/action';
import { DataTable, type Column } from '../ui/DataTable';
import { Section } from '../ui/Section';
import { Tiles } from '../ui/Tiles';
import { useEscape } from '../ui/useEscape';
import { useServices } from './Services';

type Area = BackofficeCoverage['areas'][number];
type State = BackofficeCoverage['states'][number];

export const useCoverage = () =>
  useQuery({
    queryKey: ['bo-coverage'],
    queryFn: () => api<BackofficeCoverage>('/backoffice/coverage'),
  });

/** Services a place gets: visit services in live areas, paperwork in live states, and "everywhere". */
function servicesFor(
  services: StaffService[],
  place: { kind: 'area'; live: boolean; stateLive: boolean } | { kind: 'state'; live: boolean },
) {
  return services.filter((s) => {
    if (s.reach === 'everywhere') return true;
    if (s.reach === 'state') return place.kind === 'state' ? place.live : place.stateLive;
    return place.kind === 'area' && place.live;
  });
}

const parseList = (s: string) => s.split(/[\s,;]+/).filter(Boolean);

/** Where we can deliver: visit areas (PIN codes), paperwork states (PIN prefixes), and demand. */
export function Coverage() {
  const qc = useQueryClient();
  const [params, set] = useUrlState();
  const tab = params.get('tab') ?? 'areas';
  const selected = params.get('id');
  const { data, error, isPending } = useCoverage();
  const refresh = () => void qc.invalidateQueries({ queryKey: ['bo-coverage'] });
  const close = () => set({ id: null, full: null });

  const liveAreas = data?.areas.filter((a) => a.is_active) ?? [];
  const pins = liveAreas.reduce((n, a) => n + a.pincodes.length, 0);
  const visitable = liveAreas.reduce((n, a) => n + a.properties, 0);
  const waiting = data?.demand.reduce((n, d) => n + d.properties, 0) ?? 0;

  const areaCols: Column<Area>[] = [
    { key: 'name', header: 'Area', sort: (a) => a.name, render: (a) => a.name },
    { key: 'state', header: 'State', sort: (a) => a.state, render: (a) => a.state },
    {
      key: 'pins',
      header: 'PIN codes',
      align: 'right',
      sort: (a) => a.pincodes.length,
      render: (a) => a.pincodes.length,
    },
    {
      key: 'props',
      header: 'Properties',
      align: 'right',
      sort: (a) => a.properties,
      render: (a) => a.properties,
    },
    {
      key: 'live',
      header: 'Visits',
      sort: (a) => (a.is_active ? 1 : 0),
      render: (a) => (
        <span className={`badge ${a.is_active ? 'good' : ''}`}>
          {a.is_active ? 'Live' : 'Paused'}
        </span>
      ),
      csv: (a) => (a.is_active ? 'Live' : 'Paused'),
    },
  ];
  const stateCols: Column<State>[] = [
    { key: 'state', header: 'State', sort: (s) => s.state, render: (s) => s.state },
    {
      key: 'prefixes',
      header: 'PIN codes starting with',
      sort: (s) => s.pincode_prefixes.join(','),
      render: (s) => <span className="mono">{s.pincode_prefixes.join(', ') || '—'}</span>,
    },
    {
      key: 'props',
      header: 'Properties',
      align: 'right',
      sort: (s) => s.properties,
      render: (s) => s.properties,
    },
    {
      key: 'live',
      header: 'Paperwork',
      sort: (s) => (s.is_active ? 1 : 0),
      render: (s) => (
        <span className={`badge ${s.is_active ? 'good' : ''}`}>
          {s.is_active ? 'Live' : 'Paused'}
        </span>
      ),
      csv: (s) => (s.is_active ? 'Live' : 'Paused'),
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Coverage</h1>
          <p>
            Where our team can visit (areas, by PIN code) and help with paperwork (states). Which
            services reach a place is set on each <Link to="/services">service</Link>.
          </p>
        </div>
      </div>
      {error ? <div className="error">{errorText(error)}</div> : null}
      <Tiles
        value={tab}
        onChange={(v) => set({ tab: v, id: null })}
        tiles={[
          {
            value: 'areas',
            label: 'Visit areas live',
            count: data ? liveAreas.length : '–',
            hint: `${pins} PIN codes`,
          },
          {
            value: 'states',
            label: 'Paperwork states live',
            count: data ? data.states.filter((s) => s.is_active).length : '–',
          },
          {
            value: 'areas_props',
            label: 'Properties we can visit',
            count: data ? visitable : '–',
            tone: 'good',
          },
          {
            value: 'demand',
            label: 'Waiting for us',
            count: data ? waiting : '–',
            tone: waiting ? 'warn' : '',
            hint: 'properties outside',
          },
        ]}
      />

      {tab === 'states' ? (
        <DataTable
          rows={data?.states}
          columns={stateCols}
          rowKey={(s) => s.state}
          selected={selected}
          onRowClick={(s) => set({ id: s.state })}
          onClose={close}
          detail={
            selected && data?.states.find((s) => s.state === selected) ? (
              <StatePane
                s={data.states.find((s) => s.state === selected)!}
                onChanged={refresh}
                onClose={close}
              />
            ) : null
          }
          searchText={(s) => `${s.state} ${s.pincode_prefixes.join(' ')}`}
          searchPlaceholder="Search states"
          defaultSort={{ key: 'state', dir: 'asc' }}
          exportName="paperwork-states"
          loading={isPending}
          toolbar={<NewState onChanged={refresh} />}
        />
      ) : tab === 'demand' ? (
        <Demand data={data} loading={isPending} onChanged={refresh} />
      ) : (
        <DataTable
          rows={data?.areas}
          columns={areaCols}
          rowKey={(a) => a.id}
          selected={selected}
          onRowClick={(a) => set({ id: a.id })}
          onClose={close}
          detail={
            selected && data?.areas.find((a) => a.id === selected) ? (
              <AreaPane
                area={data.areas.find((a) => a.id === selected)!}
                stateLive={
                  !!data.states.find(
                    (s) => s.state === data.areas.find((a) => a.id === selected)!.state,
                  )?.is_active
                }
                onChanged={refresh}
                onClose={close}
              />
            ) : null
          }
          searchText={(a) => `${a.name} ${a.state} ${a.pincodes.join(' ')}`}
          searchPlaceholder="Search areas or a PIN code"
          defaultSort={{
            key: tab === 'areas_props' ? 'props' : 'name',
            dir: tab === 'areas_props' ? 'desc' : 'asc',
          }}
          exportName="visit-areas"
          loading={isPending}
          toolbar={<NewArea onChanged={refresh} />}
        />
      )}
    </div>
  );
}

function ServicesHere({ list }: { list: StaffService[] }) {
  if (list.length === 0) return <span className="sub">No services reach here yet.</span>;
  return (
    <ul className="list">
      {list.map((s) => (
        <li key={s.id}>
          <Link to={`/services/${s.id}`}>{s.name}</Link>
          <span className={`badge ${s.is_active ? 'good' : ''}`}>
            {s.is_active ? 'Live' : 'Hidden'}
          </span>
          <span className="sub">{SERVICE_REACH_LABELS[s.reach]}</span>
        </li>
      ))}
    </ul>
  );
}

function AreaPane({
  area,
  stateLive,
  onChanged,
  onClose,
}: {
  area: Area;
  stateLive: boolean;
  onChanged: () => void;
  onClose: () => void;
}) {
  useEscape(onClose);
  const a = useAction(onChanged);
  const services = useServices();
  const [pins, setPins] = useState('');
  const [find, setFind] = useState('');
  const base = `/backoffice/areas/${area.id}`;
  const shown = area.pincodes.filter((p) => p.includes(find.trim()));
  return (
    <div className="customer">
      <header className="ticket-head">
        <div>
          <h2>{area.name}</h2>
          <span className="sub">
            {area.state} · {area.pincodes.length} PIN codes · {area.properties} properties
          </span>
        </div>
        <div className="row">
          <button
            className="btn small"
            onClick={() => {
              const name = window.prompt('Area name', area.name);
              if (name?.trim() && name.trim() !== area.name)
                a.mutate({
                  path: base,
                  method: 'PATCH',
                  body: { name: name.trim() },
                  ok: 'Renamed',
                });
            }}
          >
            Rename
          </button>
          <button
            className={`btn small ${area.is_active ? 'danger' : 'primary'}`}
            disabled={a.isPending}
            onClick={() => {
              if (
                area.is_active &&
                !window.confirm(`Pause visits in ${area.name}? New visit requests there stop.`)
              )
                return;
              a.mutate({
                path: base,
                method: 'PATCH',
                body: { is_active: !area.is_active },
                ok: area.is_active ? 'Paused' : 'Live again',
              });
            }}
          >
            {area.is_active ? 'Pause visits' : 'Make live'}
          </button>
        </div>
      </header>
      <Feedback a={a} />
      <div className="sections">
        <Section title="PIN codes" count={area.pincodes.length}>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!pins.trim()) return;
              a.mutate(
                { path: `${base}/pincodes`, body: { pincodes: pins }, ok: 'PIN codes added' },
                { onSuccess: () => setPins('') },
              );
            }}
          >
            <input
              className="grow"
              value={pins}
              onChange={(e) => setPins(e.target.value)}
              placeholder="Add PIN codes — paste many at once, e.g. 560001, 560002"
            />
            <button className="btn primary" disabled={a.isPending || !pins.trim()}>
              Add
            </button>
          </form>
          {area.pincodes.length > 12 ? (
            <input
              type="search"
              placeholder="Find a PIN code"
              value={find}
              onChange={(e) => setFind(e.target.value)}
            />
          ) : null}
          <div className="pins">
            {shown.map((p) => (
              <span key={p} className="pin">
                {p}
                <button
                  aria-label={`Remove ${p}`}
                  disabled={a.isPending}
                  onClick={() =>
                    a.mutate({
                      path: `${base}/pincodes/${p}`,
                      method: 'DELETE',
                      ok: `Removed ${p}`,
                    })
                  }
                >
                  ×
                </button>
              </span>
            ))}
            {area.pincodes.length === 0 ? <span className="sub">No PIN codes yet.</span> : null}
          </div>
        </Section>
        <Section title="Services offered here">
          <span className="sub">
            Visit services reach live areas; paperwork services reach live states
            {stateLive ? ` (${area.state} is live)` : ` (${area.state} is not live for paperwork)`}.
          </span>
          <ServicesHere
            list={servicesFor(services.data ?? [], {
              kind: 'area',
              live: area.is_active,
              stateLive,
            })}
          />
        </Section>
      </div>
    </div>
  );
}

function StatePane({
  s,
  onChanged,
  onClose,
}: {
  s: State;
  onChanged: () => void;
  onClose: () => void;
}) {
  useEscape(onClose);
  const a = useAction(onChanged);
  const services = useServices();
  const [prefixes, setPrefixes] = useState(s.pincode_prefixes.join(', '));
  const path = `/backoffice/states/${encodeURIComponent(s.state)}`;
  return (
    <div className="customer">
      <header className="ticket-head">
        <div>
          <h2>{s.state}</h2>
          <span className="sub">{s.properties} properties</span>
        </div>
        <button
          className={`btn small ${s.is_active ? 'danger' : 'primary'}`}
          disabled={a.isPending}
          onClick={() =>
            a.mutate({
              path,
              method: 'PATCH',
              body: { is_active: !s.is_active },
              ok: s.is_active ? 'Paused' : 'Live again',
            })
          }
        >
          {s.is_active ? 'Pause paperwork' : 'Make live'}
        </button>
      </header>
      <Feedback a={a} />
      <div className="sections">
        <Section title="Which PIN codes belong to this state">
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              a.mutate({
                path,
                method: 'PATCH',
                body: { pincode_prefixes: parseList(prefixes) },
                ok: 'Saved',
              });
            }}
          >
            <input
              className="grow"
              value={prefixes}
              onChange={(e) => setPrefixes(e.target.value)}
              placeholder="e.g. 56, 57, 58, 59"
            />
            <button className="btn primary" disabled={a.isPending}>
              Save
            </button>
          </form>
          <span className="sub">PIN codes starting with these digits count as this state.</span>
        </Section>
        <Section title="Services offered here">
          <ServicesHere
            list={servicesFor(services.data ?? [], { kind: 'state', live: s.is_active })}
          />
        </Section>
      </div>
    </div>
  );
}

function Demand({
  data,
  loading,
  onChanged,
}: {
  data: BackofficeCoverage | undefined;
  loading: boolean;
  onChanged: () => void;
}) {
  const a = useAction(onChanged);
  const [area, setArea] = useState('');
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
        d.pincode && area ? (
          <button
            className="btn small"
            disabled={a.isPending}
            onClick={(e) => {
              e.stopPropagation();
              a.mutate({
                path: `/backoffice/areas/${area}/pincodes`,
                body: { pincodes: [d.pincode] },
                ok: `${d.pincode} added`,
              });
            }}
          >
            Add to area
          </button>
        ) : null,
    },
  ];
  return (
    <>
      <Feedback a={a} />
      <DataTable
        rows={data?.demand}
        columns={cols}
        rowKey={(d) => d.pincode ?? 'none'}
        searchText={(d) => `${d.pincode ?? ''} ${d.place ?? ''}`}
        searchPlaceholder="Search PIN code or place"
        defaultSort={{ key: 'properties', dir: 'desc' }}
        exportName="demand"
        loading={loading}
        empty="No demand outside our areas yet."
        toolbar={
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            aria-label="Area to add to"
          >
            <option value="">Add PIN codes to an area…</option>
            {data?.areas.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        }
      />
    </>
  );
}

function NewArea({ onChanged }: { onChanged: () => void }) {
  const a = useAction(onChanged);
  const [name, setName] = useState('');
  const [state, setState] = useState('');
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        a.mutate(
          {
            path: '/backoffice/areas',
            body: { name: name.trim(), state: state.trim() },
            ok: 'Area added',
          },
          {
            onSuccess: () => {
              setName('');
              setState('');
            },
          },
        );
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New area, e.g. Bengaluru"
      />
      <input value={state} onChange={(e) => setState(e.target.value)} placeholder="State" />
      <button className="btn small primary" disabled={!name.trim() || !state.trim() || a.isPending}>
        Add area
      </button>
      {a.error ? <span className="error">{errorText(a.error)}</span> : null}
    </form>
  );
}

function NewState({ onChanged }: { onChanged: () => void }) {
  const a = useAction(onChanged);
  const [state, setState] = useState('');
  const [prefixes, setPrefixes] = useState('');
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        a.mutate(
          {
            path: '/backoffice/states',
            body: { state: state.trim(), pincode_prefixes: parseList(prefixes) },
            ok: 'State added',
          },
          {
            onSuccess: () => {
              setState('');
              setPrefixes('');
            },
          },
        );
      }}
    >
      <input value={state} onChange={(e) => setState(e.target.value)} placeholder="New state" />
      <input
        value={prefixes}
        onChange={(e) => setPrefixes(e.target.value)}
        placeholder="PIN prefixes, e.g. 50"
      />
      <button className="btn small primary" disabled={!state.trim() || a.isPending}>
        Add state
      </button>
      {a.error ? <span className="error">{errorText(a.error)}</span> : null}
    </form>
  );
}
