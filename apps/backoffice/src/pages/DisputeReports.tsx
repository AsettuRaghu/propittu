import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  DISPUTE_REPORT_SOURCE_LABELS,
  type DisputeReportRow,
  type ProjectDisputeRow,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { date } from '../lib/format';
import { useUrlState } from '../lib/params';
import { Feedback, useAction } from '../ui/action';
import { DataTable, type Column } from '../ui/DataTable';
import { useEscape } from '../ui/useEscape';

const STATUS: Record<DisputeReportRow['status'], string> = {
  open: 'New',
  looking: 'Looking into it',
  confirmed: 'Confirmed',
  not_found: 'No record found',
};

export const useDisputeReports = (status: 'open' | 'all') =>
  useQuery({
    queryKey: ['bo-dispute-reports', status],
    queryFn: () => api<DisputeReportRow[]>(`/backoffice/dispute-reports?status=${status}`),
  });

/**
 * Disputes owners told us about (from the builder, a call, a notice). The
 * team searches the court registers and asks the builder, replies to the
 * owner, and — when it's real — confirms it for the whole project so every
 * owner there is told.
 */
export function DisputeReports() {
  const [params, set] = useUrlState();
  const selected = params.get('report');
  const { data, error, isPending } = useDisputeReports('all');
  const close = () => set({ report: null });
  const columns: Column<DisputeReportRow>[] = [
    {
      key: 'property',
      header: 'Property',
      sort: (r) => r.property_name,
      render: (r) => (
        <>
          {r.property_name}
          <span className="sub">{r.project_name ?? ''}</span>
        </>
      ),
    },
    {
      key: 'source',
      header: 'Heard from',
      sort: (r) => r.source,
      render: (r) => DISPUTE_REPORT_SOURCE_LABELS[r.source],
    },
    {
      key: 'status',
      header: 'Status',
      sort: (r) => r.status,
      render: (r) => <span className="badge">{STATUS[r.status]}</span>,
    },
    {
      key: 'when',
      header: 'Reported',
      sort: (r) => r.created_at,
      render: (r) => date(r.created_at),
    },
  ];
  return (
    <DataTable
      rows={data}
      columns={columns}
      rowKey={(r) => r.id}
      selected={selected}
      onRowClick={(r) => set({ report: r.id })}
      onClose={close}
      detail={
        selected && data?.some((r) => r.id === selected) ? (
          <ReportPane r={data.find((x) => x.id === selected)!} onClose={close} />
        ) : null
      }
      searchText={(r) => `${r.property_name} ${r.project_name ?? ''} ${r.details}`}
      searchPlaceholder="Search property, project or what they said"
      defaultSort={{ key: 'when', dir: 'desc' }}
      exportName="dispute-reports"
      loading={isPending}
      error={error ? errorText(error) : null}
      empty="No reports from owners yet."
    />
  );
}

