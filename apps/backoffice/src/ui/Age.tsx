const HOUR = 3_600_000;
export type Level = 'good' | 'warn' | 'bad';

/** How long something has waited, coloured: under a day, 1–3 days, over 3 days. */
export function Age({ since, now }: { since: string; now: number }) {
  const h = (now - Date.parse(since)) / HOUR;
  const level: Level = h < 24 ? 'good' : h < 72 ? 'warn' : 'bad';
  const text =
    h < 1
      ? `${Math.max(1, Math.round(h * 60))} min`
      : h < 48
        ? `${Math.round(h)} h`
        : `${Math.round(h / 24)} days`;
  return <span className={`age ${level}`}>{text}</span>;
}
