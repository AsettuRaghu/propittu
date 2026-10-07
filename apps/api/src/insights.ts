import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deedGaps,
  PROPERTY_TYPE_LABELS,
  type DeedGap,
  type FactValue,
  type HealthInput,
  type Property,
} from '@propittu/shared';
import { must } from './errors.js';

/**
 * What health scores and reminders need, for many properties in a few
 * reads (never one query per property): Pittu's answers with their dates,
 * our last completed visit, "next due" dates staff recorded, and the deed
 * comparison. RLS applies — the caller's own client.
 */
export interface PropertyInsight {
  answers: HealthInput['answers'];
  lastVisitAt: string | null;
  due: { service_name: string; date: string }[];
  gaps: DeedGap[];
  deed: HealthInput['deed'];
}

export async function loadInsights(
  db: SupabaseClient,
  properties: Property[],
  docTypes: Map<string, readonly string[]>,
): Promise<Map<string, PropertyInsight>> {
  const ids = properties.map((p) => p.id);
  const out = new Map<string, PropertyInsight>();
  if (ids.length === 0) return out;

  const [answersRes, visitsRes, dueRes, factsRes] = await Promise.all([
    db
      .from('property_answers')
      .select('property_id, question_id, answer, answered_at')
      .in('property_id', ids),
    db
      .from('service_requests')
      .select('property_id, completed_at')
      .in('property_id', ids)
      .eq('fulfilment', 'visit')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false }),
    db
      .from('service_outcomes')
      .select('property_id, next_due_date, request:service_requests(service:services(name))')
      .in('property_id', ids)
      .not('next_due_date', 'is', null),
    db
      .from('property_facts')
      .select('property_id, key, value, created_at')
      .in('property_id', ids)
      .neq('status', 'superseded')
      .order('created_at', { ascending: true }),
  ]);
  const answers =
    must<{ property_id: string; question_id: string; answer: string; answered_at: string }[]>(
      answersRes,
    );
  const visits = must<{ property_id: string; completed_at: string | null }[]>(visitsRes);
  const due = must<
    {
      property_id: string;
      next_due_date: string;
      request: { service: { name: string } | null } | null;
    }[]
  >(dueRes);
  const facts = must<{ property_id: string; key: string; value: FactValue }[]>(factsRes);

  for (const p of properties) {
    // Later readings win.
    const mine = [
      ...new Map(facts.filter((f) => f.property_id === p.id).map((f) => [f.key, f])).values(),
    ];
    const gaps = deedGapsFor(mine, p);
    const hasDeed = (docTypes.get(p.id) ?? []).includes('sale_deed');
    out.set(p.id, {
      answers: Object.fromEntries(
        answers
          .filter((a) => a.property_id === p.id)
          .map((a) => [a.question_id, { answer: a.answer, at: a.answered_at }]),
      ),
      lastVisitAt: visits.find((v) => v.property_id === p.id)?.completed_at ?? null,
      due: due
        .filter((d) => d.property_id === p.id)
        .map((d) => ({
          service_name: d.request?.service?.name ?? 'Service',
          date: d.next_due_date,
        })),
      gaps,
      deed:
        mine.length > 0
          ? gaps.some((g) => g.yours !== null)
            ? 'differs'
            : 'matches'
          : hasDeed
            ? 'unread'
            : 'none',
    });
  }
  return out;
}

/** Where the saved details differ from the deed (the deed's own words). */
function deedGapsFor(facts: { key: string; value: FactValue }[], p: Property): DeedGap[] {
  return deedGaps(
    facts,
    {
      property_type: p.property_type,
      pincode: p.pincode,
      city: p.city,
      state: p.state,
      area_value: p.area_value,
      khata_number: p.khata_number,
      property_number: p.property_number,
      purchase_price_inr: p.purchase_price_inr,
      purchase_date: p.purchase_date,
      sellers: p.sellers,
      boundary_north: p.boundary_north,
      boundary_south: p.boundary_south,
      boundary_east: p.boundary_east,
      boundary_west: p.boundary_west,
    },
    (field, v) =>
      field === 'property_type'
        ? (PROPERTY_TYPE_LABELS[v as keyof typeof PROPERTY_TYPE_LABELS] ?? String(v))
        : field === 'area_value'
          ? Number(v).toLocaleString('en-IN')
          : field === 'purchase_price_inr'
            ? `₹${Number(v).toLocaleString('en-IN')}`
            : String(v),
  );
}
