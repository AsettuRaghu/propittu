import { REPORT_RANGES, REPORT_RANGE_LABELS, type ReportRange } from '@propittu/shared';

export function RangeTabs({
  value,
  onChange,
}: {
  value: ReportRange;
  onChange: (r: ReportRange) => void;
}) {
  return (
    <div className="tabs" role="group" aria-label="Period">
      {REPORT_RANGES.map((r) => (
        <button key={r} aria-pressed={value === r} onClick={() => onChange(r)}>
          {REPORT_RANGE_LABELS[r]}
        </button>
      ))}
    </div>
  );
}

export const asRange = (v: string | null, fallback: ReportRange): ReportRange =>
  (REPORT_RANGES as readonly string[]).includes(v ?? '') ? (v as ReportRange) : fallback;
