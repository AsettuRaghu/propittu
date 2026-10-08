import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  requestExpectedBy,
  requestStatusLabel,
  type BackofficeRequest,
  type ServiceRequestStatus,
} from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { date, relative } from '../lib/format';
import { REQUEST_TONES } from '../ui/status';
import { RequestPanel } from './RequestPanel';

const FILTERS: { value: 'open' | 'all' | ServiceRequestStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'requested', label: 'To confirm' },
  { value: 'confirmed', label: 'Accepted' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'awaiting_customer', label: 'Need info' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

/** Every service request: filter by status, pick one to act on it beside the list. */
export function Requests() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'open';
  const selected = params.get('id');
  const [now] = useState(() => Date.now());
  const { data, error, isPending } = useQuery({
    queryKey: ['bo-requests', status],
    queryFn: () => api<BackofficeRequest[]>(`/backoffice/requests?status=${status}`),
  });
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Requests</h1>
          <p>Newest first. The latest 100 for the filter.</p>
        </div>
        <div className="tabs" role="group" aria-label="Status">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              aria-pressed={status === f.value}
              onClick={() => set({ status: f.value, id: null })}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`split ${selected ? '' : 'closed'}`}>
        <section className="section">
          {isPending ? <div className="empty">Loading…</div> : null}
          {error ? <div className="empty error">{errorText(error)}</div> : null}
          {data && data.length === 0 ? <div className="empty">No requests here.</div> : null}
          {data && data.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Customer</th>
                    <th>Property</th>
                    <th>Status</th>
                    <th>Requested</th>
                    <th>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r) => {
                    const due = requestExpectedBy(r);
                    const late =
                      due &&
                      Date.parse(due) < now &&
                      !['completed', 'cancelled'].includes(r.status);
                    return (
                      <tr
                        key={r.id}
                        className={selected === r.id ? 'selected' : ''}
                        onClick={() => set({ id: r.id })}
                      >
                        <td>
                          {r.service.name}
                          <span className="sub mono">{r.reference}</span>
                        </td>
                        <td>
                          {r.customer_name || '—'}
                          <span className="sub">{r.customer_phone ?? ''}</span>
                        </td>
                        <td>{r.property?.name ?? 'Property deleted'}</td>
                        <td>
                          <span className={`badge ${REQUEST_TONES[r.status]}`}>
                            {requestStatusLabel(r.status, r.fulfilment)}
                          </span>
                        </td>
                        <td>{date(r.created_at)}</td>
                        <td className={late ? 'error' : ''}>{due ? relative(due) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
        {selected ? <RequestPanel id={selected} onClose={() => set({ id: null })} /> : null}
      </div>
    </div>
  );
}