function ReportPane({ r, onClose }: { r: DisputeReportRow; onClose: () => void }) {
  useEscape(onClose);
  const qc = useQueryClient();
  const a = useAction(() => {
    void qc.invalidateQueries({ queryKey: ['bo-dispute-reports'] });
    void qc.invalidateQueries({ queryKey: ['bo-project-disputes'] });
  });
  const [note, setNote] = useState(r.staff_note ?? '');
  const [confirming, setConfirming] = useState(false);
  const [f, setF] = useState({
    project_name: r.project_name ?? '',
    district: '',
    summary: '',
    what_it_means: '',
    what_to_do: '',
    source_url: '',
  });
  const reply = (status: 'looking' | 'not_found') =>
    a.mutate({
      path: `/backoffice/dispute-reports/${r.id}`,
      method: 'PATCH',
      body: { status, staff_note: note.trim() || null },
      ok:
        status === 'looking'
          ? 'The owner sees: our team is looking into it'
          : 'Reply sent: no record found',
    });
  const blank = (s: string) => s.trim() || null;
  return (
    <div className="customer">
      <header className="ticket-head">
        <div>
          <h2>{r.property_name}</h2>
          <span className="sub">
            {r.project_name ? `${r.project_name} · ` : ''}
            {DISPUTE_REPORT_SOURCE_LABELS[r.source]} · {date(r.created_at)}
          </span>
        </div>
        <span className="badge">{STATUS[r.status]}</span>
      </header>
      <Link to={`/customers?id=${r.account_id}&property=${r.property_id}`}>Open the property</Link>
      <div className="card-block">
        <h3>What the owner heard</h3>
        <p>{r.details}</p>
      </div>
      <div className="card-block">
        <h3>Reply to the owner</h3>
        <textarea
          value={note}
          placeholder="What we did and found — e.g. “We searched the Bengaluru city civil court registers for the project land and asked the builder. …”"
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="row">
          <button className="btn small" onClick={() => reply('looking')}>
            Looking into it
          </button>
          <button className="btn small" onClick={() => reply('not_found')}>
            No record found
          </button>
          <button className="btn small primary" onClick={() => setConfirming(true)}>
            It’s real — tell everyone in the project
          </button>
        </div>
      </div>
      {confirming ? (
        <div className="donext">
          <h3>Confirm it for the whole project</h3>
          <span className="sub">
            Every Propittu owner whose deed names this project sees it on their property. Write it
            plainly; no individual names.
          </span>
          <label>
            Project (as on the deeds)
            <input
              value={f.project_name}
              onChange={(e) => setF({ ...f, project_name: e.target.value })}
            />
          </label>
          <label>
            District (optional — when two projects share a name)
            <input value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} />
          </label>
          <label>
            What it is
            <textarea
              value={f.summary}
              placeholder="A landowner has filed a suit claiming part of the project land; the case is pending in the city civil court."
              onChange={(e) => setF({ ...f, summary: e.target.value })}
            />
          </label>
          <label>
            What it means for owners
            <textarea
              value={f.what_it_means}
              onChange={(e) => setF({ ...f, what_it_means: e.target.value })}
            />
          </label>
          <label>
            What to do
            <textarea
              value={f.what_to_do}
              placeholder="Don’t pay or sign anything for callers; keep your deed and EC ready; we’ll update you when the court hears it."
              onChange={(e) => setF({ ...f, what_to_do: e.target.value })}
            />
          </label>
          <label>
            Link to the record (optional)
            <input
              value={f.source_url}
              onChange={(e) => setF({ ...f, source_url: e.target.value })}
            />
          </label>
          <div className="row">
            <button
              className="btn primary"
              disabled={!f.project_name.trim() || f.summary.trim().length < 5}
              onClick={() =>
                a.mutate({
                  path: '/backoffice/project-disputes',
                  body: {
                    project_name: f.project_name.trim(),
                    district: blank(f.district),
                    summary: f.summary.trim(),
                    what_it_means: blank(f.what_it_means),
                    what_to_do: blank(f.what_to_do),
                    source_url: blank(f.source_url),
                    report_id: r.id,
                  },
                  ok: 'Confirmed — every owner in the project will see it',
                })
              }
            >
              Tell everyone in the project
            </button>
            <button className="btn small" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      <Feedback a={a} />
    </div>
  );
}

/** Disputes confirmed for a whole project: who they reach, and marking them resolved. */
export function ProjectDisputes() {
  const qc = useQueryClient();
  const { data, error, isPending } = useQuery({
    queryKey: ['bo-project-disputes'],
    queryFn: () => api<ProjectDisputeRow[]>('/backoffice/project-disputes'),
  });
  const a = useAction(() => void qc.invalidateQueries({ queryKey: ['bo-project-disputes'] }));
  const columns: Column<ProjectDisputeRow>[] = [
    {
      key: 'project',
      header: 'Project',
      sort: (p) => p.project_name,
      render: (p) => (
        <>
          {p.project_name}
          <span className="sub">{p.summary}</span>
        </>
      ),
    },
    {
      key: 'reach',
      header: 'Our properties',
      align: 'right',
      sort: (p) => p.properties,
      render: (p) => p.properties,
    },
    {
      key: 'status',
      header: 'Status',
      sort: (p) => p.status,
      render: (p) => <span className="badge">{p.status === 'active' ? 'Active' : 'Resolved'}</span>,
    },
    {
      key: 'updated',
      header: 'Updated',
      sort: (p) => p.updated_at,
      render: (p) => date(p.updated_at),
    },
    {
      key: 'act',
      header: '',
      render: (p) => (
        <button
          className="btn small"
          onClick={(e) => {
            e.stopPropagation();
            a.mutate({
              path: `/backoffice/project-disputes/${p.id}`,
              method: 'PATCH',
              body: { status: p.status === 'active' ? 'resolved' : 'active' },
              ok:
                p.status === 'active'
                  ? 'Marked resolved — owners see it as resolved'
                  : 'Active again',
            });
          }}
        >
          {p.status === 'active' ? 'Mark resolved' : 'Reopen'}
        </button>
      ),
    },
  ];
  return (
    <>
      <Feedback a={a} />
      <DataTable
        rows={data}
        columns={columns}
        rowKey={(p) => p.id}
        searchText={(p) => `${p.project_name} ${p.summary}`}
        searchPlaceholder="Search project"
        defaultSort={{ key: 'updated', dir: 'desc' }}
        exportName="project-disputes"
        loading={isPending}
        error={error ? errorText(error) : null}
        empty="No project-wide disputes."
      />
    </>
  );
}
