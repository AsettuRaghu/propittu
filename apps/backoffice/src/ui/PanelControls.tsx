import { useUrlState } from '../lib/params';

/** Expand (hide the list, use the whole page) and Close, at the top right of every side panel. */
export function PanelControls({ onClose }: { onClose: () => void }) {
  const [params, set] = useUrlState();
  const full = params.get('full') === '1';
  return (
    <div className="row">
      <button className="btn small" onClick={() => set({ full: full ? null : '1' })}>
        {full ? 'Show the list' : 'Full page'}
      </button>
      <button className="btn small" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

/** Class for the list + panel area: list only, list beside a wide panel, or the panel alone. */
export function useSplitClass(selected: string | null) {
  const [params] = useUrlState();
  if (!selected) return 'split closed';
  return params.get('full') === '1' ? 'split full' : 'split open';
}
