import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '../lib/api';
import { Feedback, useAction } from './action';

const ABOUT: Record<string, { name: string; what: string }> = {
  satellite_watch: {
    name: 'Plot satellite watch',
    what: 'Free Sentinel-2 pictures (10 m) of every plot with a confirmed pin, checked monthly; owners are told when the plot looks cleared or built on, or there’s new building close by. Shown in the app only while on.',
  },
};

/** Optional modules the team can switch on or off (super admin). */
export function Modules() {
  const qc = useQueryClient();
  const { data, error } = useQuery({
    queryKey: ['bo-modules'],
    queryFn: () =>
      api<{ key: string; enabled: boolean; updated_at: string }[]>('/backoffice/modules'),
  });
  const a = useAction(() => void qc.invalidateQueries({ queryKey: ['bo-modules'] }));
  if (error) return <div className="error">{errorText(error)}</div>;
  return (
    <div className="card-block">
      <h3>Modules</h3>
      {(data ?? []).map((m) => (
        <label key={m.key} className="row">
          <input
            type="checkbox"
            checked={m.enabled}
            onChange={(e) =>
              a.mutate({
                path: `/backoffice/modules/${m.key}`,
                method: 'PATCH',
                body: { enabled: e.target.checked },
                ok: `${ABOUT[m.key]?.name ?? m.key} ${e.target.checked ? 'on' : 'off'}`,
              })
            }
          />
          <span>
            <b>{ABOUT[m.key]?.name ?? m.key}</b>
            <span className="sub">{ABOUT[m.key]?.what ?? ''}</span>
          </span>
        </label>
      ))}
      <Feedback a={a} />
    </div>
  );
}
