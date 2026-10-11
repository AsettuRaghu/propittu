import type { SupabaseClient } from '@supabase/supabase-js';
import {
  checkDocument,
  inBengaluruCity,
  taxCoversThisYear,
  type DeedSide,
  type DocumentPittu,
  type DocumentReading,
  type DocumentType,
  type BuyerRelation,
  type NameLink,
} from '@propittu/shared';
import { deedFactValues, factList, factText } from '../deeds/facts.js';
import { logger } from '../logger.js';

/**
 * What Pittu's reading of a short document means (application layer).
 * Pittu reads; here we compare with the deed and act on what's plainly
 * there — the owner never has to say it again:
 *
 *  - a receipt for this year's tax → "tax paid" (health and reminders follow);
 *  - a Khata / e-Khata in the owner's name → the Khata question answered;
 *  - a Khata number or PTIN the property didn't have → filled in;
 *  - a rental agreement → "rented", and when it ends;
 *  - anything that differs from the deed → on the team's Review list.
 */

const SQFT: Record<string, number> = {
  sqft: 1,
  sqm: 10.7639,
  sqyd: 9,
  acre: 43_560,
  guntha: 1_089,
  cent: 435.6,
};

async function deedSide(db: SupabaseClient, propertyId: string): Promise<DeedSide | null> {
  const [{ values }, { data: p }, { data: deedRead }] = await Promise.all([
    deedFactValues(db, propertyId),
    db
      .from('properties')
      .select('account_id, property_type, khata_number, area_value, area_unit')
      .eq('id', propertyId)
      .maybeSingle(),
    db
      .from('document_analyses')
      .select('result')
      .eq('property_id', propertyId)
      .eq('task', 'sale_deed.extract')
      .eq('status', 'ready')
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!p) return null;
  const { data: links } = await db
    .from('name_links')
    .select('deed_name, other_name, reason')
    .eq('account_id', p.account_id as string);
  const area = (p.area_value as number | null) ?? null;
  const relations = (deedRead?.result as { buyer_relations?: BuyerRelation[] } | null)
    ?.buyer_relations;
  return {
    buyers: factList(values.get('buyers')),
    sellers: factList(values.get('sellers')),
    survey_numbers: factList(values.get('survey_numbers')),
    khata_number: (p.khata_number as string | null) ?? factText(values.get('khata_number')),
    area_sqft: area ? area * (SQFT[(p.area_unit as string) ?? 'sqft'] ?? 1) : null,
    property_type: p.property_type as string,
    relations: Array.isArray(relations) ? relations : [],
    links: (links ?? []) as NameLink[],
  };
}

/** After Pittu reads a short document: act on what it plainly shows. Never throws. */
export async function actOnReading(
  db: SupabaseClient,
  job: { account_id: string; property_id: string; document_id: string },
  reading: DocumentReading,
): Promise<void> {
  try {
    const deed = await deedSide(db, job.property_id);
    const { findings } = checkDocument(reading.document_kind as DocumentType, reading, deed);
    const answered = new Map(
      (
        (
          await db
            .from('property_answers')
            .select('question_id, answer')
            .eq('property_id', job.property_id)
        ).data ?? []
      ).map((a) => [a.question_id as string, a.answer as string]),
    );
    const answer = (question: string, value: string, overwrite = false) =>
      !overwrite && answered.has(question)
        ? null
        : db.from('property_answers').upsert(
            {
              property_id: job.property_id,
              account_id: job.account_id,
              question_id: question,
              answer: value,
              answered_by: null,
              answered_at: new Date().toISOString(),
            },
            { onConflict: 'property_id,question_id' },
          );

    const ownerMatches = findings.some(
      (f) => f.level === 'ok' && f.text.startsWith('In the owner'),
    );
    if (reading.document_kind === 'property_tax' && taxCoversThisYear(reading)) {
      // A receipt for this year beats an older answer.
      await answer('tax_paid', 'paid', true);
    }
    if (reading.document_kind === 'khata' && ownerMatches) {
      const { data: prop } = await db
        .from('properties')
        .select('state, city')
        .eq('id', job.property_id)
        .maybeSingle();
      const bengaluru = inBengaluruCity({
        state: (prop?.state as string | null) ?? null,
        property_type: '',
        buyers: [],
        account_name: null,
        khata_number: null,
        documents: [],
        deed: {
          unit_number: null,
          project_name: null,
          developer: null,
          sellers: [],
          city: (prop?.city as string | null) ?? null,
          district: null,
          taluk: null,
          ptin: null,
        },
      });
      const isEkhata = reading.khata_kind === 'e_khata';
      if (bengaluru && isEkhata) await answer('ekhata', 'yes', true);
      else if (!bengaluru) await answer('khata_name', 'yes', true);
    }
    if (reading.document_kind === 'rental_agreement') {
      await answer('occupancy', 'rented');
      if (reading.period_to) {
        const days = (Date.parse(reading.period_to) - Date.now()) / 86_400_000;
        await answer('tenancy_end', days <= 90 ? 'soon' : 'later', true);
      }
    }

    // Record numbers the property didn't have yet.
    const fill: Record<string, string> = {};
    const { data: current } = await db
      .from('properties')
      .select('khata_number, field_sources')
      .eq('id', job.property_id)
      .maybeSingle();
    if (reading.khata_number && !current?.khata_number && reading.document_kind === 'khata') {
      fill.khata_number = reading.khata_number;
    }
    if (Object.keys(fill).length) {
      const sources = { ...((current?.field_sources as Record<string, string>) ?? {}) };
      for (const k of Object.keys(fill)) sources[k] = 'ai';
      await db
        .from('properties')
        .update({ ...fill, field_sources: sources })
        .eq('id', job.property_id);
    }

    // Something differs from the deed: the team takes a look.
    if (findings.some((f) => f.level === 'differs')) {
      const { data: review } = await db
        .from('property_reviews')
        .select('reasons, status')
        .eq('property_id', job.property_id)
        .maybeSingle();
      const reasons = [...new Set([...((review?.reasons as string[]) ?? []), 'document_differs'])];
      await db.from('property_reviews').upsert(
        {
          property_id: job.property_id,
          account_id: job.account_id,
          reasons,
          status: 'open',
        },
        { onConflict: 'property_id' },
      );
    }
  } catch (err) {
    logger.warn({ err: String(err), documentId: job.document_id }, 'acting on a reading failed');
  }
}

/** Pittu's line for each document, for the documents list (latest reading of each). */
export async function documentLines(
  db: SupabaseClient,
  propertyId: string,
  documents: { id: string; document_type: DocumentType }[],
): Promise<Map<string, DocumentPittu>> {
  const out = new Map<string, DocumentPittu>();
  if (!documents.length) return out;
  const { data } = await db
    .from('document_analyses')
    .select('document_id, status, result, created_at')
    .eq('property_id', propertyId)
    .eq('task', 'document.read')
    .order('created_at', { ascending: false });
  const rows = (data ?? []) as {
    document_id: string;
    status: string;
    result: DocumentReading | null;
  }[];
  if (!rows.length) return out;
  const deed = await deedSide(db, propertyId);
  for (const d of documents) {
    const row = rows.find((r) => r.document_id === d.id);
    if (!row) continue;
    if (row.status === 'ready' && row.result) {
      out.set(d.id, { status: 'ready', ...checkDocument(d.document_type, row.result, deed) });
    } else {
      out.set(d.id, {
        status: row.status === 'failed' ? 'failed' : 'reading',
        summary: null,
        findings: [],
      });
    }
  }
  return out;
}
