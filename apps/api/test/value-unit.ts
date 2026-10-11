// Pittu Value matching and arithmetic — no network, no AI, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appreciation, type ValueRate } from '@propittu/shared';
import { computeValue, kindFor, matchRate, type ValueInput } from '../src/value/match.js';
import { marketRange } from '../src/value/range.js';

const rate = (r: Partial<ValueRate>): ValueRate => ({
  id: 'r',
  source_id: null,
  state: 'Karnataka',
  district: 'Bangalore Urban',
  office: 'Anekal',
  locality: 'Marasur',
  pincodes: [],
  survey_numbers: [],
  kind: 'site',
  rate_inr: 28000,
  unit: 'sqm',
  effective_from: '2023-10-01',
  status: 'published',
  page: 3,
  notes: null,
  ...r,
});
const plot: ValueInput = {
  property_type: 'land',
  state: 'Karnataka',
  district: 'Bangalore',
  pincode: '562106',
  localities: ['Marasur', 'Anekal'],
  survey_numbers: ['207/1A'],
  area_value: 1200,
  area_unit: 'sqft',
  paid_inr: 850000,
  purchase_date: '2005-08-17',
};

test('the kind of rate follows the kind of property', () => {
  assert.equal(kindFor('land', 'sqft'), 'site');
  assert.equal(kindFor('land', 'acre'), 'agricultural');
  assert.equal(kindFor('apartment', 'sqft'), 'apartment');
});

test('a site in the same village gets the village rate; per sq m becomes per sq ft', () => {
  const v = computeValue(plot, [rate({})]);
  assert.equal(v.rate?.matched_on, 'locality');
  assert.equal(v.rate?.per_sqft, 2601.29);
  assert.equal(v.government_value_inr, 3122000);
  assert.equal(v.paid_per_sqft, 708);
  assert.deepEqual(v.missing, []);
});

test('a survey-number rate beats the village rate; drafts and other districts are ignored', () => {
  const m = matchRate(plot, [
    rate({ id: 'village' }),
    rate({ id: 'survey', survey_numbers: ['207'], rate_inr: 32000 }),
    rate({ id: 'draft', status: 'draft', rate_inr: 99999 }),
    rate({ id: 'mysore', district: 'Mysore', rate_inr: 1 }),
  ]);
  assert.equal(m?.rate.id, 'survey');
  assert.equal(m?.on, 'survey_number');
});

test('the newest rate wins between equal matches; another kind never matches', () => {
  const m = matchRate(plot, [
    rate({ id: 'old', effective_from: '2019-01-01' }),
    rate({ id: 'new', effective_from: '2023-10-01' }),
    rate({ id: 'apt', kind: 'apartment' }),
  ]);
  assert.equal(m?.rate.id, 'new');
});

test('PIN codes match when the name does not; missing pieces are explained', () => {
  const byPin = matchRate({ ...plot, localities: ['Somewhere'] }, [
    rate({ locality: 'Ward 12', pincodes: ['562106'] }),
  ]);
  assert.equal(byPin?.on, 'pincode');
  const v = computeValue({ ...plot, area_unit: 'bigha', paid_inr: null }, []);
  assert.equal(v.government_value_inr, null);
  assert.equal(v.missing.length, 3);
});

/* ---- Market range (marketRange): when Pittu's comparables are enough ---- */

const comp = (per_sqft: number, i: number, same_project = true) => ({
  url: `https://example.com/${i}`,
  title: `listing ${i}`,
  kind: 'listing' as const,
  same_project,
  per_sqft,
  date: '2026-08',
});
const pages = (n: number) => Array.from({ length: n }, (_, i) => `https://example.com/${i}/`);

test('market range from agreeing comparables in the same project', () => {
  const r = marketRange({
    comparables: [comp(8000, 0), comp(8400, 1), comp(8800, 2)],
    sources: pages(3),
    area_sqft: 1240,
    government_per_sqft: 5600,
  });
  assert.equal(r.status, 'ready');
  assert.equal(r.per_sqft_low, 8000);
  assert.equal(r.per_sqft_high, 8800);
  assert.equal(r.value_low, 9_900_000); // 8000 × 1240 = 99.2 lakh → ₹99 lakh
  assert.equal(r.value_high, 10_900_000);
  assert.equal(r.confidence, 'high');
});

test('a price on a page the search never returned is ignored', () => {
  const r = marketRange({
    comparables: [comp(8000, 0), comp(8400, 1), comp(8800, 9)],
    sources: pages(3),
    area_sqft: 1240,
    government_per_sqft: null,
  });
  assert.equal(r.status, 'not_enough');
  assert.equal(r.comparables.length, 2);
});

