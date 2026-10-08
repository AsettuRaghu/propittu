import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  SERVICE_FULFILMENT_LABELS,
  SERVICE_REACH_LABELS,
  type StaffService,
  type StaffServiceCategory,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { rupees } from '../lib/format';
import { useRequestList } from '../lib/lists';
import { useUrlState } from '../lib/params';
import { Feedback, useAction } from '../ui/action';
import { DataTable, type Column } from '../ui/DataTable';
import { Reorder } from '../ui/Reorder';
import { Tiles } from '../ui/Tiles';
import { useCoverage } from './Coverage';

export const useServices = () =>
  useQuery({
    queryKey: ['bo-services'],
    queryFn: () => api<StaffService[]>('/backoffice/services'),
  });

export const useCategories = () =>
  useQuery({
    queryKey: ['bo-categories'],
    queryFn: () => api<StaffServiceCategory[]>('/backoffice/service-categories'),
  });

/** How a service is paid for, in words. */
function pricingLabel(s: Pick<StaffService, 'price_paise' | 'is_extra_available'>) {
  if (!s.is_extra_available) return 'Plan only';
  return s.price_paise === null ? 'On quote' : rupees(s.price_paise);
}

/** What customers can request: price, delivery and where it reaches. Click one to configure it. */
export function Services() {
  const [params, set] = useUrlState();
  const tab = params.get('tab') === 'categories' ? 'categories' : 'services';
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Services</h1>
          <p>
            What customers can request, its price and how it is delivered. Where each service
            reaches comes from <Link to="/coverage">Coverage</Link>.
          </p>
        </div>
        <div className="tabs" role="group" aria-label="View">
          <button aria-pressed={tab === 'services'} onClick={() => set({ tab: null })}>
            Services
          </button>
          <button aria-pressed={tab === 'categories'} onClick={() => set({ tab: 'categories' })}>
            Categories
          </button>
        </div>
      </div>
      {tab === 'services' ? <ServiceList /> : <Categories />}
    </div>
  );
}

function ServiceList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, set] = useUrlState();
  const view = params.get('view') ?? 'all';
  const { data, error, isPending } = useServices();
  const categories = useCategories();
  const requests = useRequestList();
  const coverage = useCoverage();
  const [ordering, setOrdering] = useState(false);
  const a = useAction(() => {
    setOrdering(false);
    void qc.invalidateQueries({ queryKey: ['bo-services'] });
  });
  const catName = (code: string) => categories.data?.find((c) => c.code === code)?.name ?? code;
  const ordered = [...(data ?? [])].sort((x, y) => x.sort_order - y.sort_order);
  const position = new Map(ordered.map((s, i) => [s.id, i + 1]));
  const where = (s: StaffService) => {
    const c = coverage.data;
    if (s.reach === 'everywhere' || !c) return SERVICE_REACH_LABELS[s.reach];
    const n =
      s.reach === 'area'
        ? c.areas.filter((x) => x.is_active).length
        : c.states.filter((x) => x.is_active).length;
    return `${SERVICE_REACH_LABELS[s.reach]} · ${n} live`;
  };
  const open = (id: string) =>
    requests.data?.filter(
      (r) => r.service.id === id && !['completed', 'cancelled'].includes(r.status),
    ).length ?? 0;
  const views = {
    all: () => true,
    live: (s: StaffService) => s.is_active,
    hidden: (s: StaffService) => !s.is_active,
    visit: (s: StaffService) => s.fulfilment === 'visit',
    assistance: (s: StaffService) => s.fulfilment === 'assistance',
  };
  const count = (k: keyof typeof views) => data?.filter(views[k]).length ?? '–';
  const rows = data?.filter(views[view as keyof typeof views] ?? views.all);

  const columns: Column<StaffService>[] = [
    {
      key: 'order',
      header: 'Shown',
      align: 'right',
      sort: (s) => s.sort_order,
      render: (s) => <span className="sub">{position.get(s.id)}</span>,
    },
    {
      key: 'name',
      header: 'Service',
      sort: (s) => s.name,
      render: (s) => (
        <>
          {s.name}
          <span className="sub">{catName(s.category)}</span>
        </>
      ),
      csv: (s) => s.name,
    },
    {
      key: 'category',
      header: 'Category',
      sort: (s) => catName(s.category),
      render: (s) => catName(s.category),
    },
    {
      key: 'kind',
      header: 'Delivered as',
      sort: (s) => s.fulfilment,
      render: (s) => SERVICE_FULFILMENT_LABELS[s.fulfilment],
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      sort: (s) => (s.is_extra_available ? (s.price_paise ?? -1) : -2),
      render: (s) => pricingLabel(s),
    },
    {
      key: 'reach',
      header: 'Where',
      sort: (s) => s.reach,
      render: (s) => where(s),
      csv: (s) => where(s),
    },
    {
      key: 'open',
      header: 'Open requests',
      align: 'right',
      sort: (s) => open(s.id),
      render: (s) => open(s.id) || '—',
    },
    {
      key: 'live',
      header: 'In the app',
      sort: (s) => (s.is_active ? 1 : 0),
      render: (s) => (
        <span className={`badge ${s.is_active ? 'good' : ''}`}>
          {s.is_active ? 'Live' : 'Hidden'}
        </span>
      ),
      csv: (s) => (s.is_active ? 'Live' : 'Hidden'),
    },
  ];

  if (ordering)
    return (
      <section className="section">
        <div className="section-body">
          <Reorder
            items={ordered}
            itemKey={(s) => s.id}
            render={(s) => (
              <>
                {s.name} <span className="sub inline">· {catName(s.category)}</span>
              </>
            )}
            busy={a.isPending}
            onSave={(ids) =>
              a.mutate({ path: '/backoffice/services/order', body: { ids }, ok: 'Order saved' })
            }
            onCancel={() => setOrdering(false)}
          />
          <span className="sub">
            In the app, services are grouped by category; this sets the order inside each group.
          </span>
          <Feedback a={a} />
        </div>
      </section>
    );

  return (
    <>
      <Tiles
        value={view}
        onChange={(v) => set({ view: v })}
        tiles={[
          { value: 'all', label: 'All services', count: count('all') },
          { value: 'live', label: 'Live in the app', count: count('live'), tone: 'good' },
          { value: 'hidden', label: 'Hidden', count: count('hidden') },
          { value: 'visit', label: 'On-site visits', count: count('visit') },
          { value: 'assistance', label: 'Paperwork help', count: count('assistance') },
        ]}
      />
      <Feedback a={a} />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(s) => s.id}
        onRowClick={(s) => void navigate(`/services/${s.id}`)}
        searchText={(s) => `${s.name} ${s.code} ${s.description} ${catName(s.category)}`}
        searchPlaceholder="Search services"
        defaultSort={{ key: 'order', dir: 'asc' }}
        exportName="services"
        loading={isPending}
        error={error ? errorText(error) : null}
        toolbar={
          <>
            <button className="btn small primary" onClick={() => void navigate('/services/new')}>
              Add a service
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
    </>
  );
}

