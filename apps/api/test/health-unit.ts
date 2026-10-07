import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  financialYearLabel,
  propertyHealth,
  propertyReminders,
  sortReminders,
  type PropertyCompletion,
} from '@propittu/shared';

const now = new Date('2026-10-07T10:00:00Z');
const full: PropertyCompletion = { percent: 100, items: [], next: [] };
const half: PropertyCompletion = { percent: 50, items: [], next: [] };

test('financial year runs from 1 April', () => {
  assert.equal(financialYearLabel(new Date('2026-10-07')), '2026–27');
  assert.equal(financialYearLabel(new Date('2027-03-31')), '2026–27');
  assert.equal(financialYearLabel(new Date('2027-04-01')), '2027–28');
});

test('health: a well looked-after property scores 100', () => {
  const h = propertyHealth({
    completion: full,
    locationGood: true,
    documentTypes: ['sale_deed', 'property_tax'],
    answers: { tax_paid: { answer: 'paid', at: '2026-06-01T00:00:00Z' } },
    lastVisitAt: '2026-08-01T00:00:00Z',
    deed: 'matches',
    now,
  });
  assert.equal(h.score, 100);
  assert.ok(h.items.every((i) => i.done));
});

test('health: last year’s tax, no visit, half the details, deed unread', () => {
  const h = propertyHealth({
    completion: half,
    locationGood: false,
    documentTypes: ['sale_deed'],
    answers: { tax_paid: { answer: 'paid', at: '2026-03-15T00:00:00Z' } },
    lastVisitAt: null,
    deed: 'unread',
    now,
  });
  // 15 (half of 30) + 0 + 10 (deed only) + 0 (paid before 1 April) + 0 + 0
  assert.equal(h.score, 25);
});

test('reminders: tax, visit and Khata, overdue dates first', () => {
  const r = propertyReminders({
    property: { id: 'p1', name: 'Site 12' },
    answers: {
      tax_paid: { answer: 'not_paid', at: '2026-09-01T00:00:00Z' },
      khata_name: { answer: 'no', at: '2026-09-01T00:00:00Z' },
    },
    lastVisitAt: null,
    due: [{ service_name: 'Khata transfer', date: '2026-09-30' }],
    locationIssue: false,
    deedDiffers: 0,
    now,
  });
  const kinds = sortReminders(r).map((x) => x.kind);
  assert.equal(kinds[0], 'due', 'an overdue date comes first');
  assert.deepEqual([...kinds].sort(), ['due', 'khata', 'tax', 'visit']);
});

test('reminders: someone living there needs no visit reminder; far-off dates wait', () => {
  const r = propertyReminders({
    property: { id: 'p1', name: 'Home' },
    answers: {
      occupancy: { answer: 'self', at: '2026-09-01T00:00:00Z' },
      tax_paid: { answer: 'paid', at: '2026-05-01T00:00:00Z' },
    },
    lastVisitAt: null,
    due: [{ service_name: 'Inspection', date: '2027-06-01' }],
    locationIssue: false,
    deedDiffers: 0,
    now,
  });
  assert.deepEqual(r, []);
});
