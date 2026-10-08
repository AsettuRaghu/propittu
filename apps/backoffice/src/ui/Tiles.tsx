import type { Tone } from './status';

export type Tile = {
  value: string;
  label: string;
  count: number | string;
  tone?: Tone;
  hint?: string;
};

/** Summary numbers that double as filters: click one to show just those rows. */
export function Tiles({
  tiles,
  value,
  onChange,
}: {
  tiles: Tile[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="tiles" role="group" aria-label="Filter">
      {tiles.map((t) => (
        <button
          key={t.value}
          className={`tile ${t.tone ?? ''}`}
          aria-pressed={value === t.value}
          onClick={() => onChange(t.value)}
        >
          <b>{t.count}</b>
          <span>{t.label}</span>
          {t.hint ? <small>{t.hint}</small> : null}
        </button>
      ))}
    </div>
  );
}
