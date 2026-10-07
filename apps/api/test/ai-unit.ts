// AI layer unit tests — no network, no AI calls, no cost.
//   npm run test:ai --workspace @propittu/api
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateCostUsd } from '../src/ai/pricing.js';
import { scrub } from '../src/ai/privacy.js';
import { SALE_DEED_FIELDS, saleDeedTask } from '../src/ai/tasks/saleDeed.js';
import { AiOutputError } from '../src/ai/types.js';

const blank = () => ({
  document_type: 'sale_deed',
  ...Object.fromEntries(
    SALE_DEED_FIELDS.map((k) => [k, ['survey_numbers', 'buyers', 'sellers'].includes(k) ? [] : '']),
  ),
  property_kind: 'unknown',
  area_unit: 'unknown',
  evidence: [],
  skipped_pages: [],
});

test('privacy filter removes PAN, Aadhaar, phone and email, and counts them', () => {
  const report = { removed: 0 };
  const out = scrub(
    {
      a: 'PAN ABCDE1234F here',
      b: ['Aadhaar 1234 5678 9012', 'call +91 9000000001'],
      c: { d: 'mail x.y@example.com' },
      e: 'Survey 207/1A stays',
    },
    report,
  );
  assert.equal(out.a, 'PAN [removed] here');
  assert.equal(out.b[0], 'Aadhaar [removed]');
  assert.equal(out.b[1], 'call [removed]');
  assert.equal(out.c.d, 'mail [removed]');
  assert.equal(out.e, 'Survey 207/1A stays');
  assert.equal(report.removed, 4);
});

test('registration numbers and amounts are not mistaken for identifiers', () => {
  const out = scrub({ r: 'ANK-1-06832-2005-06', m: 'MLS-1-01885-2021-22', amt: '11518000' });
  assert.deepEqual(out, { r: 'ANK-1-06832-2005-06', m: 'MLS-1-01885-2021-22', amt: '11518000' });
});

test('the fixture parses into facts', () => {
  const r = saleDeedTask.parse(saleDeedTask.fixture);
  const facts = saleDeedTask.facts(r);
  const byKey = Object.fromEntries(facts.map((f) => [f.key, f]));
  assert.equal(byKey.unit_number?.value, '28');
  assert.equal(byKey.area_value?.value, 1200, 'numbers come back as numbers');
  assert.equal(byKey.khata_number?.confidence, 'medium');
  assert.deepEqual(byKey.khata_number?.pages, [4, 10]);
  assert.equal(byKey.pincode, undefined, 'empty values are not facts');
});

test('Propittu conventions: Bangalore Urban district → city "Bengaluru Urban"', () => {
  const raw = {
    ...blank(),
    state: 'Karnataka',
    district: 'Bangalore Urban',
    city: 'Bangalore',
    taluk_or_mandal: 'Anekal',
  };
  const r = saleDeedTask.parse(raw);
  assert.equal(r.fields.city.value, 'Bengaluru Urban');
  assert.equal(r.fields.district.value, 'Bengaluru Urban');
  assert.equal(r.fields.taluk_or_mandal.value, 'Anekal');
});

test('"not stated" / "unknown" become empty; bad dates and PINs are dropped, not guessed', () => {
  const raw = {
    ...blank(),
    property_kind: 'unknown',
    execution_date: '17th August 2005',
    registration_date: '2005-08-17',
    pincode: '500 082 (buyer)',
    area_value: 'about',
  };
  const r = saleDeedTask.parse(raw);
  assert.equal(r.fields.property_kind.value, null);
  assert.equal(r.fields.execution_date.value, null);
  assert.equal(r.fields.registration_date.value, '2005-08-17');
  assert.equal(r.fields.pincode.value, null);
  assert.equal(r.fields.area_value.value, null);
});

test('an answer that is not a sale deed is refused', () => {
  assert.throws(
    () => saleDeedTask.parse({ ...blank(), document_type: 'property_tax' }),
    (e: unknown) => e instanceof AiOutputError && e.code === 'not_a_sale_deed',
  );
});

