// Pittu guided setup — fixed rules, no AI, no cost.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  carePlan,
  checkDocument,
  saleReadiness,
  guessDocumentType,
  successionPlan,
  comparePeople,
  type BuyerRelation,
  type NameLink,
  taxCoversThisYear,
  type DeedSide,
  type DocumentReading,
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
import { askTask } from '../src/pittu/ask/tasks/answer.js';

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

/* ---- Pittu reads other documents and checks them against the deed ---- */

const reading = (r: Partial<DocumentReading>): DocumentReading => ({
  document_kind: 'khata',
  owner_names: [],
  khata_number: null,
  ptin: null,
  property_id: null,
  survey_numbers: [],
  village: null,
  area_value: null,
  area_unit: null,
  issued_on: null,
  period_from: null,
  period_to: null,
  amount_inr: null,
  amount_meaning: null,
  paid_on: null,
  authority: null,
  khata_kind: null,
  land_use: null,
  note: null,
  confidence: 'high',
  ...r,
});
const DEED: DeedSide = {
  buyers: ['Ananya Rao'],
  sellers: ['Sunrise Developers Private Limited', 'Venkatappa'],
  survey_numbers: ['207/1A'],
  khata_number: '1452',
  area_sqft: 1200,
  property_type: 'land',
};
const NOW = new Date('2026-10-11T00:00:00Z');

test('a Khata still in the seller’s name, with a different number, is flagged', () => {
  const { summary, findings } = checkDocument(
    'khata',
    reading({ owner_names: ['Venkatappa'], khata_number: '1999', khata_kind: 'b_khata' }),
    DEED,
    NOW,
  );
  assert.equal(summary, 'B-Khata · 1999 · in Venkatappa');
  assert.ok(findings.some((f) => f.level === 'differs' && /previous owner/.test(f.text)));
  assert.ok(findings.some((f) => f.level === 'differs' && /Khata number 1999/.test(f.text)));
  assert.ok(findings.some((f) => /B-Khata/.test(f.text)));
});

test('this year’s tax receipt in the owner’s name: paid, matches', () => {
  const r = reading({
    document_kind: 'property_tax',
    owner_names: ['Smt. Ananya Rao'],
    period_from: '2026-04-01',
    period_to: '2027-03-31',
    amount_inr: 2450,
    amount_meaning: 'tax_paid',
    paid_on: '2026-05-10',
  });
  assert.ok(taxCoversThisYear(r, NOW));
  const { summary, findings } = checkDocument('property_tax', r, DEED, NOW);
  assert.match(summary!, /Tax for 2026–27 · ₹2,450 paid on 10 May 2026/);
  assert.deepEqual(
    findings.map((f) => f.level),
    ['ok', 'ok'],
  );
  assert.ok(!taxCoversThisYear({ ...r, period_from: '2025-04-01', period_to: '2026-03-31' }, NOW));
});

test('wrong type, farmland use and a rental agreement ending soon', () => {
  const mislabelled = checkDocument('khata', reading({ document_kind: 'property_tax' }), DEED, NOW);
  assert.ok(mislabelled.findings.some((f) => /looks like a tax receipt/.test(f.text)));
  const rtc = checkDocument(
    'land_record',
    reading({
      document_kind: 'land_record',
      land_use: 'Dry agricultural',
      survey_numbers: ['207/1A'],
    }),
    DEED,
    NOW,
  );
  assert.ok(rtc.findings.some((f) => f.level === 'ok' && /Survey number matches/.test(f.text)));
  assert.ok(rtc.findings.some((f) => /conversion order/.test(f.text)));
  const rent = checkDocument(
    'rental_agreement',
    reading({ document_kind: 'rental_agreement', amount_inr: 32000, period_to: '2026-11-20' }),
    DEED,
    NOW,
  );
  assert.match(rent.summary!, /Rent ₹32,000 a month · ends 20 Nov 2026/);
  assert.ok(rent.findings.some((f) => /time to renew/.test(f.text)));
});

test('something that isn’t a property document says so, and can be moved to Other', () => {
  const { summary, findings } = checkDocument(
    'property_tax',
    reading({ document_kind: 'other', note: 'An ID card reprint payment receipt.' }),
    DEED,
    NOW,
  );
  assert.equal(summary, 'An ID card reprint payment receipt.');
  assert.deepEqual(findings, [
    { level: 'note', text: 'This doesn’t look like a tax receipt', move_to: 'other' },
  ]);
});

/* ---- Same person, different name ---- */

