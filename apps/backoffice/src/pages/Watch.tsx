import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { WATCH_CATEGORY_LABELS, type WatchItem, type WatchPlace } from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { dateTime, relative } from '../lib/format';
import { useUrlState } from '../lib/params';
import { Feedback, useAction } from '../ui/action';
import { DataTable, type Column } from '../ui/DataTable';
import { Tiles } from '../ui/Tiles';

const IMPACT_TONES = { positive: 'good', negative: 'bad', neutral: '' } as const;

/** Pittu Watch: local news per place — Pittu reads, the team approves, owners see. */
export function Watch() {
  const [params, set] = useUrlState();
  const tab = params.get('tab') ?? 'pending';
  const place = params.get('place') ?? '';
  const qc = useQueryClient();
  const places = useQuery({
    queryKey: ['bo-watch-places'],
    queryFn: () => api<WatchPlace[]>('/backoffice/watch/places'),
  });
  const review = tab === 'places' ? null : tab;
  const items = useQuery({
    queryKey: ['bo-watch-items', review, place],
    enabled: review !== null,
    queryFn: () =>
      api<WatchItem[]>(`/backoffice/watch/items?review=${review}${place ? `&place=${place}` : ''}`),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['bo-watch-items'] });
    void qc.invalidateQueries({ queryKey: ['bo-watch-places'] });
  };
  const pending = places.data?.reduce((n, p) => n + p.items_pending, 0);
  const approved = places.data?.reduce((n, p) => n + p.items_approved, 0);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Pittu Watch</h1>
          <p>
            News near customers' properties. Each day Pittu collects stories that name a locality
            (city news feeds and an open news index), reads them, and filters out what isn't
            relevant. The team approves what owners see.
          </p>
        </div>
      </div>
      <Tiles
        value={tab}
        onChange={(v) => set({ tab: v })}
        tiles={[
          {
            value: 'pending',
            label: 'To review',
            count: pending ?? '–',
            tone: pending ? 'warn' : '',
          },
          { value: 'approved', label: 'Approved', count: approved ?? '–', tone: 'good' },
          { value: 'rejected', label: 'Filtered out or rejected', count: '·' },
          { value: 'places', label: 'Places watched', count: places.data?.length ?? '–' },
        ]}
      />
      {tab === 'places' ? (
        <Places rows={places.data} loading={places.isPending} onChanged={refresh} />
      ) : (
        <>
          <div className="row">
            <select
              value={place}
              onChange={(e) => set({ place: e.target.value || null })}
              aria-label="Place"
            >
              <option value="">All places</option>
              {places.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {items.isPending ? <div className="empty">Loading…</div> : null}
          {items.error ? <div className="empty error">{errorText(items.error)}</div> : null}
          {items.data && items.data.length === 0 ? (
            <div className="empty">
              {tab === 'pending' ? 'Nothing to review.' : 'Nothing here.'}
            </div>
          ) : null}
          <div className="sections">
            {items.data?.map((i) => (
              <NewsCard key={i.id} item={i} onChanged={refresh} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function NewsCard({ item, onChanged }: { item: WatchItem; onChanged: () => void }) {
  const [summary, setSummary] = useState(item.summary ?? '');
  const a = useAction(onChanged);
  const decide = (review: WatchItem['review']) =>
    a.mutate({
      path: `/backoffice/watch/items/${item.id}/review`,
      body: { review, ...(review === 'approved' ? { summary: summary.trim() } : {}) },
      ok:
        review === 'approved'
          ? 'Approved — owners there will see it'
          : review === 'rejected'
            ? 'Rejected'
            : 'Back to review',
    });
  return (
    <div
      className={`finding ${item.impact === 'negative' ? 'red' : item.impact === 'positive' ? '' : 'amber'}`}
    >
      <div className="row between">
        <a href={item.url} target="_blank" rel="noreferrer" className="strong">
          {item.title}
        </a>
        <span className="sub">
          {item.place_name} · {item.domain ?? 'source'} ·{' '}
          {item.published_at ? relative(item.published_at) : ''}
        </span>
      </div>
      {item.snippet ? <span className="sub">{item.snippet}</span> : null}
      <div className="row">
        {item.category ? (
          <span className="badge">{WATCH_CATEGORY_LABELS[item.category]}</span>
        ) : null}
        {item.impact ? (
          <span className={`badge ${IMPACT_TONES[item.impact]}`}>{item.impact}</span>
        ) : null}
        {item.ai_status === 'new' ? (
          <span className="badge warn">Not read by Pittu yet</span>
        ) : null}
        {item.relevant === false ? <span className="badge">Pittu: not relevant</span> : null}
        {item.ai_confidence ? (
          <span className="sub">Pittu is {item.ai_confidence} confidence</span>
        ) : null}
      </div>
      <div className="row">
        <input
          className="grow"
          value={summary}
          maxLength={300}
          placeholder="One plain line for the owner"
          onChange={(e) => setSummary(e.target.value)}
        />
        {item.review !== 'approved' ? (
          <button
            className="btn small primary"
            disabled={!summary.trim() || a.isPending}
            onClick={() => decide('approved')}
          >
            Approve
          </button>
        ) : null}
        {item.review !== 'rejected' ? (
          <button className="btn small" disabled={a.isPending} onClick={() => decide('rejected')}>
            Reject
          </button>
        ) : null}
        {item.review !== 'pending' ? (
          <button className="link" disabled={a.isPending} onClick={() => decide('pending')}>
            Back to review
          </button>
        ) : null}
      </div>
      {item.reviewed_at ? <span className="sub">Reviewed {dateTime(item.reviewed_at)}</span> : null}
      <Feedback a={a} />
    </div>
  );
}

function Places({
  rows,
  loading,
  onChanged,
}: {
  rows: WatchPlace[] | undefined;
  loading: boolean;
  onChanged: () => void;
}) {
  const a = useAction(onChanged);
  const cols: Column<WatchPlace>[] = [
    {
      key: 'name',
      header: 'Place',
      sort: (p) => p.name,
      render: (p) => (
        <>
          <button
            className="link"
            title="Rename: stories must mention this name"
            onClick={(e) => {
              e.stopPropagation();
              const n = window.prompt(
                'Name as the news writes it (stories must mention it)',
                p.name,
              );
              if (n && n.trim() !== p.name)
                a.mutate({
                  path: `/backoffice/watch/places/${p.id}`,
                  method: 'PATCH',
                  body: { name: n.trim() },
                  ok: 'Renamed',
                });
            }}
          >
            {p.name}
          </button>
          <span className="sub">
            {p.district}, {p.state} · PIN {p.pincodes.join(', ')}
          </span>
        </>
      ),
    },
    {
      key: 'props',
      header: 'Properties',
      align: 'right',
      sort: (p) => p.properties,
      render: (p) => p.properties,
    },
    {
      key: 'pending',
      header: 'To review',
      align: 'right',
      sort: (p) => p.items_pending,
      render: (p) => p.items_pending || '—',
    },
    {
      key: 'approved',
      header: 'Approved',
      align: 'right',
      sort: (p) => p.items_approved,
      render: (p) => p.items_approved || '—',
    },
    {
      key: 'last',
      header: 'Last collected',
      sort: (p) => p.last_collected_at,
      render: (p) => (p.last_collected_at ? relative(p.last_collected_at) : 'Never'),
    },
    {
      key: 'query',
      header: 'News search',
      sort: (p) => p.query,
      render: (p) => (
        <button
          className="link"
          onClick={(e) => {
            e.stopPropagation();
            const q = window.prompt(
              'News search for this place (used with the open news index)',
              p.query,
            );
            if (q && q.trim() !== p.query)
              a.mutate({
                path: `/backoffice/watch/places/${p.id}`,
                method: 'PATCH',
                body: { query: q.trim() },
                ok: 'Search saved',
              });
          }}
        >
          <span className="mono">{p.query}</span>
        </button>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (p) => (
        <div className="row">
          <button
            className="btn small"
            disabled={a.isPending || !p.is_active}
            onClick={(e) => {
              e.stopPropagation();
              a.mutate({
                path: `/backoffice/watch/places/${p.id}/collect`,
                ok: `Collecting news for ${p.name} — check “To review” in a minute`,
              });
            }}
          >
            Collect now
          </button>
          <button
            className="btn small"
            disabled={a.isPending}
            onClick={(e) => {
              e.stopPropagation();
              a.mutate({
                path: `/backoffice/watch/places/${p.id}`,
                method: 'PATCH',
                body: { is_active: !p.is_active },
                ok: p.is_active ? 'Paused' : 'Watching again',
              });
            }}
          >
            {p.is_active ? 'Pause' : 'Watch'}
          </button>
        </div>
      ),
    },
  ];
  return (
    <>
      <Feedback a={a} />
      <DataTable
        rows={rows}
        columns={cols}
        rowKey={(p) => p.id}
        searchText={(p) => `${p.name} ${p.district} ${p.pincodes.join(' ')}`}
        searchPlaceholder="Search places or PIN codes"
        defaultSort={{ key: 'props', dir: 'desc' }}
        exportName="watch-places"
        loading={loading}
        empty="No places yet — create them from customers' properties."
        toolbar={
          <button
            className="btn small primary"
            disabled={a.isPending}
            onClick={() =>
              a.mutate({
                path: '/backoffice/watch/places/sync',
                ok: 'Places updated from customers’ properties',
              })
            }
          >
            Create places from customers' properties
          </button>
        }
      />
      <span className="sub">
        News is collected once a day at 7 am, for places with customers' properties. City feeds are
        matched by the place's name; the news search is used with the open news index.
      </span>
    </>
  );
}
