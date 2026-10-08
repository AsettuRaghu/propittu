// AI layer unit tests — no network, no AI calls, no cost.
//   npm run test:ai --workspace @propittu/api
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateCostUsd } from '../src/pittu/core/pricing.js';
import { scrub } from '../src/pittu/core/privacy.js';
import { encumbranceTask } from '../src/pittu/read/tasks/encumbrance.js';
import { newsPrompt, newsTask } from '../src/pittu/watch/tasks/news.js';
import { mentions, parseFeed } from '../src/watch/rss.js';
import { SALE_DEED_FIELDS, saleDeedTask } from '../src/pittu/read/tasks/saleDeed.js';
import { AiOutputError } from '../src/pittu/core/types.js';

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

import { deedGaps, hasUsefulPrefill, prefillFromFacts, sameFactValue } from '@propittu/shared';

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

test('the society / project name leads the suggested name', () => {
  const f = (key: string, value: unknown) => ({ key, value }) as never;
  const project = f('project_name', 'Prasanthi Green Park');
  assert.equal(
    prefillFromFacts([f('property_kind', 'land'), project, f('unit_number', '28')]).name,
    'Prasanthi Green Park – Site 28',
  );
  assert.equal(
    prefillFromFacts([f('property_kind', 'land'), project, f('village', 'Bommasandra')]).name,
    'Prasanthi Green Park, Bommasandra',
  );
  assert.equal(prefillFromFacts([project]).name, 'Prasanthi Green Park');
});

test('a reading with nothing about a property counts as empty', () => {
  const f = (key: string, value: unknown) => ({ key, value }) as never;
  assert.equal(hasUsefulPrefill(prefillFromFacts([])), false);
  assert.equal(hasUsefulPrefill(prefillFromFacts([f('buyers', ['A. Kumar'])])), false);
  assert.equal(hasUsefulPrefill(prefillFromFacts([f('khata_number', '123/4')])), true);
  assert.equal(hasUsefulPrefill(prefillFromFacts([f('village', 'Bommasandra')])), true);
});

test('deed gaps: what the saved property says differently from the deed', () => {
  const f = (key: string, value: unknown) => ({ key, value }) as never;
  const facts = [f('pincode', '562106'), f('city', 'Bengaluru'), f('khata_number', '123/4')];
  const gaps = deedGaps(facts, { pincode: '560064', city: 'bengaluru', khata_number: null });
  assert.deepEqual(
    gaps.map((g) => [g.field, g.deed, g.yours]),
    [
      ['pincode', '562106', '560064'],
      ['khata_number', '123/4', null],
    ],
    'formatting differences (case) are not gaps; a cleared value is',
  );
  assert.deepEqual(deedGaps([], { pincode: '560064' }), [], 'no deed reading, no gaps');
});

test('deed fill: empty fields take the deed’s values; typed ones and the name are kept', async () => {
  const { deedFill } = await import('../src/deedFill.js');
  const f = (key: string, value: unknown) => ({ key, value }) as never;
  const facts = [
    f('pincode', '562106'),
    f('khata_number', '123/4'),
    f('sale_consideration_inr', 4200000),
    f('area_value', 1200),
    f('area_unit', 'sqft'),
    f('project_name', 'Prasanthi Green Park'),
  ];
  const property = {
    name: 'My plot',
    pincode: '560064',
    khata_number: null,
    purchase_price_inr: null,
    area_value: null,
    area_unit: null,
  } as never;
  assert.deepEqual(deedFill(property, facts), {
    address_line: 'Prasanthi Green Park',
    khata_number: '123/4',
    purchase_price_inr: 4200000,
    area_value: 1200,
    area_unit: 'sqft',
  });
});

test('deed fill: a difference read with high confidence takes the deed’s value; a doubtful one waits', async () => {
  const { deedFill } = await import('../src/deedFill.js');
  const f = (key: string, value: unknown, confidence: string) =>
    ({ key, value, confidence }) as never;
  const property = {
    name: 'One',
    pincode: '560064',
    city: 'Bangalore',
    khata_number: '99/1',
  } as never;
  const patch = deedFill(property, [
    f('pincode', '562106', 'high'),
    f('khata_number', '123/4', 'medium'),
    f('city', 'bangalore', 'high'),
  ]);
  assert.equal(patch.pincode, '562106', 'high confidence: applied');
  assert.equal(patch.khata_number, undefined, 'medium confidence: left for the owner');
  assert.equal(patch.city, undefined, 'same value in different case: nothing to change');
});

