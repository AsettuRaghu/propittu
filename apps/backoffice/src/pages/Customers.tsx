import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { formatIndianMobile, type BackofficeAccount } from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { date, relative } from '../lib/format';
import { useUrlState } from '../lib/params';
import { DataTable, type Column } from '../ui/DataTable';
import { Tiles } from '../ui/Tiles';
import { CustomerPanel } from './CustomerPanel';

const SOURCE = { trial: 'Free Trial', payment: 'Paid', staff: 'Given by the team' } as const;

/** Every customer (newest 500): tiles by plan, a searchable table, the customer beside it. */
export function Customers() {
  const [params, set] = useUrlState();
  const view = params.get('view') ?? 'all';
  const selected = params.get('id');
  const [now] = useState(() => Date.now());
  const { data, error, isPending } = useQuery({
    queryKey: ['bo-accounts'],
    queryFn: () => api<BackofficeAccount[]>('/backoffice/accounts'),
  });

  const ending = (a: BackofficeAccount) =>
    !!a.plan_ends_at &&
    Date.parse(a.plan_ends_at) > now &&
    Date.parse(a.plan_ends_at) - now < 7 * 86_400_000;
  const views = {
    all: () => true,
    trial: (a: BackofficeAccount) => a.plan_source === 'trial',
    payment: (a: BackofficeAccount) => a.plan_source === 'payment',
    staff: (a: BackofficeAccount) => a.plan_source === 'staff',
    none: (a: BackofficeAccount) => !a.plan_code,
    ending,
    requests: (a: BackofficeAccount) => a.open_request_count > 0,
    suspended: (a: BackofficeAccount) => a.status !== 'active',
  };
  const count = (k: keyof typeof views) => data?.filter(views[k]).length ?? '–';
  const plans = [...new Set(data?.flatMap((a) => (a.plan_name ? [a.plan_name] : [])))].sort();
  const plan = params.get('plan') ?? '';
  const rows = data
    ?.filter(views[view as keyof typeof views] ?? views.all)
    .filter((a) => !plan || a.plan_name === plan);

  const columns: Column<BackofficeAccount>[] = [
    {
      key: 'name',
      header: 'Customer',
      sort: (a) => a.full_name ?? '',
      render: (a) => (
        <>
          {a.full_name || '—'}
          <span className="sub">{a.phone ? formatIndianMobile(a.phone) : ''}</span>
        </>
      ),
      csv: (a) => `${a.full_name ?? ''} ${a.phone ?? ''}`.trim(),
    },
    {
      key: 'plan',
      header: 'Plan',
      sort: (a) => a.plan_name ?? '',
      render: (a) => (
        <>
          {a.plan_name ?? <span className="sub">No plan</span>}
          <span className="sub">{a.plan_source ? SOURCE[a.plan_source] : ''}</span>
        </>
      ),
      csv: (a) => a.plan_name ?? '',
    },
    {
      key: 'ends',
      header: 'Plan ends',
      sort: (a) => a.plan_ends_at,
      render: (a) =>
        a.plan_ends_at ? (
          <span className={ending(a) ? 'warn-text' : ''}>
            {date(a.plan_ends_at)}
            <span className="sub">{relative(a.plan_ends_at)}</span>
          </span>
        ) : (
          '—'
        ),
      csv: (a) => a.plan_ends_at,
    },
    {
      key: 'properties',
      header: 'Properties',
      align: 'right',
      sort: (a) => a.property_count,
      render: (a) => a.property_count,
    },
    {
      key: 'open',
      header: 'Open requests',
      align: 'right',
      sort: (a) => a.open_request_count,
      render: (a) => a.open_request_count || '—',
    },
    {
      key: 'joined',
      header: 'Joined',
      sort: (a) => a.created_at,
      render: (a) => date(a.created_at),
    },
    {
      key: 'status',
      header: 'Status',
      sort: (a) => a.status,
      render: (a) => (
        <span className={`badge ${a.status === 'active' ? 'good' : 'bad'}`}>{a.status}</span>
      ),
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Customers</h1>
          <p>The newest 500. Click a number to filter.</p>
        </div>
      </div>
      <Tiles
        value={view}
        onChange={(v) => set({ view: v, id: null, property: null })}
        tiles={[
          { value: 'all', label: 'All customers', count: count('all') },
          { value: 'trial', label: 'On Free Trial', count: count('trial') },
          { value: 'payment', label: 'Paying', count: count('payment'), tone: 'good' },
          { value: 'staff', label: 'Given by the team', count: count('staff') },
          { value: 'ending', label: 'Plan ends in 7 days', count: count('ending'), tone: 'warn' },
          { value: 'none', label: 'No plan', count: count('none') },
          { value: 'requests', label: 'With open requests', count: count('requests') },
          { value: 'suspended', label: 'Suspended', count: count('suspended'), tone: 'bad' },
        ]}
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(a) => a.id}
        selected={selected}
        onRowClick={(a) => set({ id: a.id, property: null })}
        onClose={() => set({ id: null, property: null, full: null })}
        detail={
          selected ? (
            <CustomerPanel
              id={selected}
              propertyId={params.get('property')}
              openProperty={(property) => set({ property })}
              onClose={() => set({ id: null, property: null, full: null })}
            />
          ) : null
        }
        searchText={(a) => `${a.full_name ?? ''} ${a.phone ?? ''} ${a.id} ${a.plan_name ?? ''}`}
        searchPlaceholder="Search anything: name, phone, plan, account id"
        defaultSort={{ key: 'joined', dir: 'desc' }}
        exportName="customers"
        loading={isPending}
        error={error ? errorText(error) : null}
        empty="No customers here."
        toolbar={
          <select
            value={plan}
            onChange={(e) => set({ plan: e.target.value || null })}
            aria-label="Plan"
          >
            <option value="">All plans</option>
            {plans.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        }
      />
    </div>
  );
}
