import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
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
import { Coverage } from './Coverage';

export const useServices = () =>
  useQuery({
    queryKey: ['bo-services'],
    queryFn: () => api<StaffService[]>('/backoffice/services'),
  });

/** What we offer (services) and where we can deliver it (areas, states, demand). */
export function Services() {
  const [params, set] = useUrlState();
  const tab = params.get('tab') === 'coverage' ? 'coverage' : 'services';
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Services &amp; coverage</h1>
          <p>
            {tab === 'services'
              ? 'What customers can request, its price and how it is delivered. Click a service to configure it.'
              : 'Where our team can visit, and where people are waiting for us.'}
          </p>
        </div>
        <div className="tabs" role="group" aria-label="View">
          <button aria-pressed={tab === 'services'} onClick={() => set({ tab: null })}>
            Services
          </button>
          <button aria-pressed={tab === 'coverage'} onClick={() => set({ tab: 'coverage' })}>
            Coverage
          </button>
        </div>
      </div>
      {tab === 'services' ? <ServiceList /> : <Coverage />}
    </div>
  );
}

function ServiceList() {
  const navigate = useNavigate();
  const [params, set] = useUrlState();
  const view = params.get('view') ?? 'all';
  const { data, error, isPending } = useServices();
  const requests = useRequestList();
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
      render: (s) => SERVICE_REACH_LABELS[s.reach],
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
