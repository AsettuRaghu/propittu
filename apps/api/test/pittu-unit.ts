// Pittu guided setup — fixed rules, no AI, no cost.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  carePlan,
  documentChecklist,
  documentPlan,
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
  assert.ok(
    pittuQuestions(KA_PLOT, { plot_built: 'vacant' }).some((q) => q.id === 'plot_fenced'),
    'a vacant plot → is it fenced?',
  );
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

test('care plan: every answer leads to a service, most important first, max 4', () => {
  const plan = carePlan(KA_PLOT, {
    relation: 'manage',
    plot_built: 'vacant',
    khata_name: 'no',
    tax_paid: 'not_paid',
  });
  assert.deepEqual(
    plan.map((p) => p.service_code),
    [
      'khata_mutation_assistance',
      'property_tax_assistance',
      'site_inspection',
      'property_cleaning',
    ],
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

test('documents checklist follows the property and the state', () => {
  assert.deepEqual(
    documentChecklist(KA_PLOT).map((d) => [d.document_type, d.have]),
    [
      ['sale_deed', true],
      ['encumbrance_certificate', false],
      ['khata', false],
      ['property_tax', false],
      ['land_record', false],
      ['conversion_order', false],
    ],
  );
  assert.equal(
    documentChecklist(KA_PLOT).find((d) => d.document_type === 'land_record')!.label,
    'RTC (Pahani)',
  );
  const tg = documentChecklist({ ...KA_PLOT, state: 'Telangana' });
  assert.ok(!tg.some((d) => d.document_type === 'khata'), 'no Khata in Telangana');
  assert.equal(
    tg.find((d) => d.document_type === 'conversion_order')!.label,
    'NALA conversion order',
  );
});

test('document plan: a Bengaluru builder flat, rented out', () => {
  const plan = documentPlan(BLR_FLAT, { occupancy: 'rented' });
  const key = plan.filter((d) => d.key).map((d) => d.type);
  assert.deepEqual(key, [
    'sale_deed',
    'encumbrance_certificate',
    'khata',
    'property_tax',
    'occupancy_certificate',
    'rental_agreement',
  ]);
  assert.equal(plan.find((d) => d.type === 'khata')!.label, 'e-Khata');
  assert.ok(plan.some((d) => d.type === 'rera' && !d.key));
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

/* ---- Questions that follow the deed (11 Oct 2026) ---- */

const BLR_FLAT: PittuContext = {
  state: 'Karnataka',
  property_type: 'apartment',
  buyers: ['Ananya Rao'],
  account_name: 'Ananya Rao',
  khata_number: null,
  documents: ['sale_deed'],
  deed: {
    unit_number: '1102',
    project_name: 'Lakeview Heights',
    developer: null,
    sellers: ['Sunrise Developers Private Limited'],
    city: 'Bengaluru',
    district: 'Bengaluru Urban',
    taluk: 'Bengaluru East',
    ptin: null,
  },
};

test('a Bengaluru flat bought from a builder: flat questions, OC and the e-Khata', () => {
  const ids = (answers = {}) => pittuQuestions(BLR_FLAT, answers).map((q) => q.id);
  assert.deepEqual(ids(), ['occupancy', 'oc_have', 'last_visit', 'ekhata', 'tax_paid']);
  assert.deepEqual(ids({ occupancy: 'rented' }), [
    'occupancy',
    'tenancy_end',
    'oc_have',
    'ekhata',
    'tax_paid',
  ]);
  assert.deepEqual(ids({ occupancy: 'empty' }), [
    'occupancy',
    'rent_out',
    'oc_have',
    'last_visit',
    'ekhata',
    'tax_paid',
  ]);
  assert.match(
    pittuQuestions(BLR_FLAT, {})[0]!.title,
    /flat 1102 in Lakeview Heights/,
    'Pittu names the flat from the deed',
  );
});

test('outer Bengaluru (Anekal) gets the ordinary Khata question; Telangana skips a known PTIN', () => {
  const anekal = { ...BLR_FLAT, deed: { ...BLR_FLAT.deed!, taluk: 'Anekal' } };
  assert.ok(pittuQuestions(anekal, {}).some((q) => q.id === 'khata_name'));
  assert.ok(!pittuQuestions(anekal, {}).some((q) => q.id === 'ekhata'));
  const tg = { ...BLR_FLAT, state: 'Telangana', deed: { ...BLR_FLAT.deed!, ptin: '1234567890' } };
  assert.ok(!pittuQuestions(tg, {}).some((q) => q.id === 'ptin'));
});

test('care plan: renting it out and an e-Khata to do', () => {
  assert.deepEqual(
    carePlan(BLR_FLAT, { occupancy: 'empty', rent_out: 'yes', ekhata: 'no', oc_have: 'yes' }).map(
      (p) => p.service_code,
    ),
    ['khata_mutation_assistance', 'tenant_search', 'rental_agreement', 'property_visit'],
  );
  assert.deepEqual(
    carePlan(BLR_FLAT, { occupancy: 'rented', tenancy_end: 'soon', ekhata: 'yes' }).map(
      (p) => p.service_code,
    ),
    ['rental_agreement', 'rental_management'],
  );
});
