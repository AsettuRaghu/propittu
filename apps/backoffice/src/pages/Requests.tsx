import { useState } from 'react';
import {
  OPEN_REQUEST_STATUSES,
  SERVICE_FULFILMENT_LABELS,
  formatIndianMobile,
  requestExpectedBy,
  requestStatusLabel,
  type BackofficeRequest,
  type ServiceRequestStatus,
} from '@propittu/shared';
import { errorText } from '../lib/api';
import { date, relative, rupees } from '../lib/format';
import { useRequestList } from '../lib/lists';
import { useUrlState } from '../lib/params';
import { Age } from '../ui/Age';
import { DataTable, type Column } from '../ui/DataTable';
import { REQUEST_TONES } from '../ui/status';
import { Tiles } from '../ui/Tiles';
import { RequestPanel } from './RequestPanel';

const isOpen = (r: BackofficeRequest) =>
  (OPEN_REQUEST_STATUSES as readonly string[]).includes(r.status);

/** Every service request: tiles to filter by stage, a table, and the request beside it. */
export function Requests() {
  const [params, set] = useUrlState();
  const view = params.get('status') ?? 'open';
  const service = params.get('service') ?? '';
  const kind = params.get('kind') ?? '';
  const coverage = params.get('coverage') ?? '';
  const city = params.get('city') ?? '';
  const waited = Number(params.get('waited') ?? 0);
  const selected = params.get('id');
  const [now] = useState(() => Date.now());
  const { data, error, isPending } = useRequestList();

  const due = (r: BackofficeRequest) => requestExpectedBy(r);
  const late = (r: BackofficeRequest) => {
    const d = due(r);
    return !!d && isOpen(r) && Date.parse(d) < now;
  };
  const count = (f: (r: BackofficeRequest) => boolean) => data?.filter(f).length ?? '–';
  const by = (s: ServiceRequestStatus) => (r: BackofficeRequest) => r.status === s;

  const views = {
    open: isOpen,
    requested: by('requested'),
    confirmed: by('confirmed'),
    scheduled: by('scheduled'),
    in_progress: by('in_progress'),
    awaiting_customer: by('awaiting_customer'),
    overdue: late,
    completed: by('completed'),
    cancelled: by('cancelled'),
    all: () => true,
  };
  const services = [...new Set(data?.map((r) => r.service.name))].sort();
  const cities = [
    ...new Set(data?.flatMap((r) => (r.property?.city ? [r.property.city] : []))),
  ].sort();
  const rows = data?.filter(
    (r) =>
      (views[view as keyof typeof views] ?? isOpen)(r) &&
      (!service || r.service.name === service) &&
      (!kind || r.fulfilment === kind) &&
      (!coverage || r.coverage === coverage) &&
      (!city || r.property?.city === city) &&
      (!waited || now - Date.parse(r.created_at) > waited * 86_400_000),
  );

  const columns: Column<BackofficeRequest>[] = [
    {
      key: 'service',
      header: 'Request',
      sort: (r) => r.service.name,
      render: (r) => (
        <>
          {r.service.name}
          <span className="sub mono">{r.reference}</span>
        </>
      ),
      csv: (r) => `${r.service.name} ${r.reference}`,
    },
    {
      key: 'customer',
      header: 'Customer',
      sort: (r) => r.customer_name ?? '',
      render: (r) => (
        <>
          {r.customer_name || '—'}
          <span className="sub">
            {r.customer_phone ? formatIndianMobile(r.customer_phone) : ''}
          </span>
        </>
      ),
      csv: (r) => `${r.customer_name ?? ''} ${r.customer_phone ?? ''}`.trim(),
    },
    {
      key: 'property',
      header: 'Property',
      sort: (r) => r.property?.name ?? '',
      render: (r) =>
        r.property ? (
          <>
            {r.property.name}
            <span className="sub">{r.property.city ?? ''}</span>
          </>
        ) : (
          <span className="sub">Property deleted</span>
        ),
      csv: (r) => r.property?.name ?? 'Property deleted',
    },
    {
      key: 'status',
      header: 'Status',
      sort: (r) => r.status,
      render: (r) => (
        <span className={`badge ${REQUEST_TONES[r.status]}`}>
          {requestStatusLabel(r.status, r.fulfilment)}
        </span>
      ),
      csv: (r) => requestStatusLabel(r.status, r.fulfilment),
    },
    {
      key: 'waiting',
      header: 'Open for',
      align: 'right',
      sort: (r) => (isOpen(r) ? r.created_at : null),
      render: (r) =>
        isOpen(r) ? <Age since={r.created_at} now={now} /> : <span className="sub">—</span>,
      csv: (r) => r.created_at,
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      sort: (r) => r.price_paise ?? null,
      render: (r) => (r.price_paise === null ? '—' : rupees(r.price_paise)),
      csv: (r) => (r.price_paise === null ? '' : r.price_paise / 100),
    },
    {
      key: 'created',
      header: 'Requested',
      sort: (r) => r.created_at,
      render: (r) => date(r.created_at),
    },
    {
      key: 'due',
      header: 'Due',
      sort: (r) => due(r),
      render: (r) => {
        const d = due(r);
        if (!d || !isOpen(r)) return <span className="sub">—</span>;
        return <span className={late(r) ? 'error' : ''}>{relative(d)}</span>;
      },
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Service requests</h1>
          <p>
            Open requests by default. Click a number, search, or filter. Every open request plus the
            latest 300 others.
          </p>
        </div>
      </div>
      <Tiles
        value={view}
        onChange={(v) => set({ status: v, id: null })}
        tiles={[
          { value: 'open', label: 'All open', count: count(isOpen) },
          { value: 'requested', label: 'To confirm', count: count(views.requested), tone: 'warn' },
          { value: 'overdue', label: 'Overdue', count: count(late), tone: 'bad' },
          { value: 'confirmed', label: 'Accepted', count: count(views.confirmed) },
          { value: 'scheduled', label: 'Scheduled', count: count(views.scheduled) },
          { value: 'in_progress', label: 'In progress', count: count(views.in_progress) },
          {
            value: 'awaiting_customer',
            label: 'Need info',
            count: count(views.awaiting_customer),
          },
          { value: 'completed', label: 'Completed', count: count(views.completed), tone: 'good' },
          { value: 'cancelled', label: 'Cancelled', count: count(views.cancelled) },
          { value: 'all', label: 'Everything', count: data?.length ?? '–' },
        ]}
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        selected={selected}
        onRowClick={(r) => set({ id: r.id })}
        onClose={() => set({ id: null, full: null })}
        detail={
          selected ? (
            <RequestPanel id={selected} onClose={() => set({ id: null, full: null })} />
          ) : null
        }
        searchText={(r) =>
          `${r.reference} ${r.service.name} ${r.customer_name ?? ''} ${r.customer_phone ?? ''} ${r.property?.name ?? ''} ${r.property?.city ?? ''} ${requestStatusLabel(r.status, r.fulfilment)} ${r.description}`
        }
        searchPlaceholder="Search anything: reference, service, customer, phone, property, city"
        defaultSort={{ key: 'created', dir: 'desc' }}
        exportName="requests"
        loading={isPending}
        error={error ? errorText(error) : null}
        empty="No requests here."
        toolbar={
          <>
            <select
              value={service}
              onChange={(e) => set({ service: e.target.value || null })}
              aria-label="Service"
            >
              <option value="">All services</option>
              {services.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              value={kind}
              onChange={(e) => set({ kind: e.target.value || null })}
              aria-label="Kind"
            >
              <option value="">Visits and paperwork</option>
              <option value="visit">{SERVICE_FULFILMENT_LABELS.visit}</option>
              <option value="assistance">{SERVICE_FULFILMENT_LABELS.assistance}</option>
            </select>
            <select
              value={coverage}
              onChange={(e) => set({ coverage: e.target.value || null })}
              aria-label="Paid how"
            >
              <option value="">In plan and extras</option>
              <option value="included">In the plan</option>
              <option value="extra">Paid extra</option>
            </select>
            <select
              value={city}
              onChange={(e) => set({ city: e.target.value || null })}
              aria-label="City"
            >
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select
              value={waited ? String(waited) : ''}
              onChange={(e) => set({ waited: e.target.value || null })}
              aria-label="Waiting"
            >
              <option value="">Any age</option>
              <option value="1">Older than 1 day</option>
              <option value="3">Older than 3 days</option>
              <option value="7">Older than a week</option>
            </select>
          </>
        }
      />
    </div>
  );
}
