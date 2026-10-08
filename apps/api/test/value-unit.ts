// Pittu Value matching and arithmetic — no network, no AI, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ValueRate } from '@propittu/shared';
import { computeValue, kindFor, matchRate, type ValueInput } from '../src/value/match.js';

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
