import { useEffect } from 'react';

/** Esc closes the side panel (unless the person is typing in a field). */
export function useEscape(onEscape: () => void) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== 'Escape' || t?.closest('input, textarea, select')) return;
      onEscape();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onEscape]);
}
