import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet } from 'react-router';
import type { BackofficeDashboard } from '@propittu/shared';
import { useStaff } from '../auth/Session';
import { api } from '../lib/api';
import { useLive } from '../lib/live';

function Item({
  to,
  label,
  count,
  end,
}: {
  to: string;
  label: string;
  count?: number;
  end?: boolean;
}) {
  return (
    <NavLink to={to} end={end}>
      {label}
      {count ? <span className="count">{count}</span> : null}
    </NavLink>
  );
}

/** Sidebar + page: the Backoffice frame on a laptop screen. Counts show what needs us. */
export function Shell() {
  const { me, signOut } = useStaff();
  const { unseen } = useLive();
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<BackofficeDashboard>('/backoffice/dashboard'),
    refetchInterval: 60_000,
  });
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">P</div>
          <div>
            <b>Propittu</b>
            <span>Backoffice</span>
          </div>
        </div>
        <nav className="nav" aria-label="Sections">
          <Item to="/" end label="Dashboard" />
          <div className="nav-label">Work</div>
          <Item to="/requests" label="Service requests" count={data?.requests.requested} />
          <Item
            to="/support"
            label="Support tickets"
            count={unseen.size || data?.tickets_waiting}
          />
          <Item to="/legal" label="Pittu Legal" count={data?.pittu?.legal_in_review} />
          <Item to="/watch" label="Pittu Watch" count={data?.pittu?.watch_to_review} />
          <Item to="/value" label="Pittu Value" count={data?.pittu?.value_rows_to_check} />
          <div className="nav-label">Customers</div>
          <Item to="/customers" label="Customers" />
          <Item to="/payments" label="Payments" count={data?.refunds_needed.length} />
          <div className="nav-label">Setup</div>
          <Item to="/plans" label="Plans" />
          <Item to="/services" label="Services" />
          <Item to="/coverage" label="Coverage" />
          <Item to="/pittu" label="Pittu" />
          <div className="nav-label">Insights</div>
          <Item to="/reports" label="Reports" />
        </nav>
        <div className="sidebar-foot">
          <span>{me.full_name || 'Admin'}</span>
          <button className="link" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
