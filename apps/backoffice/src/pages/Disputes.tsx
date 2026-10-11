import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import type { DisputeItem, DisputeReview } from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { date } from '../lib/format';
import { useEscape } from '../ui/useEscape';
import { useUrlState } from '../lib/params';
import { Feedback, useAction } from '../ui/action';
import { DataTable, type Column } from '../ui/DataTable';

const ABOUT: Record<DisputeItem['about'], string> = {
  this_project: 'This project',
  this_land: 'This land',
  developer_elsewhere: 'Developer, elsewhere',
  area_general: 'The area',
};

const useDisputes = (status: string) =>
  useQuery({
    queryKey: ['bo-disputes', status],
    queryFn: () => api<DisputeReview[]>(`/backoffice/disputes?status=${status}`),
  });

/**
 * Court cases and disputes Pittu found online about a property's project or
 * land. Nothing reaches the owner until the team keeps or dismisses each
 * item and shares them (all dismissed → the owner is told nothing was found).
 */
export function Disputes({ status }: { status: 'in_review' | 'shared' | 'clear' }) {
  const [params, set] = useUrlState();
  const selected = params.get('property');
  const { data, error, isPending } = useDisputes(status);
  const close = () => set({ property: null });
  const columns: Column<DisputeReview>[] = [
    {
      key: 'property',
      header: 'Property',
      sort: (d) => d.property_name,
      render: (d) => d.property_name,
    },
    {
      key: 'items',
      header: 'Found',
      align: 'right',
      sort: (d) => d.items.length,
      render: (d) => d.items.length || '—',
    },
    {
      key: 'open',
      header: 'To review',
      align: 'right',
      sort: (d) => d.items.filter((i) => i.review === 'open').length,
      render: (d) => d.items.filter((i) => i.review === 'open').length || '—',
    },
    {
      key: 'checked',
      header: 'Checked',
      sort: (d) => d.checked_at,
      render: (d) => date(d.checked_at),
    },
  ];
  return (
    <DataTable
      rows={data}
      columns={columns}
      rowKey={(d) => d.property_id}
      selected={selected}
      onRowClick={(d) => set({ property: d.property_id })}
      onClose={close}
      detail={
        selected && data?.some((d) => d.property_id === selected) ? (
          <DisputePane d={data.find((x) => x.property_id === selected)!} onClose={close} />
        ) : null
      }
      searchText={(d) => d.property_name}
      searchPlaceholder="Search property"
      defaultSort={{ key: 'checked', dir: 'desc' }}
      exportName="disputes"
      loading={isPending}
      error={error ? errorText(error) : null}
      empty={
        status === 'in_review'
          ? 'Nothing waiting — Pittu found no disputes to review.'
          : 'None here.'
      }
    />
  );
}

function DisputePane({ d, onClose }: { d: DisputeReview; onClose: () => void }) {
  useEscape(onClose);
  const qc = useQueryClient();
  const a = useAction(() => void qc.invalidateQueries({ queryKey: ['bo-disputes'] }));
  const [note, setNote] = useState<string | null>(null);
  const locked = d.status !== 'in_review';
  const open = d.items.filter((i) => i.review === 'open').length;
  const review = (url: string, r: 'kept' | 'dismissed') =>
    a.mutate({
      path: `/backoffice/disputes/${d.property_id}`,
      method: 'PATCH',
      body: { reviews: [{ url, review: r }] },
      ok: r === 'kept' ? 'Kept for the owner' : 'Dismissed',
    });
  return (
    <div className="customer">
      <header className="ticket-head">
        <div>
          <h2>{d.property_name}</h2>
          <span className="sub">
            Pittu checked {date(d.checked_at)}
            {d.pittu_note ? ` · ${d.pittu_note}` : ''}
          </span>
        </div>
      </header>
      <div className="row">
        <Link to={`/customers?id=${d.account_id}&property=${d.property_id}`}>
          Open the property
        </Link>
        <button
          className="btn small"
          onClick={() =>
            a.mutate({
              path: `/backoffice/properties/${d.property_id}/disputes`,
              ok: 'Pittu is checking again — refresh in a minute',
            })
          }
        >
          Check again
        </button>
      </div>
      <Feedback a={a} />
      <div className="sections">
        {d.items.map((i) => (
          <div key={i.url} className="card-block">
            <span className="sub">
              {ABOUT[i.about]} · {i.source_kind} · {i.status}
              {i.date ? ` · ${i.date}` : ''}
            </span>
            <b>{i.summary}</b>
            <a href={i.url} target="_blank" rel="noreferrer">
              {i.title}
            </a>
            <div className="row">
              {i.review === 'open' && !locked ? (
                <>
                  <button className="btn small primary" onClick={() => review(i.url, 'kept')}>
                    Keep — it’s about this property
                  </button>
                  <button className="btn small" onClick={() => review(i.url, 'dismissed')}>
                    Dismiss — not this property
                  </button>
                </>
              ) : (
                <span className="badge">
                  {i.review === 'kept' ? 'Kept' : i.review === 'dismissed' ? 'Dismissed' : 'Open'}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {!locked ? (
        <div className="donext">
          <h3>{open ? `Review ${open} item${open > 1 ? 's' : ''}` : 'Share with the owner'}</h3>
          <span className="sub">
            Open each page and decide. Kept items are shown to the owner with your note; if you
            dismiss everything, the owner is told nothing was found online.
          </span>
          <textarea
            value={note ?? d.note ?? ''}
            placeholder="A plain note for the owner: what this is, whether it affects their flat, and what we suggest."
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="row">
            <button
              className="btn primary"
              disabled={open > 0}
              onClick={() =>
                a.mutate({
                  path: `/backoffice/disputes/${d.property_id}`,
                  method: 'PATCH',
                  body: { note: (note ?? d.note ?? '').trim() || null, share: true },
                  ok: 'Shared with the owner',
                })
              }
            >
              Share with the owner
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
