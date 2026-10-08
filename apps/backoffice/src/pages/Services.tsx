import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import {
  SERVICE_CATEGORY_LABELS,
  SERVICE_FULFILMENT_LABELS,
  SERVICE_REACH_LABELS,
  type StaffService,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { rupees } from '../lib/format';
import { useRequestList } from '../lib/lists';
import { useUrlState } from '../lib/params';
import { DataTable, type Column } from '../ui/DataTable';
import { Tiles } from '../ui/Tiles';
import { useCoverage } from './Coverage';

export const useServices = () =>
  useQuery({
    queryKey: ['bo-services'],
    queryFn: () => api<StaffService[]>('/backoffice/services'),
  });

/** What customers can request: price, delivery and where it reaches. Click one to configure it. */
export function Services() {
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
      </div>
      <ServiceList />
    </div>
  );
}

function ServiceList() {
  const navigate = useNavigate();
  const [params, set] = useUrlState();
  const view = params.get('view') ?? 'all';
  const { data, error, isPending } = useServices();
  const requests = useRequestList();
  const coverage = useCoverage();
  const where = (s: StaffService) => {
    const c = coverage.data;
    if (s.reach === 'everywhere' || !c) return SERVICE_REACH_LABELS[s.reach];
    const n =
      s.reach === 'area'
        ? c.areas.filter((a) => a.is_active).length
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
      header: '#',
      align: 'right',
      sort: (s) => s.sort_order,
      render: (s) => <span className="sub">{s.sort_order}</span>,
    },
    {
      key: 'name',
      header: 'Service',
      sort: (s) => s.name,
      render: (s) => (
        <>
          {s.name}
          <span className="sub">{SERVICE_CATEGORY_LABELS[s.category]}</span>
        </>
      ),
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
      sort: (s) => s.price_paise,
      render: (s) => (
        <>
          {s.price_paise === null ? 'On quote' : rupees(s.price_paise)}
          <span className="sub">{s.is_extra_available ? 'Can be bought' : 'Plan only'}</span>
        </>
      ),
      csv: (s) => (s.price_paise === null ? '' : s.price_paise / 100),
    },
    {
      key: 'reach',
      header: 'Where',
      sort: (s) => s.reach,
      render: (s) => where(s),
      csv: (s) => where(s),
    },
    {
      key: 'days',
      header: 'Usual days',
      align: 'right',
      sort: (s) => s.expected_days,
      render: (s) => s.expected_days ?? '—',
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
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(s) => s.id}
        onRowClick={(s) => void navigate(`/services/${s.id}`)}
        searchText={(s) => `${s.name} ${s.code} ${s.description}`}
        searchPlaceholder="Search services"
        defaultSort={{ key: 'order', dir: 'asc' }}
        exportName="services"
        loading={isPending}
        error={error ? errorText(error) : null}
        toolbar={
          <button className="btn small primary" onClick={() => void navigate('/services/new')}>
            Add a service
          </button>
        }
      />
    </>
  );
}
