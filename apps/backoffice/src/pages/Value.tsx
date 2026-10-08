import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  RATE_UNITS,
  RATE_UNIT_LABELS,
  VALUE_KINDS,
  VALUE_KIND_LABELS,
  type PropertyValueRow,
  type RateSource,
  type RateUnit,
  type ValueKind,
  type ValueRate,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { date, rupees } from '../lib/format';
import { useUrlState } from '../lib/params';
import { Feedback, useAction } from '../ui/action';
import { DataTable, type Column } from '../ui/DataTable';
import { Tiles } from '../ui/Tiles';

const inr = (n: number | null) => (n === null ? '—' : `₹${Math.round(n).toLocaleString('en-IN')}`);

/** Pittu Value: government rates (from official documents or added by hand) and each property's value. */
export function Value() {
  const [params, set] = useUrlState();
  const tab = params.get('tab') ?? 'properties';
  const props = useQuery({
    queryKey: ['bo-value-props'],
    queryFn: () => api<PropertyValueRow[]>('/backoffice/value/properties'),
  });
  const sources = useQuery({
    queryKey: ['bo-value-sources'],
    queryFn: () => api<RateSource[]>('/backoffice/value/sources'),
  });
  const valued = props.data?.filter((p) => p.government_value_inr !== null).length;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Pittu Value</h1>
          <p>
            Government values: an official rate (guidance value in Karnataka, market value in
            Telangana) × the property's area. It is the government value, not the market price —
            always shown as such.
          </p>
        </div>
      </div>
      <Tiles
        value={tab}
        onChange={(v) => set({ tab: v, source: null })}
        tiles={[
          {
            value: 'properties',
            label: 'Properties with a value',
            count: props.data ? `${valued} of ${props.data.length}` : '–',
            tone: 'good',
          },
          { value: 'sources', label: 'Rate documents', count: sources.data?.length ?? '–' },
          { value: 'rates', label: 'Rates', count: '·' },
        ]}
      />
      {tab === 'sources' ? (
        <Sources rows={sources.data} loading={sources.isPending} />
      ) : tab === 'rates' ? (
        <Rates />
      ) : (
        <Properties rows={props.data} loading={props.isPending} error={props.error} />
      )}
    </div>
  );
}

function Properties({
  rows,
  loading,
  error,
}: {
  rows: PropertyValueRow[] | undefined;
  loading: boolean;
  error: unknown;
}) {
  const cols: Column<PropertyValueRow>[] = [
    {
      key: 'name',
      header: 'Property',
      sort: (p) => p.property_name,
      render: (p) => (
        <>
          <Link
            to={`/customers?id=${p.account_id}&property=${p.property_id}`}
            onClick={(e) => e.stopPropagation()}
          >
            {p.property_name}
          </Link>
          <span className="sub">{[p.city, p.pincode].filter(Boolean).join(' · ')}</span>
        </>
      ),
    },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      sort: (p) => p.paid_inr,
      render: (p) => (
        <>
          {inr(p.paid_inr)}
          <span className="sub">{p.purchase_date ? date(p.purchase_date) : ''}</span>
        </>
      ),
    },
    {
      key: 'area',
      header: 'Area (sq ft)',
      align: 'right',
      sort: (p) => p.area_sqft,
      render: (p) => p.area_sqft?.toLocaleString('en-IN') ?? '—',
    },
    {
      key: 'paidrate',
      header: 'Paid per sq ft',
      align: 'right',
      sort: (p) => p.paid_per_sqft,
      render: (p) => inr(p.paid_per_sqft),
    },
    {
      key: 'rate',
      header: 'Government rate',
      align: 'right',
      sort: (p) => p.rate?.per_sqft ?? null,
      render: (p) =>
        p.rate ? (
          <>
            {inr(p.rate.per_sqft)}/sq ft
            <span className="sub">
              {p.rate.locality} · by {p.rate.matched_on.replace('_', ' ')}
            </span>
          </>
        ) : (
          '—'
        ),
    },
    {
      key: 'value',
      header: 'Government value',
      align: 'right',
      sort: (p) => p.government_value_inr,
      render: (p) =>
        p.government_value_inr ? (
          <b>{inr(p.government_value_inr)}</b>
        ) : (
          <span className="sub">{p.missing[0] ?? '—'}</span>
        ),
      csv: (p) => p.government_value_inr ?? p.missing.join(' '),
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={cols}
      rowKey={(p) => p.property_id}
      searchText={(p) => `${p.property_name} ${p.city ?? ''} ${p.pincode ?? ''}`}
      searchPlaceholder="Search properties"
      defaultSort={{ key: 'value', dir: 'desc' }}
      exportName="property-values"
      loading={loading}
      error={error ? errorText(error) : null}
      empty="No properties yet."
    />
  );
}

