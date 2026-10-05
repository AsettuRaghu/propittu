import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { setSessionExpiredHandler } from '@/api/client';
import { AUTH_STORAGE_KEY, supabase } from '@/lib/supabase';

interface SessionContextValue {
  session: Session | null;
  /** True until the persisted session has been restored (§14 Returning User). */
  initializing: boolean;
  /** One-off message shown on Login, e.g. after a session expires. */
  notice: string | null;
  clearNotice: () => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      userIdRef.current = data.session?.user.id ?? null;
      setSession(data.session);
      setInitializing(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      const nextUserId = next?.user.id ?? null;
      // A different (or no) user must never see the previous user's cached data.
      if (nextUserId !== userIdRef.current) queryClient.clear();
      userIdRef.current = nextUserId;
      setSession(next);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  /**
   * Sign out locally even when the network call fails. supabase-js keeps
   * the session if the server request errors, which would leave an offline
   * user unable to log out.
   */
  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      userIdRef.current = null;
      setSession(null);
    }
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setNotice('Your session has expired. Please sign in again.');
      void signOut();
    });
    return () => setSessionExpiredHandler(null);
  }, [signOut]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      initializing,
      notice,
      clearNotice: () => setNotice(null),
      signOut,
    }),
    [session, initializing, notice, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
