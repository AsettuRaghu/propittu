import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { formatIndianMobile, type BackofficeAccount } from '@propittu/shared';
import { api, errorText } from '../lib/api';
import { date } from '../lib/format';
import { useUrlState } from '../lib/params';
import { CustomerPanel } from './CustomerPanel';

/** Find a customer by phone, name or account id; open one beside the list. */
export function Customers() {
  const [params, set] = useUrlState();
  const q = params.get('q') ?? '';
  const selected = params.get('id');
  const [text, setText] = useState(q);

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Search as the person types, a moment after they stop.
  const type = (value: string) => {
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => set({ q: value.trim() || null, id: null }), 350);
  };

  const { data, error, isPending } = useQuery({
    queryKey: ['bo-accounts', q],
    queryFn: () =>
      api<BackofficeAccount[]>(`/backoffice/accounts${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Customers</h1>
          <p>Newest first. Search by phone, name or account id.</p>
        </div>
        <input
          className="search"
          type="search"
          placeholder="Search customers"
          value={text}
          onChange={(e) => type(e.target.value)}
          aria-label="Search customers"
        />
      </div>

      <div className={`split ${selected ? '' : 'closed'}`}>
        <section className="section">
          {isPending ? <div className="empty">Loading…</div> : null}
          {error ? <div className="empty error">{errorText(error)}</div> : null}
          {data && data.length === 0 ? <div className="empty">No customers found.</div> : null}
          {data && data.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Plan</th>
                    <th>Properties</th>
                    <th>Open requests</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((a) => (
                    <tr
                      key={a.id}
                      className={selected === a.id ? 'selected' : ''}
                      onClick={() => set({ id: a.id, property: null })}
                    >
                      <td>
                        {a.full_name || '—'}
                        <span className="sub">{a.phone ? formatIndianMobile(a.phone) : ''}</span>
                      </td>
                      <td>
                        {a.plan_name ?? 'No plan'}
                        <span className="sub">
                          {a.plan_ends_at ? `until ${date(a.plan_ends_at)}` : ''}
                        </span>
                      </td>
                      <td>{a.property_count}</td>
                      <td>{a.open_request_count || '—'}</td>
                      <td>
                        {date(a.created_at)}
                        {a.status !== 'active' ? (
                          <span className="sub">
                            <span className="badge bad">{a.status}</span>
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
        {selected ? (
          <CustomerPanel
            id={selected}
            propertyId={params.get('property')}
            openProperty={(property) => set({ property })}
            onClose={() => set({ id: null, property: null })}
          />
        ) : null}
      </div>
    </div>
  );
}
