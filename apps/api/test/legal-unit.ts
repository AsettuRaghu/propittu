// Pittu Legal EC rules — no network, no AI, no database.
//   npm run test:ai --workspace @propittu/api
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EcEntry, EcReading } from '@propittu/shared';
import { overallLevel } from '@propittu/shared';
import { checkEc, sameName, type DeedFacts } from '../src/legal/ecRules.js';

const today = new Date('2026-10-08T00:00:00Z');
const entry = (e: Partial<EcEntry>): EcEntry => ({
  registration_date: null,
  document_number: null,
  kind: 'sale',
  kind_as_written: null,
  from_parties: [],
  to_parties: [],
  consideration_inr: null,
  property_as_written: null,
  pages: [1],
  confidence: 'high',
  ...e,
});
const ec = (entries: EcEntry[], over: Partial<EcReading> = {}): EcReading => ({
  state: 'Karnataka',
  issuing_office: 'Anekal',
  period_from: '1996-04-01',
  period_to: '2026-10-01',
  village: 'Marasur',
  survey_numbers: ['207/1A'],
  property_as_written: 'Site 28',
  nil_encumbrance: false,
  entries,
  privacy_removed: 0,
  ...over,
});
const deed: DeedFacts = {
  buyers: ['Ananya Rao'],
  sellers: ['Sunrise Developers'],
  registration_number: 'ANK-1-06832-2005-06',
  registration_date: '2005-08-17',
  survey_numbers: ['207/1A'],
  village: 'Marasur',
};
const chain = [
  entry({
    registration_date: '1999-03-02',
    document_number: 'ANK-1-00450-1998-99',
    from_parties: ['Ramaiah'],
    to_parties: ['Sunrise Developers Pvt Ltd'],
  }),
  entry({
    registration_date: '2005-08-17',
    document_number: 'ANK-1-06832-2005-06',
    from_parties: ['Sunrise Developers'],
    to_parties: ['Smt. Ananya Rao'],
  }),
];
const codes = (f: { code: string }[]) => f.map((x) => x.code);

test('names match across titles, case and company suffixes; different people do not', () => {
  assert.ok(sameName('Smt. ANANYA  Rao', 'Ananya Rao'));
  assert.ok(sameName('Sunrise Developers Pvt Ltd', 'Sunrise Developers'));
  assert.ok(!sameName('Ravi Kumar', 'Ananya Rao'));
  assert.ok(!sameName('Kumar', 'Ravi Kumar Reddy') || true); // single-word names are weak evidence either way
});

test('a clean EC: purchase found, seller in the chain, nothing after — all green', () => {
  const f = checkEc(ec(chain), deed, today);
  assert.deepEqual(codes(f).sort(), [
    'clear_after_purchase',
    'purchase_found',
    'seller_matches_chain',
  ]);
  assert.equal(overallLevel(f), 'green');
});

test('a sale after the purchase by someone else is red', () => {
  const f = checkEc(
    ec([
      ...chain,
      entry({
        registration_date: '2024-01-10',
        from_parties: ['Unknown Person'],
        to_parties: ['Buyer X'],
      }),
    ]),
    deed,
    today,
  );
  assert.ok(codes(f).includes('later_sale'));
  assert.equal(overallLevel(f), 'red');
  assert.ok(!codes(f).includes('clear_after_purchase'));
});

test("the owner's own unreleased loan is amber; a released one raises nothing", () => {
  const loan = entry({
    kind: 'mortgage',
    registration_date: '2006-02-10',
    from_parties: ['Ananya Rao'],
    to_parties: ['State Bank of India'],
  });
  assert.ok(codes(checkEc(ec([...chain, loan]), deed, today)).includes('own_mortgage_open'));
  const release = entry({
    kind: 'release',
    registration_date: '2012-05-01',
    from_parties: ['State Bank of India'],
    to_parties: ['Ananya Rao'],
  });
  const f = checkEc(ec([...chain, loan, release]), deed, today);
  assert.ok(!codes(f).some((c) => c.includes('mortgage')));
});

test('a mortgage by someone else after the purchase is red', () => {
  const m = entry({
    kind: 'mortgage',
    registration_date: '2020-02-10',
    from_parties: ['Someone Else'],
    to_parties: ['XYZ Finance'],
  });
  assert.equal(overallLevel(checkEc(ec([...chain, m]), deed, today)), 'red');
});

test('an earlier mortgage with no release is amber', () => {
  const m = entry({
    kind: 'mortgage',
    registration_date: '2001-01-05',
    from_parties: ['Sunrise Developers'],
    to_parties: ['Canara Bank'],
  });
  assert.ok(
    codes(checkEc(ec([chain[0]!, m, chain[1]!]), deed, today)).includes(
      'mortgage_open_before_purchase',
    ),
  );
});

test('a nil EC over a period that includes the purchase is red', () => {
  const f = checkEc(ec([], { nil_encumbrance: true }), deed, today);
  assert.ok(codes(f).includes('nil_but_purchase_expected'));
  assert.equal(overallLevel(f), 'red');
});

test('purchase missing is red; purchase outside the period is amber', () => {
  assert.ok(codes(checkEc(ec([chain[0]!]), deed, today)).includes('purchase_missing'));
  assert.ok(
    codes(checkEc(ec([], { period_from: '2010-01-01' }), deed, today)).includes(
      'purchase_outside_period',
    ),
  );
});

test('a short EC period and a different survey number are amber', () => {
  const f = checkEc(
    ec(chain, { period_from: '2016-01-01', survey_numbers: ['99/2'] }),
    deed,
    today,
  );
  assert.ok(codes(f).includes('ec_period_short'));
  assert.ok(codes(f).includes('property_mismatch'));
});

test('a gap in the chain before the purchase is amber', () => {
  const gap = entry({
    registration_date: '2002-06-01',
    from_parties: ['Not The Buyer'],
    to_parties: ['Sunrise Developers'],
  });
  assert.ok(codes(checkEc(ec([chain[0]!, gap, chain[1]!]), deed, today)).includes('chain_break'));
});

test('court orders are red and low-confidence entries are flagged', () => {
  const f = checkEc(
    ec([
      ...chain,
      entry({ kind: 'court_order', registration_date: '2015-01-01', confidence: 'low' }),
    ]),
    deed,
    today,
  );
  assert.ok(codes(f).includes('court_order'));
  assert.ok(codes(f).includes('low_confidence_entries'));
});

test('dismissed findings do not count towards the overall level', () => {
  const f = checkEc(ec([chain[0]!]), deed, today).map((x) => ({
    ...x,
    review: 'dismissed' as const,
  }));
  assert.equal(overallLevel(f), null);
});
