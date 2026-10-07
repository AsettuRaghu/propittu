import { useState } from 'react';
import { useSession } from '@/auth/SessionProvider';
import { dialog } from '@/components/Dialog';

/** "Log out?" confirmation then sign-out — the same everywhere it is offered. */
export function useLogout() {
  const { signOut } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const logout = async () => {
    const ok = await dialog.confirm({
      title: 'Log out of Propittu?',
      message: 'You can log back in any time with your mobile number.',
      confirmLabel: 'Log out',
      tone: 'danger',
      icon: 'logout',
    });
    if (!ok) return;
    setSigningOut(true);
    await signOut();
  };
  return { signingOut, logout };
}
