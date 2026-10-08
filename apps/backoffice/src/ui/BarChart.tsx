export type Series<T> = {
  label: string;
  value: (row: T) => number;
  tone: 'brand' | 'good' | 'warn' | 'bad' | 'muted';
};

/**
 * A plain stacked bar chart in HTML (no chart library): one column per step,
 * a hover title with the numbers, and labels thinned out to stay readable.
 */
export function BarChart<T>({
  rows,
  label,
  series,
  format = (n) => String(n),
  height = 160,
  grouped = false,
}: {
  rows: T[];
  label: (row: T) => string;
  series: Series<T>[];
  format?: (n: number) => string;
  height?: number;
  /** Bars side by side (to compare) instead of stacked (to add up). */
  grouped?: boolean;
}) {
  const totals = rows.map((r) => series.reduce((n, s) => n + Math.max(0, s.value(r)), 0));
  const max = Math.max(
    1,
    ...(grouped ? rows.flatMap((r) => series.map((s) => s.value(r))) : totals),
  );
  const every = Math.max(1, Math.ceil(rows.length / 12));
  const sum = totals.reduce((a, b) => a + b, 0);
  return (
    <div className="chart">
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.label}>
            <i className={`dot ${s.tone}`} />
            {s.label} {format(rows.reduce((n, r) => n + s.value(r), 0))}
          </span>
        ))}
      </div>
      {sum === 0 ? (
        <div className="chart-empty" style={{ height }}>
          Nothing in this period yet.
        </div>
      ) : (
        <div className="chart-bars" style={{ height }}>
          {rows.map((r, i) => (
            <div
              key={i}
              className="chart-col"
              title={`${label(r)}\n${series.map((s) => `${s.label}: ${format(s.value(r))}`).join('\n')}`}
            >
              {grouped ? (
                series.map((s) => (
                  <div
                    key={s.label}
                    className={`chart-stack ${s.tone}`}
                    style={{ height: `${(Math.max(0, s.value(r)) / max) * 100}%` }}
                  />
                ))
              ) : (
                <div className="chart-stack" style={{ height: `${(totals[i]! / max) * 100}%` }}>
                  {series.map((s) => {
                    const v = Math.max(0, s.value(r));
                    return v > 0 ? (
                      <span key={s.label} className={s.tone} style={{ flexGrow: v }} />
                    ) : null;
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="chart-axis">
        {rows.map((r, i) => (
          <span key={i}>{i % every === 0 ? label(r) : ''}</span>
        ))}
      </div>
    </div>
  );
}
