import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DOCUMENT_TYPE_LABELS,
  LEGAL_LEVEL_LABELS,
  PITTU_QUESTION_LABELS,
  TITLE_EVENT_LABELS,
  requestStatusLabel,
  type DocumentType,
  type PittuQuestionId,
  type ServiceFulfilment,
  type ServiceRequestStatus,
} from '@propittu/shared';
import { deedStory } from '../deeds/story.js';
import { documentLines } from '../documents/pittu.js';
import { listChecks } from '../legal/checks.js';
import { ownerDisputes } from '../legal/disputes.js';
import { projectAlerts } from '../legal/projectDisputes.js';
import { currentEstimate } from '../value/estimate.js';
import { propertyValue } from '../value/value.js';

/**
 * The owner's PROPERTY FILE as plain text for Ask Pittu: everything we know
 * about the property, compact. Owner data is read with the owner's own
 * client (row-level security); value and disputes with the server key, after
 * the property's ownership was checked by the caller.
 */

const cr = (n: number) =>
  n >= 1e7
    ? `₹${(n / 1e7).toFixed(2)} crore`
    : n >= 1e5
      ? `₹${(n / 1e5).toFixed(1)} lakh`
      : `₹${Math.round(n).toLocaleString('en-IN')}`;
const line = (label: string, value: unknown) =>
  value === null || value === undefined || value === '' ? null : `${label}: ${String(value)}`;

export async function propertyFile(
  db: SupabaseClient,
  server: SupabaseClient,
  propertyId: string,
): Promise<string> {
  const [{ data: p }, told, answers, docs, requests, value, estimate, checks, disputes, project] =
    await Promise.all([
      db
        .from('properties')
        .select(
          'id, name, property_type, address_line, city, state, pincode, area_value, area_unit, survey_number, property_number, khata_number, purchase_price_inr, purchase_date, sellers, land_use, khata_type, rera_number, loan_on_property, notes',
        )
        .eq('id', propertyId)
        .maybeSingle(),
      deedStory(db, propertyId),
      db
        .from('property_answers')
        .select('question_id, answer, answered_by, answered_at')
        .eq('property_id', propertyId),
      db
        .from('property_documents')
        .select('id, document_type, file_name, created_at')
        .eq('property_id', propertyId)
        .eq('upload_status', 'ready'),
      db
        .from('service_requests')
        .select('reference, status, fulfilment, created_at, scheduled_for, service:services(name)')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false })
        .limit(10),
      propertyValue(server, propertyId).catch(() => null),
      currentEstimate(server, propertyId).catch(() => ({ estimate: null })),
      listChecks(db, { propertyId }).catch(() => []),
      ownerDisputes(propertyId).catch(() => ({ disputes: null })),
      projectAlerts(server, propertyId).catch(() => []),
    ]);
  if (!p) return 'PROPERTY: not found';
  const docRows = (docs.data ?? []) as {
    id: string;
    document_type: DocumentType;
    file_name: string;
    created_at: string;
  }[];
  const lines = await documentLines(db, propertyId, docRows).catch(() => new Map());
  const s = told.story;

  const parts: (string | null)[] = [
    `PROPERTY: ${p.name} (${p.property_type})`,
    line('Address', [p.address_line, p.city, p.state, p.pincode].filter(Boolean).join(', ')),
    line('Area', p.area_value ? `${p.area_value} ${p.area_unit ?? ''}` : null),
    line('Survey number', p.survey_number),
    line('Plot / flat number', p.property_number),
    line('Khata / property ID', p.khata_number),
    line(
      'Bought',
      p.purchase_price_inr
        ? `${cr(p.purchase_price_inr)}${p.purchase_date ? ` on ${p.purchase_date}` : ''}`
        : p.purchase_date,
    ),
    line('Bought from', p.sellers),
    line('Land use', p.land_use),
    line('Khata type', p.khata_type),
    line('RERA number', p.rera_number),
    line('Loan on it', p.loan_on_property === null ? null : p.loan_on_property ? 'yes' : 'no'),
    line('Owner notes', p.notes),
    '',
    'SALE DEED:',
    s
      ? [
          line('Project', s.project_name),
          line('Developer', s.developer),
          line('Floor', s.floor),
          line('Village', s.village),
          line('Survey numbers', s.survey_numbers.join(', ')),
          line('Khata on deed', s.khata_number),
          line('Sellers', s.sellers.join(', ')),
          line('Registered', s.bought_on),
          line('Price on deed', s.price_inr ? cr(s.price_inr) : null),
          s.history.length
            ? `History (as the deed recites it):\n${s.history
                .map(
                  (e) =>
                    `- ${e.date ?? '?'} ${TITLE_EVENT_LABELS[e.event]}: ${e.from.join(', ') || '?'} → ${e.to.join(', ') || '?'}${e.note ? ` (${e.note})` : ''}`,
                )
                .join('\n')}`
            : null,
        ]
          .filter(Boolean)
          .join('\n')
      : 'Not read yet (no sale deed read by Pittu).',
    '',
    'OWNER’S ANSWERS:',
    ((answers.data ?? []) as { question_id: string; answer: string; answered_by: string | null }[])
      .map(
        (a) =>
          `- ${PITTU_QUESTION_LABELS[a.question_id as PittuQuestionId] ?? a.question_id}: ${a.answer}${a.answered_by ? '' : ' (from a document, by Pittu)'}`,
      )
      .join('\n') || 'None yet.',
    '',
    'DOCUMENTS IN THE LOCKER:',
    docRows
      .map((d) => {
        const l = lines.get(d.id);
        const read =
          l?.status === 'ready'
            ? ` — Pittu read: ${l.summary ?? ''}${l.findings.length ? `; ${l.findings.map((f: { text: string }) => f.text).join('; ')}` : ''}`
            : '';
        return `- ${DOCUMENT_TYPE_LABELS[d.document_type]} (added ${d.created_at.slice(0, 10)})${read}`;
      })
      .join('\n') || 'None yet.',
    '',
    'VALUE:',
    value
      ? [
          line(
            'Government value today',
            value.government_value_inr ? cr(value.government_value_inr) : 'not known yet',
          ),
          value.rate
            ? `Government rate: ₹${value.rate.per_sqft}/sq ft for ${value.rate.locality}`
            : null,
          estimate.estimate?.status === 'ready' &&
          estimate.estimate.value_low &&
          estimate.estimate.value_high
            ? `Market range (estimate from prices online and owners’ sales): ${cr(estimate.estimate.value_low)} – ${cr(estimate.estimate.value_high)}`
            : 'Market range: not available yet',
          estimate.estimate?.rent_low && estimate.estimate.rent_high
            ? `Rent similar homes ask: ${cr(estimate.estimate.rent_low)} – ${cr(estimate.estimate.rent_high)} a month`
            : null,
        ]
          .filter(Boolean)
          .join('\n')
      : 'Not available.',
    '',
    'RECORDS CHECK (EC):',
    checks.length
      ? checks
          .map(
            (c) =>
              `- ${c.overall ? LEGAL_LEVEL_LABELS[c.overall] : 'No findings'} (EC ${c.ec_period_from ?? '?'} to ${c.ec_period_to ?? '?'}): ${c.summary ?? ''} ${c.findings
                .filter((f) => f.review !== 'dismissed')
                .map((f) => f.title)
                .join('; ')}`,
          )
          .join('\n')
      : 'No EC check shared yet (if an EC was uploaded, our team is reviewing it).',
    '',
    'COURT CASES AND DISPUTES:',
    [
      ...project
        .filter((d) => d.status === 'active')
        .map(
          (d) =>
            `- Confirmed for the whole project ${d.project_name}: ${d.summary}${d.what_to_do ? ` What to do: ${d.what_to_do}` : ''}`,
        ),
      disputes.disputes
        ? `- Online search: ${disputes.disputes.status === 'clear' ? `nothing found online (checked ${disputes.disputes.checked_at?.slice(0, 10) ?? ''}); not every court record is online` : disputes.disputes.status === 'in_review' ? 'something found; our team is reviewing it' : disputes.disputes.status === 'shared' ? disputes.disputes.items.map((i) => i.summary).join('; ') : 'not checked yet'}`
        : '- Not checked yet.',
    ].join('\n'),
    '',
    'SERVICE REQUESTS:',
    (
      (requests.data ?? []) as unknown as {
        reference: string;
        status: ServiceRequestStatus;
        fulfilment: ServiceFulfilment;
        created_at: string;
        scheduled_for: string | null;
        service: { name: string } | null;
      }[]
    )
      .map(
        (r) =>
          `- ${r.service?.name ?? 'Service'} (${r.reference}): ${requestStatusLabel(r.status, r.fulfilment)}${r.scheduled_for ? `, scheduled ${r.scheduled_for.slice(0, 10)}` : ''}`,
      )
      .join('\n') || 'None.',
  ];
  return parts.filter((x) => x !== null).join('\n');
}

