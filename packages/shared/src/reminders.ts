import { financialYearLabel, seenRecently, taxPaidThisYear, type HealthInput } from './health';

/**
 * "Coming up" — what each owner should be reminded of, from what we
 * already know. Rules only (no AI): Pittu's answers, our visits, dates our
 * team recorded on finished requests, the map pin, the deed and the plan.
 * Shared so the API (which lists them) and the app (which can schedule
 * on-phone notifications for the dated ones) agree.
 */

export type ReminderKind = 'tax' | 'visit' | 'khata' | 'due' | 'location' | 'deed' | 'plan';

export interface Reminder {
  /** Stable, so the app can schedule / cancel a notification for it. */
  id: string;
  kind: ReminderKind;
  property_id: string | null;
  property_name: string | null;
  title: string;
  detail: string;
  /** YYYY-MM-DD when it has a date. */
  due_date: string | null;
  urgency: 'overdue' | 'soon' | 'later';
}

export interface ReminderInput extends Pick<HealthInput, 'answers' | 'lastVisitAt' | 'now'> {
  property: { id: string; name: string };
  /** Dates our team recorded on finished requests ("next due"). */
  due: { service_name: string; date: string }[];
  locationIssue: boolean;
  deedDiffers: number;
}

const DAY = 24 * 3600_000;

function urgencyOf(date: string | null, now: Date): Reminder['urgency'] {
  if (!date) return 'soon';
  const days = (Date.parse(date) - now.getTime()) / DAY;
  return days < 0 ? 'overdue' : days <= 30 ? 'soon' : 'later';
}

export function propertyReminders(input: ReminderInput): Reminder[] {
  const now = input.now ?? new Date();
  const p = input.property;
  const out: Reminder[] = [];
  const add = (r: Omit<Reminder, 'property_id' | 'property_name' | 'urgency'>) =>
    out.push({
      ...r,
      property_id: p.id,
      property_name: p.name,
      urgency: urgencyOf(r.due_date, now),
    });

  const tax = input.answers.tax_paid;
  if (!taxPaidThisYear(input)) {
    add({
      id: `tax:${p.id}:${financialYearLabel(now)}`,
      kind: 'tax',
      title: `Property tax for ${financialYearLabel(now)}`,
      detail:
        tax?.answer === 'paid'
          ? 'A new year — time to pay again'
          : tax?.answer === 'not_paid'
            ? 'Not paid yet — we can pay it for you'
            : 'Not sure it’s paid? We can check and pay it',
      due_date: null,
    });
  }
  if (!seenRecently(input)) {
    add({
      id: `visit:${p.id}`,
      kind: 'visit',
      title: 'Not seen in a while',
      detail: input.lastVisitAt
        ? 'Over a year since our last visit — book one, with photos'
        : 'Book a visit — we send photos and a short report',
      due_date: null,
    });
  }
  const khata = input.answers.khata_name?.answer;
  if (khata === 'no' || khata === 'unsure') {
    add({
      id: `khata:${p.id}`,
      kind: 'khata',
      title: 'Khata in your name',
      detail:
        khata === 'no'
          ? 'Not transferred yet — we can help'
          : 'Not sure — we can check the records',
      due_date: null,
    });
  }
  for (const d of input.due) {
    const days = (Date.parse(d.date) - now.getTime()) / DAY;
    if (days > 60) continue;
    add({
      id: `due:${p.id}:${d.service_name}:${d.date}`,
      kind: 'due',
      title: `${d.service_name} due`,
      detail: days < 0 ? 'Overdue — book it now' : 'Coming up — book it in good time',
      due_date: d.date,
    });
  }
  if (input.locationIssue) {
    add({
      id: `location:${p.id}`,
      kind: 'location',
      title: 'Check the map pin',
      detail: 'It disagrees with the PIN code or the deed',
      due_date: null,
    });
  }
  if (input.deedDiffers > 0) {
    add({
      id: `deed:${p.id}`,
      kind: 'deed',
      title: 'Differs from your deed',
      detail: `${input.deedDiffers} detail${input.deedDiffers === 1 ? '' : 's'} to look at`,
      due_date: null,
    });
  }
  return out;
}

/** Overdue first, then soonest dated, then the rest. */
export function sortReminders(list: Reminder[]): Reminder[] {
  const rank = { overdue: 0, soon: 1, later: 2 } as const;
  return [...list].sort(
    (a, b) =>
      rank[a.urgency] - rank[b.urgency] ||
      (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'),
  );
}