function Categories() {
  const qc = useQueryClient();
  const { data, error, isPending } = useCategories();
  const [ordering, setOrdering] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const a = useAction(() => {
    setOrdering(false);
    void qc.invalidateQueries({ queryKey: ['bo-categories'] });
    void qc.invalidateQueries({ queryKey: ['bo-services'] });
  });
  const columns: Column<StaffServiceCategory>[] = [
    {
      key: 'order',
      header: 'Shown',
      align: 'right',
      sort: (c) => c.sort_order,
      render: (c) => <span className="sub">{(data?.indexOf(c) ?? 0) + 1}</span>,
    },
    {
      key: 'name',
      header: 'Category',
      sort: (c) => c.name,
      render: (c) => (
        <>
          {c.name}
          <span className="sub mono">{c.code}</span>
        </>
      ),
    },
    {
      key: 'count',
      header: 'Services',
      align: 'right',
      sort: (c) => c.service_count,
      render: (c) => c.service_count,
    },
    {
      key: 'actions',
      header: '',
      render: (c) => (
        <div className="row">
          <button
            className="btn small"
            onClick={() => {
              const next = window.prompt('Category name', c.name);
              if (next?.trim() && next.trim() !== c.name)
                a.mutate({
                  path: `/backoffice/service-categories/${c.code}`,
                  method: 'PATCH',
                  body: { name: next.trim() },
                  ok: 'Renamed',
                });
            }}
          >
            Rename
          </button>
          <button
            className="btn small danger"
            disabled={c.service_count > 0 || a.isPending}
            title={c.service_count > 0 ? 'Move its services to another category first' : undefined}
            onClick={() => {
              if (window.confirm(`Delete the category “${c.name}”?`))
                a.mutate({
                  path: `/backoffice/service-categories/${c.code}`,
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
  if (ordering && data)
    return (
      <section className="section">
        <div className="section-body">
          <Reorder
            items={data}
            itemKey={(c) => c.code}
            render={(c) => c.name}
            busy={a.isPending}
            onSave={(ids) =>
              a.mutate({
                path: '/backoffice/service-categories/order',
                body: { ids },
                ok: 'Order saved',
              })
            }
            onCancel={() => setOrdering(false)}
          />
          <Feedback a={a} />
        </div>
      </section>
    );
  return (
    <>
      <p className="sub">Customers see services grouped under these headings, in this order.</p>
      <Feedback a={a} />
      <DataTable
        rows={data}
        columns={columns}
        rowKey={(c) => c.code}
        defaultSort={{ key: 'order', dir: 'asc' }}
        loading={isPending}
        error={error ? errorText(error) : null}
        toolbar={
          <>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                a.mutate(
                  {
                    path: '/backoffice/service-categories',
                    body: { code: code.trim(), name: name.trim() },
                    ok: 'Category added',
                  },
                  {
                    onSuccess: () => {
                      setCode('');
                      setName('');
                    },
                  },
                );
              }}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="New category, e.g. Construction"
              />
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="code, e.g. construction"
                aria-label="Code (permanent)"
              />
              <button
                className="btn small primary"
                disabled={!code.trim() || !name.trim() || a.isPending}
              >
                Add category
              </button>
            </form>
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
    </>
  );
}
