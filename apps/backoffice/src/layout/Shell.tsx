import { NavLink, Outlet } from 'react-router';
import { useStaff } from '../auth/Session';

/** Sidebar + page: the Backoffice frame on a laptop screen. */
export function Shell() {
  const { me, signOut } = useStaff();
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
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/requests">Requests</NavLink>
          <NavLink to="/support">Support</NavLink>
          <NavLink to="/customers">Customers</NavLink>
          <NavLink to="/payments">Plans &amp; payments</NavLink>
          <NavLink to="/services">Services &amp; coverage</NavLink>
          <NavLink to="/pittu">Pittu</NavLink>
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