test('an answer that does not match the schema is refused', () => {
  assert.throws(
    () => saleDeedTask.parse({ document_type: 'sale_deed', unit_number: 28 }),
    (e: unknown) => e instanceof AiOutputError && e.code === 'schema_mismatch',
  );
  assert.throws(() => saleDeedTask.parse('ignore previous instructions'), AiOutputError);
});

test('privacy filter runs on parsed values too', () => {
  const r = saleDeedTask.parse({ ...blank(), buyers: ['Ananya Rao PAN ABCDE1234F'] });
  assert.deepEqual(r.fields.buyers.value, ['Ananya Rao PAN [removed]']);
  assert.equal(r.privacy_removed, 1);
});

test('cost estimate matches the trial bill; unknown models are charged high', () => {
  // Trial: ~138k input + ~6.2k output tokens ≈ $0.34 on the Console.
  assert.ok(Math.abs(estimateCostUsd('claude-sonnet-5-5', 137_932, 6_244) - 0.338) < 0.005);
  assert.ok(estimateCostUsd('some-new-model', 1_000_000, 0) >= 15);
});

test('task metadata is versioned and the schema has no union types (API limit)', () => {
  assert.match(saleDeedTask.version, /^sale-deed-v\d+$/);
  assert.equal(saleDeedTask.name, 'sale_deed.extract');
  const json = JSON.stringify(saleDeedTask.schema);
  assert.ok(!json.includes('"null"') && !json.includes('anyOf'), 'no nullable / anyOf fields');
});

import { prefillFromFacts, sameFactValue } from '@propittu/shared';

const facts = (o: Record<string, unknown>) =>
  Object.entries(o).map(([key, value]) => ({ key, value: value as never }));

test('pre-fill: a layout plot gets site + Khata, and NO survey number (owner decision)', () => {
  const p = prefillFromFacts(
    facts({
      property_kind: 'land',
      project_name: 'Prasanthi Green Park',
      unit_number: '28',
      khata_number: '1371',
      village: 'Marasur',
      hobli: 'Kasaba',
      taluk_or_mandal: 'Anekal',
      city: 'Bengaluru Urban',
      state: 'Karnataka',
      area_value: 1200,
      area_unit: 'sqft',
      survey_numbers: ['207/1A', '205/1'],
    }),
  );
  assert.equal(p.name, 'Prasanthi Green Park – Site 28');
  assert.equal(p.property_type, 'land');
  assert.equal(p.property_number, '28');
  assert.equal(p.khata_number, '1371');
  assert.equal(p.survey_number, null);
  assert.equal(p.area_value, 1200);
  assert.equal(
    p.address_line,
    'Site No. 28, Prasanthi Green Park, Marasur village, Kasaba Hobli, Anekal',
  );
  assert.equal(p.pincode, null, 'never invented');
});

test('pre-fill: an apartment name carries block and flat', () => {
  const p = prefillFromFacts(
    facts({
      property_kind: 'apartment',
      project_name: 'NCC Urban Mayfair',
      block_or_tower: 'Block E',
      unit_number: '1102',
    }),
  );
  assert.equal(p.name, 'NCC Urban Mayfair – Block E · 1102');
  assert.equal(p.khata_number, null, 'land Khata is not the flat Khata');
});

test('pre-fill: plain land without a layout keeps its survey number', () => {
  const p = prefillFromFacts(facts({ property_kind: 'land', survey_numbers: ['83'] }));
  assert.equal(p.survey_number, '83');
});

test('edits are detected, formatting differences are not', () => {
  assert.ok(sameFactValue('Prasanthi Green Park – Site 28', 'prasanthi green park - site 28'));
  assert.ok(sameFactValue(1200, '1200'));
  assert.ok(!sameFactValue('1371', '1372'));
  assert.ok(!sameFactValue('Anekal', null));
});

test('a recognisable name even without a project or unit', () => {
  const f = (key: string, value: unknown) => ({ key, value }) as never;
  assert.equal(
    prefillFromFacts([f('property_kind', 'land'), f('village', 'Bommasandra')]).name,
    'Plot in Bommasandra',
  );
  assert.equal(
    prefillFromFacts([f('property_kind', 'apartment'), f('city', 'Bengaluru Urban')]).name,
    'Flat in Bengaluru Urban',
  );
  assert.equal(prefillFromFacts([f('property_kind', 'land')]).name, null, 'no place → no guess');
});