/* ---------- Pittu Read: Encumbrance Certificate ---------- */

const ecFixture = () =>
  JSON.parse(JSON.stringify(encumbranceTask.fixture)) as Record<string, unknown>;

test('EC: the fixture parses into entries; amounts become numbers; no deed facts', () => {
  const r = encumbranceTask.parse(ecFixture());
  assert.equal(r.issuing_office, 'Anekal');
  assert.equal(r.entries.length, 2);
  assert.equal(r.entries[0]?.kind, 'sale');
  assert.equal(r.entries[0]?.consideration_inr, 850000);
  assert.deepEqual(r.entries[1]?.to_parties, ['State Bank of India']);
  assert.equal(r.nil_encumbrance, false);
  assert.deepEqual(encumbranceTask.facts(r), []);
});

test('EC: a nil EC has no entries; "nil" with entries is not trusted as nil', () => {
  const nil = { ...ecFixture(), nil_encumbrance: true, entries: [] };
  assert.equal(encumbranceTask.parse(nil).nil_encumbrance, true);
  const contradictory = { ...ecFixture(), nil_encumbrance: true };
  assert.equal(encumbranceTask.parse(contradictory).nil_encumbrance, false);
});

test('EC: a document that is not an EC is refused', () => {
  assert.throws(
    () => encumbranceTask.parse({ ...ecFixture(), document_type: 'sale_deed' }),
    (e: unknown) => e instanceof AiOutputError && e.code === 'not_an_ec',
  );
});

test('EC: bad dates are dropped and identifiers in names are removed', () => {
  const raw = ecFixture();
  const entries = raw.entries as Record<string, unknown>[];
  entries[0] = {
    ...entries[0],
    registration_date: '17/08/2005',
    from_parties: ['Ravi Kumar ABCDE1234F'],
  };
  const r = encumbranceTask.parse(raw);
  assert.equal(r.entries[0]?.registration_date, null);
  assert.ok(!r.entries[0]?.from_parties[0]?.includes('ABCDE1234F'));
  assert.ok(r.privacy_removed > 0);
});

/* ---------- Pittu Watch: news ---------- */

test('Watch: the prompt numbers headlines with source and date', () => {
  const p = newsPrompt({ name: 'Whitefield', district: 'Bangalore', state: 'Karnataka' }, [
    {
      title: 'Metro reaches Whitefield',
      domain: 'thehindu.com',
      published_at: '2026-10-02T04:00:00Z',
    },
  ]);
  assert.ok(p.includes('Locality: Whitefield, Bangalore, Karnataka'));
  assert.ok(p.includes('1. Metro reaches Whitefield — thehindu.com, 2026-10-02'));
});

test('Watch: irrelevant items get no summary; summaries are filtered for identifiers', () => {
  const r = newsTask.parse({
    items: [
      {
        n: 1,
        relevant: true,
        category: 'metro_rail',
        impact: 'positive',
        summary: 'Call 9876543210 for metro news.',
        confidence: 'high',
      },
      {
        n: 2,
        relevant: false,
        category: 'other',
        impact: 'neutral',
        summary: 'Something',
        confidence: 'medium',
      },
    ],
  });
  assert.ok(!r[0]?.summary?.includes('9876543210'));
  assert.equal(r[1]?.summary, null);
});

test('Watch: RSS items parse (CDATA, entities, dates) and match localities by whole word', () => {
  const xml = `<rss><channel>
    <item><title><![CDATA[Metro to reach Whitefield by June &amp; more]]></title>
      <link>https://example.com/a</link><description><![CDATA[<p>BMRCL says the line will open.</p>]]></description>
      <pubDate>Thu, 02 Oct 2026 04:00:00 GMT</pubDate></item>
    <item><title>Whitefieldish news</title><link>https://example.com/b</link></item>
    <item><title>No link</title></item>
  </channel></rss>`;
  const items = parseFeed(xml, 'https://www.thehindu.com/feed');
  assert.equal(items.length, 2);
  assert.equal(items[0]?.title, 'Metro to reach Whitefield by June & more');
  assert.equal(items[0]?.snippet, 'BMRCL says the line will open.');
  assert.equal(items[0]?.domain, 'thehindu.com');
  assert.equal(items[0]?.published_at, '2026-10-02T04:00:00.000Z');
  assert.ok(mentions(items[0]!, 'Whitefield'));
  assert.ok(!mentions(items[1]!, 'Whitefield'));
  assert.ok(!mentions(items[0]!, 'KR'));
});
