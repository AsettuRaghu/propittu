import type { Session } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Me } from '@propittu/shared';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { Login } from './Login';

interface Staff {
  me: Me;
  signOut: () => Promise<void>;
}
const StaffContext = createContext<Staff | null>(null);

/** The signed-in admin (only ever rendered inside <StaffGate>). */
export function useStaff(): Staff {
  const s = useContext(StaffContext);
  if (!s) throw new Error('useStaff outside StaffGate');
  return s;
}

/**
 * Only the Propittu team gets past this: signed in with phone + one-time
 * code AND marked as active staff. Customers who sign in see a polite
 * "this is for the team" and nothing else. (The API enforces the same.)
 */
export function StaffGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  const me = useQuery({
    queryKey: ['me', session?.user.id],
    queryFn: () => api<Me>('/me'),
    enabled: !!session,
    retry: false,
  });
  const signOut = async () => {
    await supabase.auth.signOut();
  };

  if (session === undefined || (session && me.isPending)) {
    return <div className="center">Loading…</div>;
  }
  if (!session) return <Login />;
  if (me.error || !me.data) {
    return (
      <div className="center">
        <div className="card">
          <h1>Couldn’t load your account</h1>
          <p>Check your connection and try again.</p>
          <button className="btn" onClick={() => void me.refetch()}>
            Try again
          </button>
          <button className="link" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }
  if (!me.data.staff_role) {
    return (
      <div className="center">
        <div className="card">
          <h1>This portal is for the Propittu team</h1>
          <p>
            Your account isn’t set up as an admin. If you’re a Propittu customer, please use the
            Propittu app.
          </p>
          <button className="btn" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }
  return <StaffContext.Provider value={{ me: me.data, signOut }}>{children}</StaffContext.Provider>;
}
