// Pittu guided setup — fixed rules, no AI, no cost.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  carePlan,
  documentChecklist,
  isValidAnswer,
  matchBuyerName,
  pittuQuestions,
  reachProblem,
  reviewReasons,
  type PropertyReach,
  type PittuContext,
} from '@propittu/shared';

const KA_PLOT: PittuContext = {
  state: 'Karnataka',
  property_type: 'land',
  buyers: ['Ananya Rao'],
  account_name: 'Ravi Kumar',
  khata_number: '1452',
  documents: ['sale_deed'],
};

test('name matching ignores titles, relation clauses, order and initials', () => {
  assert.equal(matchBuyerName('Deepthi B H', ['B.H. Deepthi']), 'match');
  assert.equal(matchBuyerName('Smt. B. H. Deepthi D/o Subba Raju', ['B.H. Deepthi']), 'match');
  assert.equal(
    matchBuyerName('Kalidindi Raghavendra Verma Venkata', ['Raghavendra Verma Venkata Kalidindi']),
    'match',
  );
  assert.equal(
    matchBuyerName('Raghavendra Varma Venkata Kalidindi', ['Raghavendra Verma Venkata Kalidindi']),
    'match',
    'one-letter spelling difference',
  );
});

test('partial, different, missing and company names', () => {
  assert.equal(matchBuyerName('Raghu Verma', ['Raghavendra Verma Venkata Kalidindi']), 'likely');
  assert.equal(matchBuyerName('Ravi Kumar', ['Ananya Rao']), 'no_match');
  assert.equal(matchBuyerName(null, ['Ananya Rao']), 'unknown');
  assert.equal(matchBuyerName('Ravi Kumar', []), 'unknown');
  assert.equal(matchBuyerName('Ravi Kumar', ['M/s Sunrise Developers Pvt Ltd']), 'no_match');
});

test('owner by name → no relationship question; mismatch → asked first', () => {
  const ids = (ctx: PittuContext) => pittuQuestions(ctx, {}).map((q) => q.id);
  assert.equal(ids({ ...KA_PLOT, account_name: 'Ananya Rao' })[0], 'plot_built');
  assert.equal(ids(KA_PLOT)[0], 'relation');
});

test('questions fit the property and the state', () => {
  const plot = pittuQuestions(KA_PLOT, {}).map((q) => q.id);
  assert.deepEqual(plot, ['relation', 'plot_built', 'last_visit', 'khata_name', 'tax_paid']);
  const tgFlat = pittuQuestions(
    { ...KA_PLOT, state: 'Telangana', property_type: 'apartment', account_name: 'Ananya Rao' },
    { occupancy: 'self' },
  ).map((q) => q.id);
  assert.deepEqual(
    tgFlat,
    ['occupancy', 'ptin', 'tax_paid'],
    'living there → no "last seen"; Telangana → PTIN, no Khata',
  );
});

test('wording follows the ownership answer', () => {
  const khata = (relation: string) =>
    pittuQuestions(KA_PLOT, { relation }).find((q) => q.id === 'khata_name')!.title;
  assert.equal(khata('owner'), 'Is the Khata (1452) in your name yet?');
  assert.equal(khata('manage'), 'Is the Khata (1452) in Ananya Rao’s name yet?');
  assert.equal(khata('joint'), 'Is the Khata (1452) in all the owners’ names yet?');
  const tax = pittuQuestions(KA_PLOT, { relation: 'family' }).find(
    (q) => q.id === 'tax_paid',
  )!.title;
  assert.equal(tax, 'Has this year’s property tax been paid?');
});

test('answers are validated against the question bank', () => {
  assert.ok(isValidAnswer(KA_PLOT, {}, 'plot_built', 'vacant'));
  assert.ok(isValidAnswer(KA_PLOT, {}, 'plot_built', 'skipped'));
  assert.ok(!isValidAnswer(KA_PLOT, {}, 'plot_built', 'castle'));
  assert.ok(!isValidAnswer(KA_PLOT, {}, 'ptin', 'yes'), 'PTIN is not asked in Karnataka');
});