test('same person: spelling, initials written out, partial and married names', () => {
  const v = (a: string, b: string, rel: BuyerRelation[] = [], links: NameLink[] = []) =>
    comparePeople(a, b, rel, links);
  assert.deepEqual(v('Laxmi Narayana', 'Lakshmi Narayan'), { verdict: 'same', reason: 'spelling' });
  assert.deepEqual(v('Shrinivas Rao', 'Srinivasa Rao'), { verdict: 'same', reason: 'spelling' });
  assert.deepEqual(v('Bandi Hanumantha Deepthi', 'B.H. Deepthi'), {
    verdict: 'same',
    reason: 'initials',
  });
  assert.deepEqual(v('Raghavendra Verma', 'Raghavendra Verma Venkata Kalidindi'), {
    verdict: 'likely',
    reason: 'partial',
  });
  const wife: BuyerRelation[] = [
    { name: 'B.H. Deepthi', relation: 'wife_of', relative: 'Prashanth Kumar' },
  ];
  assert.deepEqual(v('Deepthi Prashanth', 'B.H. Deepthi', wife), {
    verdict: 'possible',
    reason: 'married_name',
  });
  assert.deepEqual(v('Deepthi Reddy', 'B.H. Deepthi'), { verdict: 'possible', reason: 'partial' });
  assert.deepEqual(v('Ravi Kumar', 'Ananya Rao'), { verdict: 'different', reason: 'none' });
  const link: NameLink = {
    deed_name: 'B.H. Deepthi',
    other_name: 'Deepthi Reddy',
    reason: 'married_name',
  };
  assert.deepEqual(v('Smt. Deepthi Reddy', 'B.H. Deepthi', [], [link]), {
    verdict: 'same',
    reason: 'confirmed',
  });
  assert.deepEqual(
    v('Deepthi Reddy', 'B.H. Deepthi', [], [{ ...link, reason: 'not_same' }]).verdict,
    'different',
  );
});

test('documents: a married name is asked about once, then remembered', () => {
  const deed: DeedSide = {
    ...DEED,
    buyers: ['B.H. Deepthi'],
    relations: [{ name: 'B.H. Deepthi', relation: 'wife_of', relative: 'Prashanth Kumar' }],
  };
  const khata = reading({ owner_names: ['Deepthi Prashanth'], khata_number: '1452' });
  const ask = checkDocument('khata', khata, deed, NOW).findings[0]!;
  assert.match(ask.text, /married name/);
  assert.deepEqual(ask.confirm_name, {
    deed_name: 'B.H. Deepthi',
    other_name: 'Deepthi Prashanth',
  });
  const after = checkDocument(
    'khata',
    khata,
    {
      ...deed,
      links: [
        { deed_name: 'B.H. Deepthi', other_name: 'Deepthi Prashanth', reason: 'married_name' },
      ],
    },
    NOW,
  ).findings;
  assert.equal(after[0]!.level, 'ok');
  assert.equal(after[1]!.service, 'name_correction', 'records still differ → offer to fix');
});

test('Ask Pittu: answers are checked — no made-up service codes, no phone numbers', () => {
  const a = askTask.parse({
    answer: 'Call 9876543210 for help. Your Khata is 1452.',
    sources: ['sale_deed', 'sale_deed', 'general_guidance'],
    service_code: 'Khata Help!!',
    needs_team: false,
    follow_ups: ['a', 'b', 'c', 'd'],
  });
  assert.doesNotMatch(a.answer, /9876543210/);
  assert.deepEqual(a.sources, ['sale_deed', 'general_guidance']);
  assert.equal(a.service_code, null);
  assert.equal(a.follow_ups.length, 3);
});

test('ready for your family: what heirs need, and the state’s process', () => {
  const plan = successionPlan({
    ctx: { ...BLR_FLAT, documents: ['sale_deed', 'khata'], buyers: ['Ananya Rao', 'Karthik Rao'] },
    family_members: 0,
    nominees: 1,
    loan_on_property: true,
  });
  assert.deepEqual(
    plan.steps.map((s) => [s.key, s.done]),
    [
      ['nominee', true],
      ['family', false],
      ['will', false],
      ['deed', true],
      ['ec', false],
      ['khata', true],
      ['loan', false],
      ['joint', false],
    ],
  );
  assert.equal(plan.done, 3);
  assert.deepEqual(plan.steps.find((s) => s.key === 'will')!.action, {
    kind: 'service',
    code: 'will_succession',
  });
  assert.match(plan.process, /GBA/);
});

test('emailed documents: a first guess at the type from the name and subject', () => {
  assert.equal(guessDocumentType('GBA property tax receipt 2026-27.pdf'), 'property_tax');
  assert.equal(guessDocumentType('eKhata_1535822725.pdf'), 'khata');
  assert.equal(guessDocumentType('EC Form 15 Yelahanka.pdf'), 'encumbrance_certificate');
  assert.equal(guessDocumentType('Rental agreement renewal - flat 1102'), 'rental_agreement');
  assert.equal(guessDocumentType('BESCOM bill Sept.jpg'), 'utility_bill');
  assert.equal(guessDocumentType('IMG_2041.jpg'), null);
});

test('get sale-ready: a Bengaluru builder flat with a short EC and a loan', () => {
  const r = saleReadiness({
    ctx: { ...BLR_FLAT, documents: ['sale_deed', 'khata', 'encumbrance_certificate'] },
    answers: { ekhata: 'yes' },
    ec_years: 2,
    project_dispute: true,
    names_differ: false,
    loan_on_property: true,
    tax_paid_this_year: true,
    government_value_inr: 15_000_000,
  });
  assert.deepEqual(
    r.steps.map((s) => [s.key, s.done]),
    [
      ['deed', true],
      ['ec', false],
      ['khata', true],
      ['tax', true],
      ['oc', false],
      ['loan', false],
      ['names', true],
      ['disputes', false],
    ],
  );
  assert.equal(r.steps.find((s) => s.key === 'ec')!.service, 'ec_request');
  assert.match(r.steps.find((s) => s.key === 'ec')!.why, /about 2 years/);
  assert.match(r.note!, /1,50,00,000/);
});
