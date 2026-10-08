import { NavLink, Outlet } from 'react-router';
import { useStaff } from '../auth/Session';

const SOON = ['Customers', 'Services & coverage', 'Plans & payments', 'Pittu'];

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
          <div className="nav-label">Coming next</div>
          {SOON.map((s) => (
            <div key={s} className="soon">
              {s} <small>soon</small>
            </div>
          ))}
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
