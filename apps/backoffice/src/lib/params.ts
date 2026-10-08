import { useSearchParams } from 'react-router';

/** Page state kept in the address (filter, selected row) so links and Back work. */
export function useUrlState() {
  const [params, setParams] = useSearchParams();
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next);
  };
  return [params, set] as const;
}