function Sources({ rows, loading }: { rows: RateSource[] | undefined; loading: boolean }) {
  const qc = useQueryClient();
  const [, set] = useUrlState();
  const a = useAction(() => void qc.invalidateQueries({ queryKey: ['bo-value-sources'] }));
  const [form, setForm] = useState({
    state: 'Karnataka',
    district: '',
    office: '',
    title: '',
    effective_from: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const made = await api<{ id: string; upload_url: string }>('/backoffice/value/sources', {
        method: 'POST',
        body: {
          state: form.state.trim(),
          district: form.district.trim(),
          office: form.office.trim() || null,
          title: form.title.trim() || file.name,
          effective_from: form.effective_from || null,
          file_size: file.size,
        },
      });
      const put = await fetch(made.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      await api(`/backoffice/value/sources/${made.id}/confirm`, { method: 'POST' });
      setFile(null);
      void qc.invalidateQueries({ queryKey: ['bo-value-sources'] });
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const cols: Column<RateSource>[] = [
    {
      key: 'title',
      header: 'Document',
      sort: (s) => s.title,
      render: (s) => (
        <>
          {s.title}
          <span className="sub">
            {[s.office, s.district, s.state].filter(Boolean).join(', ')} · from{' '}
            {s.effective_from ? date(s.effective_from) : '?'}
          </span>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Pittu',
      sort: (s) => s.read_status,
      render: (s) =>
        s.upload_status !== 'ready' ? (
          <span className="badge warn">Upload not finished</span>
        ) : s.read_status === 'reading' ? (
          <span className="badge info">Reading…</span>
        ) : s.read_status === 'failed' ? (
          <span className="error">{s.read_error ?? 'Failed'}</span>
        ) : s.read_status === 'read' ? (
          <span className="badge good">{s.rows_found} rows read</span>
        ) : (
          <span className="sub">Not read yet</span>
        ),
    },
    {
      key: 'drafts',
      header: 'To check',
      align: 'right',
      sort: (s) => s.drafts,
      render: (s) => s.drafts || '—',
    },
    {
      key: 'published',
      header: 'Published',
      align: 'right',
      sort: (s) => s.published,
      render: (s) => s.published || '—',
    },
    {
      key: 'actions',
      header: '',
      render: (s) => (
        <div className="row">
          {s.upload_status === 'ready' && s.read_status !== 'reading' ? (
            <button
              className="btn small"
              disabled={a.isPending}
              onClick={(e) => {
                e.stopPropagation();
                a.mutate({
                  path: `/backoffice/value/sources/${s.id}/read`,
                  ok: 'Pittu is reading it — refresh in a minute',
                });
              }}
            >
              {s.read_status === 'read' ? 'Read again' : 'Read with Pittu'}
            </button>
          ) : null}
          {s.drafts ? (
            <>
              <button className="btn small" onClick={() => set({ tab: 'rates', source: s.id })}>
                Check rows
              </button>
              <button
                className="btn small primary"
                disabled={a.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Publish ${s.drafts} rates? They will value properties straight away.`,
                    )
                  )
                    a.mutate({
                      path: `/backoffice/value/sources/${s.id}/publish`,
                      ok: 'Published',
                    });
                }}
              >
                Publish
              </button>
            </>
          ) : null}
        </div>
      ),
    },
  ];
  return (
    <>
      <section className="section">
        <div className="section-head">
          <h2>Add a rate document</h2>
          <span className="sub">
            A government rate table as a PDF, up to about 100 pages — upload the pages for the
            villages you need.
          </span>
        </div>
        <div className="section-body form-grid">
          <label className="field">
            State
            <select
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
            >
              <option>Karnataka</option>
              <option>Telangana</option>
            </select>
          </label>
          <label className="field">
            District (as in the PIN directory, e.g. Bangalore)
            <input
              value={form.district}
              onChange={(e) => setForm({ ...form, district: e.target.value })}
            />
          </label>
          <label className="field">
            Sub-Registrar office (optional)
            <input
              value={form.office}
              onChange={(e) => setForm({ ...form, office: e.target.value })}
            />
          </label>
          <label className="field">
            Rates apply from (optional)
            <input
              type="date"
              value={form.effective_from}
              onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
            />
          </label>
          <label className="field wide">
            Title
            <input
              value={form.title}
              placeholder="e.g. Anekal guidance values 2023"
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <div className="wide row">
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button
              className="btn primary"
              disabled={!file || !form.district.trim() || busy}
              onClick={() => void upload()}
            >
              {busy ? 'Uploading…' : 'Upload'}
            </button>
          </div>
          {err ? <span className="error wide">{err}</span> : null}
        </div>
      </section>
      <Feedback a={a} />
      <DataTable
        rows={rows}
        columns={cols}
        rowKey={(s) => s.id}
        defaultSort={{ key: 'title', dir: 'asc' }}
        loading={loading}
        empty="No rate documents yet."
      />
    </>
  );
}

const blankRate = {
  state: 'Karnataka',
  district: '',
  office: '',
  locality: '',
  pincodes: '',
  survey_numbers: '',
  kind: 'site' as ValueKind,
  rate_inr: '',
  unit: 'sqft' as RateUnit,
  effective_from: '',
};

function Rates() {
  const qc = useQueryClient();
  const [params, set] = useUrlState();
  const status = params.get('status') ?? 'all';
  const source = params.get('source') ?? '';
  const { data, isPending, error } = useQuery({
    queryKey: ['bo-value-rates', status, source],
    queryFn: () =>
      api<ValueRate[]>(
        `/backoffice/value/rates?status=${status}${source ? `&source=${source}` : ''}`,
      ),
  });
  const a = useAction(() => {
    void qc.invalidateQueries({ queryKey: ['bo-value-rates'] });
    void qc.invalidateQueries({ queryKey: ['bo-value-props'] });
    void qc.invalidateQueries({ queryKey: ['bo-value-sources'] });
  });
  const [r, setR] = useState(blankRate);
  const list = (s: string) => s.split(/[\s,;]+/).filter(Boolean);
  const cols: Column<ValueRate>[] = [
    {
      key: 'locality',
      header: 'Locality / village',
      sort: (x) => x.locality,
      render: (x) => (
        <>
          {x.locality}
          <span className="sub">
            {[x.office, x.district, x.state].filter(Boolean).join(', ')}
            {x.survey_numbers.length ? ` · Sy. ${x.survey_numbers.join(', ')}` : ''}
            {x.pincodes.length ? ` · PIN ${x.pincodes.join(', ')}` : ''}
          </span>
        </>
      ),
    },
    { key: 'kind', header: 'Kind', sort: (x) => x.kind, render: (x) => VALUE_KIND_LABELS[x.kind] },
    {
      key: 'rate',
      header: 'Rate',
      align: 'right',
      sort: (x) => x.rate_inr,
      render: (x) => (
        <button
          className="link"
          title="Change the rate"
          onClick={() => {
            const v = window.prompt(`Rate in ₹ ${RATE_UNIT_LABELS[x.unit]}`, String(x.rate_inr));
            const n = Number(v?.replace(/[^0-9.]/g, ''));
            if (v && n > 0 && n !== x.rate_inr)
              a.mutate({
                path: `/backoffice/value/rates/${x.id}`,
                method: 'PATCH',
                body: { rate_inr: n },
                ok: 'Rate changed',
              });
          }}
        >
          {rupees(x.rate_inr * 100)} {RATE_UNIT_LABELS[x.unit]}
        </button>
      ),
      csv: (x) => `${x.rate_inr} ${x.unit}`,
    },
    {
      key: 'from',
      header: 'From',
      sort: (x) => x.effective_from,
      render: (x) => (x.effective_from ? date(x.effective_from) : '—'),
    },
    {
      key: 'page',
      header: 'Page',
      align: 'right',
      sort: (x) => x.page,
      render: (x) => x.page ?? '—',
    },
    {
      key: 'status',
      header: 'Status',
      sort: (x) => x.status,
      render: (x) => (
        <span className={`badge ${x.status === 'published' ? 'good' : 'warn'}`}>
          {x.status === 'published' ? 'Published' : 'To check'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (x) => (
        <div className="row">
          {x.status === 'draft' ? (
            <button
              className="btn small"
              disabled={a.isPending}
              onClick={() =>
                a.mutate({
                  path: `/backoffice/value/rates/${x.id}`,
                  method: 'PATCH',
                  body: { status: 'published' },
                  ok: 'Published',
                })
              }
            >
              Publish
            </button>
          ) : null}
          <button
            className="btn small danger"
            disabled={a.isPending}
            onClick={() => {
              if (window.confirm('Delete this rate?'))
                a.mutate({
                  path: `/backoffice/value/rates/${x.id}`,
                  method: 'DELETE',
                  ok: 'Deleted',
                });
            }}
          >
            Delete
          </button>
        </div>
      ),
    },
  ];
  return (
    <>
      <section className="section">
        <div className="section-head">
          <h2>Add a rate by hand</h2>
          <span className="sub">
            e.g. a Telangana market value looked up for a survey number. Published straight away.
          </span>
        </div>
        <div className="section-body form-grid">
          <label className="field">
            State
            <select value={r.state} onChange={(e) => setR({ ...r, state: e.target.value })}>
              <option>Karnataka</option>
              <option>Telangana</option>
            </select>
          </label>
          <label className="field">
            District
            <input value={r.district} onChange={(e) => setR({ ...r, district: e.target.value })} />
          </label>
          <label className="field">
            Locality / village
            <input value={r.locality} onChange={(e) => setR({ ...r, locality: e.target.value })} />
          </label>
          <label className="field">
            Kind
            <select
              value={r.kind}
              onChange={(e) => setR({ ...r, kind: e.target.value as ValueKind })}
            >
              {VALUE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {VALUE_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Rate in ₹
            <input
              type="number"
              min={0}
              value={r.rate_inr}
              onChange={(e) => setR({ ...r, rate_inr: e.target.value })}
            />
          </label>
          <label className="field">
            Per
            <select
              value={r.unit}
              onChange={(e) => setR({ ...r, unit: e.target.value as RateUnit })}
            >
              {RATE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {RATE_UNIT_LABELS[u]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Survey numbers (optional)
            <input
              value={r.survey_numbers}
              placeholder="e.g. 207/1A, 208"
              onChange={(e) => setR({ ...r, survey_numbers: e.target.value })}
            />
          </label>
          <label className="field">
            PIN codes (optional)
            <input
              value={r.pincodes}
              placeholder="e.g. 562106"
              onChange={(e) => setR({ ...r, pincodes: e.target.value })}
            />
          </label>
          <label className="field">
            Applies from (optional)
            <input
              type="date"
              value={r.effective_from}
              onChange={(e) => setR({ ...r, effective_from: e.target.value })}
            />
          </label>
          <div className="wide">
            <button
              className="btn primary"
              disabled={
                !r.district.trim() || !r.locality.trim() || !Number(r.rate_inr) || a.isPending
              }
              onClick={() =>
                a.mutate(
                  {
                    path: '/backoffice/value/rates',
                    body: {
                      state: r.state,
                      district: r.district.trim(),
                      office: r.office.trim() || null,
                      locality: r.locality.trim(),
                      pincodes: list(r.pincodes),
                      survey_numbers: list(r.survey_numbers),
                      kind: r.kind,
                      rate_inr: Number(r.rate_inr),
                      unit: r.unit,
                      effective_from: r.effective_from || null,
                    },
                    ok: 'Rate added',
                  },
                  { onSuccess: () => setR(blankRate) },
                )
              }
            >
              Add rate
            </button>
          </div>
        </div>
      </section>
      <Feedback a={a} />
      <DataTable
        rows={data}
        columns={cols}
        rowKey={(x) => x.id}
        searchText={(x) =>
          `${x.locality} ${x.district} ${x.office ?? ''} ${x.survey_numbers.join(' ')} ${x.pincodes.join(' ')}`
        }
        searchPlaceholder="Search locality, district, survey no., PIN"
        defaultSort={{ key: 'locality', dir: 'asc' }}
        exportName="value-rates"
        loading={isPending}
        error={error ? errorText(error) : null}
        empty="No rates yet."
        toolbar={
          <>
            <select
              value={status}
              onChange={(e) => set({ status: e.target.value })}
              aria-label="Status"
            >
              <option value="all">Published and to check</option>
              <option value="draft">To check</option>
              <option value="published">Published</option>
            </select>
            {source ? (
              <button className="btn small" onClick={() => set({ source: null })}>
                Showing one document · show all
              </button>
            ) : null}
          </>
        }
      />
    </>
  );
}
