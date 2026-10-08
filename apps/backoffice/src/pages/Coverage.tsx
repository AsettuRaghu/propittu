import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { BackofficeCoverage, ReachDemand, ServiceArea, ServiceState } from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { Feedback, useAction } from '../ui/action';
import { DataTable, type Column } from '../ui/DataTable';

const DEMAND_COLUMNS: Column<ReachDemand>[] = [
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
];

/** Areas (PIN codes our team visits), states (paperwork help), and where demand is. */
export function Coverage() {
  const qc = useQueryClient();
  const { data, error, isPending } = useQuery({
    queryKey: ['bo-coverage'],
    queryFn: () => api<BackofficeCoverage>('/backoffice/coverage'),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['bo-coverage'] });
  if (isPending) return <div className="empty">Loading…</div>;
  if (error) return <div className="empty error">{errorText(error)}</div>;

  return (
    <>
      <section className="section">
        <div className="section-head">
          <h2>Visit areas</h2>
          <span className="sub">
            A property can be visited when its PIN code is in a live area.
          </span>
        </div>
        <div className="section-body stack">
          {data.areas.map((a) => (
            <Area key={a.id} area={a} onChanged={refresh} />
          ))}
          <NewArea onChanged={refresh} />
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Paperwork states</h2>
          <span className="sub">Matched by the first digits of the PIN code.</span>
        </div>
        <div className="section-body stack">
          {data.states.map((s) => (
            <State key={s.state} s={s} onChanged={refresh} />
          ))}
          <NewState onChanged={refresh} />
        </div>
      </section>

      <div className="section-title">
        Waiting for us · properties outside our areas, by PIN code
      </div>
      <DataTable
        rows={data.demand}
        columns={DEMAND_COLUMNS}
        rowKey={(d) => d.pincode ?? 'none'}
        searchText={(d) => `${d.pincode ?? ''} ${d.place ?? ''}`}
        searchPlaceholder="Search PIN code or place"
        defaultSort={{ key: 'properties', dir: 'desc' }}
        exportName="demand"
        empty="No demand outside our areas yet."
      />
    </>
  );
}

function Area({ area, onChanged }: { area: ServiceArea; onChanged: () => void }) {
  const a = useAction(onChanged);
  const [pins, setPins] = useState('');
  const base = `/backoffice/areas/${area.id}`;
  return (
    <div className="item">
      <div className="row between">
        <div>
          <b>{area.name}</b> <span className="sub inline">{area.state}</span>{' '}
          <span className={`badge ${area.is_active ? 'good' : ''}`}>
            {area.is_active ? 'Live' : 'Paused'}
          </span>
        </div>
        <div className="row">
          <button
            className="link"
            onClick={() => {
              const name = window.prompt('Area name', area.name);
              if (name && name.trim() && name.trim() !== area.name)
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
            className="link"
            disabled={a.isPending}
            onClick={() =>
              a.mutate({
                path: base,
                method: 'PATCH',
                body: { is_active: !area.is_active },
                ok: area.is_active ? 'Paused' : 'Live again',
              })
            }
          >
            {area.is_active ? 'Pause' : 'Make live'}
          </button>
        </div>
      </div>
      <div className="pins">
        {area.pincodes.map((p) => (
          <span key={p} className="pin">
            {p}
            <button
              aria-label={`Remove ${p}`}
              disabled={a.isPending}
              onClick={() =>
                a.mutate({ path: `${base}/pincodes/${p}`, method: 'DELETE', ok: `Removed ${p}` })
              }
            >
              ×
            </button>
          </span>
        ))}
        {area.pincodes.length === 0 ? <span className="sub">No PIN codes yet.</span> : null}
      </div>
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
          value={pins}
          onChange={(e) => setPins(e.target.value)}
          placeholder="Add PIN codes, e.g. 560001, 560002"
          aria-label={`Add PIN codes to ${area.name}`}
        />
        <button className="btn" disabled={a.isPending}>
          Add
        </button>
      </form>
      <Feedback a={a} />
    </div>
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
      <button className="btn" disabled={!name.trim() || !state.trim() || a.isPending}>
        Add area
      </button>
      <Feedback a={a} />
    </form>
  );
}

const parsePrefixes = (s: string) => s.split(/[\s,;]+/).filter(Boolean);

function State({ s, onChanged }: { s: ServiceState; onChanged: () => void }) {
  const a = useAction(onChanged);
  const [prefixes, setPrefixes] = useState(s.pincode_prefixes.join(', '));
  const path = `/backoffice/states/${encodeURIComponent(s.state)}`;
  return (
    <div className="item">
      <div className="row between">
        <div>
          <b>{s.state}</b>{' '}
          <span className={`badge ${s.is_active ? 'good' : ''}`}>
            {s.is_active ? 'Live' : 'Paused'}
          </span>
        </div>
        <button
          className="link"
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
          {s.is_active ? 'Pause' : 'Make live'}
        </button>
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          a.mutate({
            path,
            method: 'PATCH',
            body: { pincode_prefixes: parsePrefixes(prefixes) },
            ok: 'PIN prefixes saved',
          });
        }}
      >
        <input
          value={prefixes}
          onChange={(e) => setPrefixes(e.target.value)}
          placeholder="PIN prefixes, e.g. 56, 57, 58"
          aria-label={`PIN prefixes for ${s.state}`}
        />
        <button className="btn" disabled={a.isPending}>
          Save
        </button>
      </form>
      <Feedback a={a} />
    </div>
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
            body: { state: state.trim(), pincode_prefixes: parsePrefixes(prefixes) },
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
      <button className="btn" disabled={!state.trim() || a.isPending}>
        Add state
      </button>
      <Feedback a={a} />
    </form>
  );
}