/** Our services, for suggestions (code: name — price). */
export async function catalogue(db: SupabaseClient): Promise<string> {
  const { data } = await db
    .from('services')
    .select('code, name, price_paise')
    .eq('is_active', true)
    .order('sort_order');
  return (
    'OUR SERVICES (code: name — price):\n' +
    ((data ?? []) as { code: string; name: string; price_paise: number | null }[])
      .map(
        (s) =>
          `- ${s.code}: ${s.name} — ${s.price_paise ? `₹${Math.round(s.price_paise / 100)}` : 'on quote'}`,
      )
      .join('\n')
  );
}

/** Every property in the account, briefly (for questions not about one property). */
export async function accountFile(db: SupabaseClient, accountId: string): Promise<string> {
  const { data } = await db
    .from('properties')
    .select('name, property_type, city, state, purchase_price_inr, purchase_date')
    .eq('account_id', accountId)
    .eq('is_draft', false);
  return (
    'THE OWNER’S PROPERTIES:\n' +
    (
      (data ?? []) as {
        name: string;
        property_type: string;
        city: string | null;
        state: string | null;
        purchase_price_inr: number | null;
        purchase_date: string | null;
      }[]
    )
      .map(
        (p) =>
          `- ${p.name} (${p.property_type}, ${[p.city, p.state].filter(Boolean).join(', ')})${p.purchase_price_inr ? `, bought for ${cr(p.purchase_price_inr)}` : ''}${p.purchase_date ? ` on ${p.purchase_date}` : ''}`,
      )
      .join('\n')
  );
}
