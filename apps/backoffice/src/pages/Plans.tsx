import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { BILLING_PERIOD_LABELS, type StaffPlan } from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { rupees } from '../lib/format';
import { useUrlState } from '../lib/params';
import { Feedback, useAction } from '../ui/action';
import { DataTable, type Column } from '../ui/DataTable';
import { Reorder } from '../ui/Reorder';
import { Tiles } from '../ui/Tiles';

export const usePlansConsole = () =>
  useQuery({
    queryKey: ['bo-plans'],
    queryFn: () => api<StaffPlan[]>('/backoffice/plans'),
  });

/** Where a plan stands for customers, in one word. */
export function planState(p: StaffPlan): { label: string; tone: string } {
  if (!p.is_active) return { label: 'Switched off', tone: '' };
  if (p.code === 'trial') return { label: 'Free Trial', tone: 'info' };
  return p.is_public ? { label: 'On sale', tone: 'good' } : { label: 'Not on sale', tone: 'warn' };
}

/** What we sell: every plan, its current price and benefits, and who is on it. */
export function Plans() {
  const navigate = useNavigate();
  const [params, set] = useUrlState();
  const view = params.get('view') ?? 'all';
  const { data, error, isPending } = usePlansConsole();
  const qc = useQueryClient();
  const [ordering, setOrdering] = useState(false);
  const a = useAction(() => {
    setOrdering(false);
    void qc.invalidateQueries({ queryKey: ['bo-plans'] });
    void qc.invalidateQueries({ queryKey: ['plans'] });
  });
  const ordered = [...(data ?? [])].sort((x, y) => x.sort_order - y.sort_order);
  const position = new Map(ordered.map((p, i) => [p.id, i + 1]));
  const views = {
    all: () => true,
    sale: (p: StaffPlan) => p.is_active && p.is_public,
    hidden: (p: StaffPlan) => p.is_active && !p.is_public,
    off: (p: StaffPlan) => !p.is_active,
  };
  const count = (k: keyof typeof views) => data?.filter(views[k]).length ?? '–';
  const rows = data?.filter(views[view as keyof typeof views] ?? views.all);

  const columns: Column<StaffPlan>[] = [
    {
      key: 'order',
      header: 'Shown',
      align: 'right',
      sort: (p) => p.sort_order,
      render: (p) => <span className="sub">{position.get(p.id)}</span>,
    },
    {
      key: 'name',
      header: 'Plan',
      sort: (p) => p.name,
      render: (p) => (
        <>
          {p.name}
          <span className="sub mono">{p.code}</span>
        </>
      ),
    },
    {
      key: 'state',
      header: 'For customers',
      sort: (p) => planState(p).label,
      render: (p) => <span className={`badge ${planState(p).tone}`}>{planState(p).label}</span>,
      csv: (p) => planState(p).label,
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      sort: (p) => p.current?.price_paise ?? null,
      render: (p) =>
        p.current ? (
          <>
            {p.current.price_paise ? rupees(p.current.price_paise) : 'Free'}
            <span className="sub">{BILLING_PERIOD_LABELS[p.current.billing_period]}</span>
          </>
        ) : (
          '—'
        ),
      csv: (p) => (p.current ? p.current.price_paise / 100 : ''),
    },
    {
      key: 'term',
      header: 'Term',
      align: 'right',
      sort: (p) => p.current?.term_days ?? null,
      render: (p) => (p.current ? `${p.current.term_days} days` : '—'),
    },
    {
      key: 'properties',
      header: 'Properties',
      align: 'right',
      sort: (p) => p.current?.benefits.limits.max_properties ?? null,
      render: (p) => p.current?.benefits.limits.max_properties ?? 'No limit',
    },
    {
      key: 'included',
      header: 'Included services',
      sort: (p) => p.current?.benefits.included.length ?? 0,
      render: (p) =>
        p.current?.benefits.included.length
          ? p.current.benefits.included
              .map((i) => `${i.quantity} × ${i.code.replace(/_/g, ' ')}`)
              .join(', ')
          : '—',
    },
    {
      key: 'customers',
      header: 'Customers now',
      align: 'right',
      sort: (p) => p.customers_now,
      render: (p) => p.customers_now,
    },
    {
      key: 'version',
      header: 'Version',
      align: 'right',
      sort: (p) => p.current?.version ?? null,
      render: (p) => (p.current ? `v${p.current.version}` : '—'),
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Plans</h1>
          <p>
            What customers can buy, at what price, and what each plan includes. Click a plan to
            change it.
          </p>
        </div>
      </div>
      <Tiles
        value={view}
        onChange={(v) => set({ view: v })}
        tiles={[
          { value: 'all', label: 'All plans', count: count('all') },
          { value: 'sale', label: 'On sale', count: count('sale'), tone: 'good' },
          { value: 'hidden', label: 'Not on sale', count: count('hidden') },
          { value: 'off', label: 'Switched off', count: count('off') },
        ]}
      />
      <Feedback a={a} />
      {ordering ? (
        <section className="section">
          <div className="section-body">
            <Reorder
              items={ordered}
              itemKey={(p) => p.id}
              render={(p) => p.name}
              busy={a.isPending}
              onSave={(ids) =>
                a.mutate({ path: '/backoffice/plans/order', body: { ids }, ok: 'Order saved' })
              }
              onCancel={() => setOrdering(false)}
            />
          </div>
        </section>
      ) : null}
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(p) => p.id}
        onRowClick={(p) => void navigate(`/plans/${p.id}`)}
        searchText={(p) => `${p.name} ${p.code} ${p.description}`}
        searchPlaceholder="Search plans"
        defaultSort={{ key: 'order', dir: 'asc' }}
        exportName="plans"
        loading={isPending}
        error={error ? errorText(error) : null}
        toolbar={
          <>
            <button className="btn small primary" onClick={() => void navigate('/plans/new')}>
              Add a plan
            </button>
            <button
              className="btn small"
              disabled={!data?.length}
              onClick={() => setOrdering(true)}
            >
              Change order
            </button>
          </>
        }
      />
    </div>
  );
}
