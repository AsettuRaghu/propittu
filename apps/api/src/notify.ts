import type { SupabaseClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';
import {
  DOCUMENT_TYPE_LABELS,
  SATELLITE_CHANGE_LABELS,
  requestStatusLabel,
  type SatelliteChange,
  type DocumentType,
  type ServiceFulfilment,
  type ServiceRequestStatus,
} from '@propittu/shared';
import { propertiesInProject } from './legal/projectDisputes.js';
import { logger } from './logger.js';
import { serviceClient } from './supabase.js';

/**
 * Notifications (M8) — the single extension point: business code reports
 * WHAT happened; here we decide WHO is told and WHAT it says. Each one is
 * kept in the owner's inbox (the bell on Home, works everywhere) and pushed
 * to their phones through Expo's push service once the app is a real build.
 * Never throws and never slows the request that caused it.
 */
export type NotificationEvent =
  | { type: 'service_request.status_changed'; requestId: string; status: string }
  | { type: 'visit_report.published'; requestId: string }
  | { type: 'service_outcome.published'; requestId: string }
  | { type: 'service_request.info_requested'; requestId: string; ticketId: string }
  | { type: 'payment.received'; orderId: string | null }
  | { type: 'support_ticket.staff_replied'; ticketId: string }
  | { type: 'legal.check_shared'; checkId: string }
  | { type: 'legal.disputes_shared'; propertyId: string }
  | { type: 'legal.dispute_report_replied'; reportId: string }
  | { type: 'legal.project_dispute'; projectDisputeId: string }
  | { type: 'document.read_by_pittu'; documentId: string; line: string; differs: boolean }
  | { type: 'watch.news'; placeId: string; count: number }
  | { type: 'satellite.change'; propertyId: string; change: SatelliteChange }
  | { type: 'inbox.received'; accountId: string; count: number; filed: boolean };

interface Note {
  account_id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  entity_type: string | null;
  entity_id: string | null;
}

export function notify(event: NotificationEvent): void {
  const db = serviceClient;
  if (!db) {
    logger.info({ notification: event }, 'notification not delivered (no server key)');
    return;
  }
  waitUntil(
    deliver(db, event).catch((err: unknown) =>
      logger.warn({ err: String(err), event: event.type }, 'notification failed'),
    ),
  );
}

async function deliver(db: SupabaseClient, event: NotificationEvent): Promise<void> {
  const notes = await compose(db, event);
  if (!notes.length) return;
  const { error } = await db.from('notifications').insert(notes);
  if (error) throw new Error(error.message);
  await push(db, notes);
}

async function request(db: SupabaseClient, id: string) {
  const { data } = await db
    .from('service_requests')
    .select('id, account_id, status, fulfilment, service:services(name)')
    .eq('id', id)
    .maybeSingle();
  return data as {
    id: string;
    account_id: string;
    status: ServiceRequestStatus;
    fulfilment: ServiceFulfilment;
    service: { name: string } | null;
  } | null;
}

async function compose(db: SupabaseClient, e: NotificationEvent): Promise<Note[]> {
  const note = (
    account_id: string,
    title: string,
    body: string | null,
    url: string | null,
    entity: [string, string] | null,
  ): Note => ({
    account_id,
    kind: e.type,
    title,
    body,
    url,
    entity_type: entity?.[0] ?? null,
    entity_id: entity?.[1] ?? null,
  });

  switch (e.type) {
    case 'service_request.status_changed':
    case 'visit_report.published':
    case 'service_outcome.published':
    case 'service_request.info_requested': {
      const r = await request(db, e.requestId);
      if (!r) return [];
      const name = r.service?.name ?? 'Your request';
      const url =
        e.type === 'service_request.info_requested'
          ? `/support/${e.ticketId}`
          : `/requests/${r.id}`;
      const [title, body] =
        e.type === 'visit_report.published'
          ? [`${name}: your visit report is ready`, 'Photos and what our team saw.']
          : e.type === 'service_outcome.published'
            ? [`${name}: done`, 'See the result and the documents we saved for you.']
            : e.type === 'service_request.info_requested'
              ? [`${name}: we need a little information`, 'Reply in the app so we can carry on.']
              : [`${name}: ${requestStatusLabel(r.status, r.fulfilment)}`, null];
      return [note(r.account_id, title, body, url, ['service_request', r.id])];
    }
    case 'payment.received': {
      if (!e.orderId) return [];
      const { data } = await db
        .from('orders')
        .select('account_id')
        .eq('id', e.orderId)
        .maybeSingle();
      return data
        ? [note(data.account_id as string, 'Payment received — thank you', null, '/plan', null)]
        : [];
    }
    case 'support_ticket.staff_replied': {
      const { data } = await db
        .from('support_tickets')
        .select('id, account_id, subject, reference')
        .eq('id', e.ticketId)
        .maybeSingle();
      return data
        ? [
            note(
              data.account_id as string,
              'Our team replied',
              (data.subject as string | null) ?? (data.reference as string),
              `/support/${data.id as string}`,
              ['support_ticket', data.id as string],
            ),
          ]
        : [];
    }
    case 'legal.check_shared': {
      const { data } = await db
        .from('legal_checks')
        .select('account_id, property_id')
        .eq('id', e.checkId)
        .maybeSingle();
      return data
        ? [
            note(
              data.account_id as string,
              'Your records check is ready',
              'What the Encumbrance Certificate shows, checked against your sale deed.',
              `/properties/${data.property_id as string}/legal`,
              ['legal_check', e.checkId],
            ),
          ]
        : [];
    }
    case 'legal.disputes_shared': {
      const { data } = await db
        .from('property_disputes')
        .select('account_id')
        .eq('property_id', e.propertyId)
        .maybeSingle();
      return data
        ? [
            note(
              data.account_id as string,
              'Our team checked court cases and disputes',
              'See what we found about your project and its land.',
              `/properties/${e.propertyId}/legal`,
              ['property', e.propertyId],
            ),
          ]
        : [];
    }
    case 'legal.dispute_report_replied': {
      const { data } = await db
        .from('dispute_reports')
        .select('account_id, property_id')
        .eq('id', e.reportId)
        .maybeSingle();
      return data
        ? [
            note(
              data.account_id as string,
              'Our team replied about the dispute you told us of',
              null,
              `/properties/${data.property_id as string}/legal`,
              ['dispute_report', e.reportId],
            ),
          ]
        : [];
    }
    case 'legal.project_dispute': {
      const { data: d } = await db
        .from('project_disputes')
        .select('id, project_key, project_name, summary')
        .eq('id', e.projectDisputeId)
        .maybeSingle();
      if (!d) return [];
      const homes = await propertiesInProject(db, d.project_key as string);
      return homes.map((h) =>
        note(
          h.account_id,
          `A dispute in ${d.project_name as string}`,
          d.summary as string,
          `/properties/${h.property_id}/legal`,
          ['project_dispute', d.id as string],
        ),
      );
    }
    case 'document.read_by_pittu': {
      const { data } = await db
        .from('property_documents')
        .select('account_id, property_id, document_type')
        .eq('id', e.documentId)
        .maybeSingle();
      if (!data) return [];
      const label = DOCUMENT_TYPE_LABELS[data.document_type as DocumentType] ?? 'document';
      return [
        note(
          data.account_id as string,
          e.differs ? `Pittu read your ${label} — one thing to check` : `Pittu read your ${label}`,
          e.line,
          `/properties/${data.property_id as string}/documents`,
          ['document', e.documentId],
        ),
      ];
    }
    case 'inbox.received':
      return [
        note(
          e.accountId,
          `${e.count} document${e.count === 1 ? '' : 's'} arrived by email`,
          e.filed
            ? 'Filed under your property — Pittu is reading it.'
            : 'Choose which property it belongs to.',
          e.filed ? null : '/inbox',
          null,
        ),
      ];
    case 'satellite.change': {
      const { data } = await db
        .from('properties')
        .select('account_id, name')
        .eq('id', e.propertyId)
        .maybeSingle();
      return data
        ? [
            note(
              data.account_id as string,
              `${data.name as string}: ${SATELLITE_CHANGE_LABELS[e.change]}`,
              'Seen in the latest satellite picture — worth a site check.',
              `/properties/${e.propertyId}/satellite`,
              ['property', e.propertyId],
            ),
          ]
        : [];
    }
    case 'watch.news': {
      const { data: place } = await db
        .from('watch_places')
        .select('name, pincodes')
        .eq('id', e.placeId)
        .maybeSingle();
      if (!place) return [];
      const { data: homes } = await db
        .from('properties')
        .select('id, account_id')
        .in('pincode', (place.pincodes as string[]) ?? [])
        .eq('is_draft', false);
      return (homes ?? []).map((h) =>
        note(
          h.account_id as string,
          `News around ${place.name as string}`,
          `${e.count} new ${e.count === 1 ? 'story' : 'stories'} that may matter to your property.`,
          `/properties/${h.id as string}/news`,
          ['property', h.id as string],
        ),
      );
    }
  }
}

/** Expo push to every phone signed in to these accounts; dead tokens are removed. */
async function push(db: SupabaseClient, notes: Note[]): Promise<void> {
  const accounts = [...new Set(notes.map((n) => n.account_id))];
  const { data: tokens } = await db
    .from('push_tokens')
    .select('token, account_id')
    .in('account_id', accounts);
  const messages = (tokens ?? []).flatMap((t) =>
    notes
      .filter((n) => n.account_id === t.account_id)
      .map((n) => ({
        to: t.token as string,
        title: n.title,
        body: n.body ?? undefined,
        sound: 'default',
        data: { url: n.url },
      })),
  );
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'push send failed');
      continue;
    }
    const out = (await res.json()) as {
      data?: { status: string; details?: { error?: string } }[];
    };
    const dead = (out.data ?? []).flatMap((r, k) =>
      r.status === 'error' && r.details?.error === 'DeviceNotRegistered' ? [batch[k]!.to] : [],
    );
    if (dead.length) await db.from('push_tokens').delete().in('token', dead);
  }
}
