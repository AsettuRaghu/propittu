import type { SupabaseClient } from '@supabase/supabase-js';
import { overallLevel, type EcReading, type LegalCheck, type LegalFinding } from '@propittu/shared';
import { HttpError, must, notFound } from '../errors.js';
import { deedFactValues, factList, factText } from '../deeds/facts.js';
import { checkEc, RULES_VERSION, type DeedFacts } from './ecRules.js';

/**
 * Pittu Legal EC checks — the application layer. Takes Pittu Read's EC
 * reading and the sale-deed facts the customer confirmed, runs the rules and
 * stores the findings for staff review.
 */

const CHECK_COLUMNS =
  'id, account_id, property_id, status, overall, rules_version, ec_document_id, deed_document_id, ' +
  'ec_office, ec_period_from, ec_period_to, findings, summary, created_at, updated_at, shared_at, ' +
  'property:properties(name)';

type Row = Omit<LegalCheck, 'property_name' | 'customer_name' | 'customer_phone'> & {
  property: { name: string } | null;
};

/** What the EC check needs from the sale deed. */
async function deedFacts(
  db: SupabaseClient,
  propertyId: string,
): Promise<{ facts: DeedFacts; documentId: string | null }> {
  const { values, documentId } = await deedFactValues(db, propertyId);
  return {
    documentId,
    facts: {
      buyers: factList(values.get('buyers')),
      sellers: factList(values.get('sellers')),
      registration_number: factText(values.get('registration_number')),
      registration_date: factText(values.get('registration_date')),
      survey_numbers: factList(values.get('survey_numbers')),
      village: factText(values.get('village')),
    },
  };
}

/** Run the EC check on a property's EC (its reading must be ready). */
export async function createEcCheck(
  db: SupabaseClient,
  propertyId: string,
  ecDocumentId: string,
  staffUserId: string,
): Promise<string> {
  const doc = must<{
    id: string;
    account_id: string;
    property_id: string;
    document_type: string;
  } | null>(
    await db
      .from('property_documents')
      .select('id, account_id, property_id, document_type')
      .eq('id', ecDocumentId)
      .maybeSingle(),
  );
  if (!doc || doc.property_id !== propertyId) throw notFound('EC');
  if (doc.document_type !== 'encumbrance_certificate')
    throw new HttpError(409, 'CONFLICT', 'Choose a document of type Encumbrance Certificate');
  const reading = must<{ id: string; result: EcReading } | null>(
    await db
      .from('document_analyses')
      .select('id, result')
      .eq('document_id', ecDocumentId)
      .eq('task', 'encumbrance.extract')
      .eq('status', 'ready')
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (!reading)
    throw new HttpError(
      409,
      'CONFLICT',
      'Read the EC with Pittu first (Read with Pittu on the document).',
    );
  const { facts, documentId } = await deedFacts(db, propertyId);
  const findings = checkEc(reading.result, facts);
  const row = must<{ id: string }>(
    await db
      .from('legal_checks')
      .insert({
        account_id: doc.account_id,
        property_id: propertyId,
        ec_document_id: ecDocumentId,
        deed_document_id: documentId,
        ec_analysis_id: reading.id,
        rules_version: RULES_VERSION,
        overall: overallLevel(findings),
        findings,
        ec_office: reading.result.issuing_office,
        ec_period_from: reading.result.period_from,
        ec_period_to: reading.result.period_to,
        created_by: staffUserId,
      })
      .select('id')
      .single(),
  );
  return row.id;
}

async function withCustomers(db: SupabaseClient, rows: Row[]): Promise<LegalCheck[]> {
  const ids = [...new Set(rows.map((r) => r.account_id))];
  const accounts =
    ids.length === 0
      ? []
      : must<{ id: string; full_name: string | null; phone: string | null }[]>(
          await db.from('backoffice_accounts').select('id, full_name, phone').in('id', ids),
        );
  const byId = new Map(accounts.map((a) => [a.id, a]));
  return rows.map(({ property, ...r }) => ({
    ...r,
    property_name: property?.name ?? null,
    customer_name: byId.get(r.account_id)?.full_name ?? null,
    customer_phone: byId.get(r.account_id)?.phone ?? null,
  }));
}

export async function listChecks(
  db: SupabaseClient,
  filter: { status?: string; propertyId?: string },
): Promise<LegalCheck[]> {
  let q = db
    .from('legal_checks')
    .select(CHECK_COLUMNS)
    .order('updated_at', { ascending: false })
    .limit(300);
  if (filter.status && filter.status !== 'all') q = q.eq('status', filter.status);
  if (filter.propertyId) q = q.eq('property_id', filter.propertyId);
  return withCustomers(db, must<Row[]>(await q));
}

export async function loadCheck(db: SupabaseClient, id: string): Promise<LegalCheck> {
  const row = must<Row | null>(
    await db.from('legal_checks').select(CHECK_COLUMNS).eq('id', id).maybeSingle(),
  );
  if (!row) throw notFound('Legal check');
  return (await withCustomers(db, [row]))[0]!;
}

/** Record the team's view of one finding; the overall level follows. */
export async function reviewFinding(
  db: SupabaseClient,
  id: string,
  index: number,
  review: LegalFinding['review'],
  note: string | null | undefined,
  staffUserId: string,
): Promise<void> {
  const check = await loadCheck(db, id);
  if (check.status === 'shared')
    throw new HttpError(
      409,
      'CONFLICT',
      'This check was shared with the customer and is now locked.',
    );
  const f = check.findings[index];
  if (!f) throw notFound('Finding');
  const findings = check.findings.map((x, i) =>
    i === index ? { ...x, review, staff_note: note === undefined ? x.staff_note : note } : x,
  );
  must(
    await db
      .from('legal_checks')
      .update({ findings, overall: overallLevel(findings), reviewed_by: staffUserId })
      .eq('id', id),
  );
}

/** Ready only once every amber and red finding was confirmed or dismissed; shared locks it. */
export async function updateCheck(
  db: SupabaseClient,
  id: string,
  input: { status?: LegalCheck['status']; summary?: string | null },
  staffUserId: string,
): Promise<void> {
  const check = await loadCheck(db, id);
  if (check.status === 'shared')
    throw new HttpError(
      409,
      'CONFLICT',
      'This check was shared with the customer and is now locked.',
    );
  if (input.status === 'ready' || input.status === 'shared') {
    const open = check.findings.filter((f) => f.level !== 'green' && f.review === 'open');
    if (open.length)
      throw new HttpError(
        409,
        'CONFLICT',
        `Review the ${open.length} amber or red finding(s) first.`,
      );
  }
  must(
    await db
      .from('legal_checks')
      .update({
        ...input,
        reviewed_by: staffUserId,
        ...(input.status === 'shared' ? { shared_at: new Date().toISOString() } : {}),
      })
      .eq('id', id),
  );
}
