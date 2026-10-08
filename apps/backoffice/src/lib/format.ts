const IST = 'Asia/Kolkata';

export const rupees = (paise: number | null | undefined) =>
  paise === null || paise === undefined
    ? '—'
    : `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export const date = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: IST,
      })
    : '—';

export const dateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: IST,
      })
    : '—';

/** "3 days ago", "in 2 days" */
export function relative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const days = Math.round((Date.parse(iso) - Date.now()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === -1) return 'yesterday';
  if (days === 1) return 'tomorrow';
  return days < 0 ? `${-days} days ago` : `in ${days} days`;
}
