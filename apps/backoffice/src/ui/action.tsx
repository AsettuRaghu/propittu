import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorText } from '../lib/api';

/** One staff action (POST/PATCH/PUT/DELETE) with a plain "done" line, then a refresh. */
export function useAction(onChanged: () => void) {
  const [done, setDone] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: (v: { path: string; method?: string; body?: unknown; ok: string }) =>
      api(v.path, { method: v.method ?? 'POST', body: v.body }).then(() => v.ok),
    onMutate: () => setDone(null),
    onSuccess: (ok) => {
      setDone(ok);
      onChanged();
    },
  });
  return { ...m, done };
}

export function Feedback({ a }: { a: ReturnType<typeof useAction> }) {
  if (a.error) return <div className="error">{errorText(a.error)}</div>;
  if (a.done) return <div className="note-ok">{a.done}</div>;
  return null;
}
