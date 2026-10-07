import { Router } from 'express';
import { propertyReminders, sortReminders, type Property } from '@propittu/shared';
import { auth } from '../auth.js';
import { must, ok } from '../errors.js';
import { loadInsights } from '../insights.js';
import { loadDeedPlaces } from '../locationCheck.js';
import { deedKey, storedIssue } from '../locationRecord.js';
import { PROPERTY_COLUMNS, toProperty, type PropertyRow } from './properties.js';

/**
 * GET /reminders — "Coming up" across the account's properties: tax for
 * this financial year, visits overdue, Khata, dates our team recorded,
 * pin and deed issues. Rules in packages/shared/src/reminders.ts.
 * (Plan renewal is added by the app, which already has the plan.)
 */
export const remindersRouter = Router();

remindersRouter.get('/reminders', async (req, res) => {
  const { db, accountId } = auth(req);
  const [propsRes, docsRes] = await Promise.all([
    db
      .from('properties')
      .select(`${PROPERTY_COLUMNS}, location_check`)
      .eq('account_id', accountId)
      .eq('is_draft', false),
    db
      .from('property_documents')
      .select('property_id, document_type')
      .eq('account_id', accountId)
      .eq('upload_status', 'ready'),
  ]);
  const rows = must<PropertyRow[]>(propsRes);
  const properties: Property[] = rows.map(toProperty);
  const docTypes = new Map<string, string[]>();
  for (const d of must<{ property_id: string; document_type: string }[]>(docsRes)) {
    docTypes.set(d.property_id, [...(docTypes.get(d.property_id) ?? []), d.document_type]);
  }
  const ids = properties.map((p) => p.id);
  const [insights, deeds] = await Promise.all([
    loadInsights(db, properties, docTypes),
    loadDeedPlaces(db, ids),
  ]);

  const reminders = properties.flatMap((p, i) => {
    const insight = insights.get(p.id);
    if (!insight) return [];
    const issue = storedIssue(rows[i]!.location_check, p, deedKey(deeds.get(p.id) ?? null)).issue;
    return propertyReminders({
      property: { id: p.id, name: p.name },
      answers: insight.answers,
      lastVisitAt: insight.lastVisitAt,
      due: insight.due,
      locationIssue: !!issue && !issue.confirmed,
      deedDiffers: insight.gaps.filter((g) => g.yours !== null).length,
    });
  });
  ok(res, sortReminders(reminders));
});