test('care plan: every answer leads to a service, most important first, max 3', () => {
  const plan = carePlan(KA_PLOT, {
    relation: 'manage',
    plot_built: 'vacant',
    khata_name: 'no',
    tax_paid: 'not_paid',
  });
  assert.deepEqual(
    plan.map((p) => p.service_code),
    ['khata_mutation_assistance', 'property_tax_assistance', 'site_inspection'],
  );
  assert.ok(plan[0]!.legal, 'Khata help is flagged for legal review');
  assert.match(plan[0]!.reason, /Ananya Rao’s name/);
  assert.deepEqual(
    carePlan(KA_PLOT, {
      plot_built: 'house',
      last_visit: 'recent',
      khata_name: 'yes',
      tax_paid: 'paid',
    }).map((p) => p.service_code),
    ['maintenance'],
  );
});

test('documents checklist follows the state', () => {
  assert.deepEqual(
    documentChecklist(KA_PLOT).map((d) => [d.document_type, d.have]),
    [
      ['sale_deed', true],
      ['property_tax', false],
      ['khata', false],
    ],
  );
  assert.equal(documentChecklist({ ...KA_PLOT, state: 'Telangana' }).length, 2);
});

test('Review list: who goes on it and why', () => {
  const owner = { ...KA_PLOT, account_name: 'Ananya Rao' };
  const typed = [{ key: 'city', status: 'confirmed', confidence: 'high' }];
  assert.deepEqual(reviewReasons(owner, {}, typed), [], 'owner by name, clean facts → not listed');
  assert.deepEqual(reviewReasons(KA_PLOT, { relation: 'owner' }, typed), ['name_mismatch']);
  assert.deepEqual(reviewReasons(KA_PLOT, { relation: 'manage' }, typed), [
    'name_mismatch',
    'not_owner',
  ]);
  assert.deepEqual(
    reviewReasons(owner, {}, [
      { key: 'property_kind', status: 'edited', confidence: 'high' },
      { key: 'pincode', status: 'confirmed', confidence: 'low' },
      { key: 'village', status: 'edited', confidence: 'low' },
    ]),
    ['type_changed', 'low_confidence'],
    'an unsure value the customer corrected is fine; one accepted as read is not',
  );
  assert.deepEqual(
    reviewReasons({ ...KA_PLOT, account_name: null }, { relation: 'family' }, []),
    ['not_owner'],
    'no account name → no mismatch claim, but family still listed',
  );
});

test('service reach: visits need a PIN in our areas, paperwork needs a covered state', () => {
  const base: PropertyReach = {
    visits: false,
    paperwork: true,
    area_name: null,
    state: 'Telangana',
    has_pincode: true,
    exception: false,
    interested: false,
  };
  assert.equal(reachProblem({ reach: 'area' }, base), 'not_in_area');
  assert.equal(reachProblem({ reach: 'area' }, { ...base, has_pincode: false }), 'no_pincode');
  assert.equal(reachProblem({ reach: 'state' }, base), null);
  assert.equal(reachProblem({ reach: 'state' }, { ...base, paperwork: false }), 'not_in_state');
  assert.equal(reachProblem({ reach: 'everywhere' }, { ...base, paperwork: false }), null);
  assert.equal(reachProblem({ reach: 'area' }, { ...base, visits: true }), null);
  assert.equal(reachProblem({ reach: 'area' }, null), null, 'unknown → the server decides');
});

test('Review list: changing what the deed says is flagged', () => {
  const owner = { ...KA_PLOT, account_name: 'Ananya Rao' };
  assert.deepEqual(
    reviewReasons(owner, {}, [{ key: 'pincode', status: 'edited', confidence: 'high' }]),
    ['deed_changed'],
  );
  assert.deepEqual(
    reviewReasons(owner, {}, [{ key: 'khata_number', status: 'rejected', confidence: 'high' }]),
    ['deed_changed'],
    'clearing a deed value counts too',
  );
  assert.deepEqual(
    reviewReasons(owner, {}, [{ key: 'village', status: 'edited', confidence: 'high' }]),
    [],
    'not every fact is checked',
  );
});
