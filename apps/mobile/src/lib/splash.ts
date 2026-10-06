import { useSyncExternalStore } from 'react';

/**
 * Whether the branded splash has finished. Screens underneath (e.g. Login)
 * wait for it before focusing an input, so the keyboard never pops up over
 * the splash.
 */
let done = false;
const listeners = new Set<() => void>();

export function markSplashDone(): void {
  if (done) return;
  done = true;
  listeners.forEach((l) => l());
}

export function useSplashDone(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => done,
  );
}