test('outliers are dropped; too few nearby (not same project) is not enough', () => {
  const r = marketRange({
    comparables: [comp(8000, 0, false), comp(8300, 1, false), comp(30000, 2, false)],
    sources: pages(3),
    area_sqft: 1000,
    government_per_sqft: null,
  });
  assert.equal(r.status, 'not_enough');
  assert.equal(r.comparables.length, 2);
});

test('prices too far apart, or far below the government rate, are not shown', () => {
  const wide = marketRange({
    comparables: [comp(6000, 0), comp(7500, 1), comp(10000, 2)],
    sources: pages(3),
    area_sqft: 1000,
    government_per_sqft: null,
  });
  assert.equal(wide.status, 'not_enough');
  const cheap = marketRange({
    comparables: [comp(3000, 0), comp(3100, 1), comp(3200, 2)],
    sources: pages(3),
    area_sqft: 1000,
    government_per_sqft: 5000,
  });
  assert.equal(cheap.status, 'not_enough');
});

test('rents are judged on their own: a monthly range for this home', () => {
  const rent = (perSqftMonth: number, i: number) => ({
    ...comp(perSqftMonth, i),
    kind: 'rent' as const,
  });
  const r = marketRange({
    comparables: [
      comp(8000, 0),
      comp(8400, 1),
      comp(8800, 2),
      rent(24, 3),
      rent(26, 4),
      rent(27.5, 5),
    ],
    sources: pages(6),
    area_sqft: 1240,
    government_per_sqft: null,
  });
  assert.equal(r.status, 'ready');
  assert.equal(r.rent_low, 30000); // 24 × 1240 = 29,760 → ₹30,000
  assert.equal(r.rent_high, 34000); // 27.5 × 1240 = 34,100 → ₹34,000
  assert.equal(r.value_low, 9_900_000);
  const onlyRents = marketRange({
    comparables: [rent(24, 0), rent(26, 1), rent(27.5, 2)],
    sources: pages(3),
    area_sqft: 1000,
    government_per_sqft: null,
  });
  assert.equal(onlyRents.status, 'ready');
  assert.equal(onlyRents.value_low, null);
  assert.equal(onlyRents.rent_low, 24000);
});

test('appreciation since purchase', () => {
  const a = appreciation(
    {
      paid_per_sqft: 5000,
      purchase_date: '2016-10-11',
      estimate: {
        status: 'ready',
        per_sqft_low: 9500,
        per_sqft_high: 10500,
        value_low: null,
        value_high: null,
        rent_low: null,
        rent_high: null,
        confidence: 'high',
        comparables: [],
        note: null,
        updated_at: '2026-10-11T00:00:00Z',
      },
    },
    new Date('2026-10-11T00:00:00Z'),
  );
  assert.deepEqual(a, { percent: 100, per_year: 7.2, since_year: 2016 });
});

test('a flat: prices on carpet / built-up are converted, similar sizes kept, an owner’s sale counts', () => {
  const c = (
    per_sqft: number,
    i: number,
    area_sqft: number | null,
    area_basis: 'super_built_up' | 'built_up' | 'carpet' | null,
    kind: 'listing' | 'project_price' = 'listing',
  ) => ({ ...comp(per_sqft, i), kind, area_sqft, area_basis });
  // Like NCC Urban Mayfair: a 2,030 sq ft (super built-up) flat, carpet 1,302.
  const found = [
    c(10694, 0, 1730, 'super_built_up'),
    c(11286, 1, 1205, 'super_built_up'), // much smaller: left out once 3 similar exist
    c(6517, 2, 1734, 'built_up'), // → ~5,667 on super built-up: an outlier
    c(10693, 3, null, null, 'project_price'),
    c(16900, 4, 1302, 'carpet'), // carpet → ~10,840 on super built-up
  ];
  const ownerSale = {
    url: 'owner-sale:1',
    title: 'told by an owner',
    kind: 'sale' as const,
    same_project: true,
    per_sqft: 13300,
    date: '2024-10',
    area_basis: 'super_built_up' as const,
    area_sqft: 2030,
    from_owner: true,
  };
  const r = marketRange({
    comparables: found,
    sources: pages(5),
    known: [ownerSale],
    flat: true,
    carpet_ratio: 2030 / 1302,
    area_sqft: 2030,
    government_per_sqft: null,
  });
  assert.equal(r.status, 'ready');
  assert.equal(r.per_sqft_low, 10693);
  assert.equal(r.per_sqft_high, 13300, 'the owner’s sale is always inside the range');
  assert.equal(r.value_low, 21_700_000);
  assert.equal(r.value_high, 27_000_000);
  assert.ok(!r.comparables.some((x) => x.per_sqft < 6000), 'the built-up outlier is out');
});
