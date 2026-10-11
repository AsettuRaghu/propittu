import assert from 'node:assert/strict';
import { test } from 'node:test';
import { locationIssueText, type LocationIssue } from '@propittu/shared';
import { checkRecord, deedKey, distanceKm, storedIssue } from '../src/locationRecord.js';
import { changeBetween, cloudyShare, square } from '../src/satellite/rules.js';

const issue: LocationIssue = {
  kind: 'pincode',
  pin_place: 'Manikonda, Ranga Reddy (500089)',
  other_place: 'Avalahalli, Bengaluru Urban',
  pincode: '560064',
  distance_km: 481,
  near: { latitude: 13.14, longitude: 77.57 },
  confirmed: false,
};
const deed = deedKey({
  village: 'Bommasandra',
  hobli: null,
  taluk: 'Anekal',
  district: 'Bengaluru Urban',
  state: 'Karnataka',
});
const p = { pincode: '560064', latitude: 17.399, longitude: 78.371 };

test('distanceKm: Bengaluru to Hyderabad is about 500 km', () => {
  const km = distanceKm([12.97, 77.59], [17.39, 78.49]);
  assert.ok(km > 480 && km < 520, String(km));
});

test('storedIssue: a check about the current pin, PIN code and deed is used as is', () => {
  const r = storedIssue(checkRecord(p, issue, deed), p, deed);
  assert.deepEqual(r, { issue, stale: false, confirmed: false });
});

test('storedIssue: moving the pin, changing the PIN code or a new reading makes it stale', () => {
  const check = checkRecord(p, issue, deed);
  assert.equal(storedIssue(check, { ...p, latitude: 13.1 }, deed).stale, true);
  assert.equal(storedIssue(check, { ...p, pincode: '500089' }, deed).stale, true);
  assert.equal(storedIssue(check, p, '').stale, true);
  assert.equal(storedIssue(null, p, deed).stale, true);
});

test('storedIssue: "the pin is right" sticks while the pin and the deed stay the same', () => {
  const check = checkRecord(p, null, deed, true);
  assert.equal(storedIssue(check, { ...p, pincode: '500089' }, deed).confirmed, true);
  assert.equal(storedIssue(check, { ...p, latitude: 13.1 }, deed).confirmed, false);
});

test('storedIssue: nothing to check without a pin, or with neither a PIN code nor a deed', () => {
  assert.equal(
    storedIssue(null, { pincode: '560064', latitude: null, longitude: null }).stale,
    false,
  );
  assert.equal(storedIssue(null, { pincode: null, latitude: 17.4, longitude: 78.3 }).stale, false);
  assert.equal(checkRecord({ pincode: '560064', latitude: null, longitude: null }, null), null);
});

test('locationIssueText says which two places disagree', () => {
  assert.match(locationIssueText(issue), /PIN code 560064 is in Avalahalli/);
  assert.match(
    locationIssueText({
      ...issue,
      kind: 'deed',
      pincode: null,
      other_place: 'Bommasandra, Anekal',
    }),
    /sale deed places the property in Bommasandra, Anekal/,
  );
});

/* ---- Plot satellite watch rules ---- */

test('satellite: a plot cleared or built on is called out; seasons are not', () => {
  const before = { ndvi_site: 0.43, ndvi_area: 0.39, ndbi_site: -0.11, ndbi_area: -0.12 };
  assert.equal(changeBetween(null, before), 'baseline');
  assert.equal(changeBetween(before, { ...before, ndvi_site: 0.37 }), 'none', 'dry season dip');
  assert.equal(changeBetween(before, { ...before, ndvi_site: 0.2 }), 'site_cleared');
  assert.equal(changeBetween(before, { ...before, ndbi_site: 0.02 }), 'site_built');
  assert.equal(changeBetween(before, { ...before, ndbi_area: -0.02 }), 'area_built');
});

test('satellite: cloudy pixels from the scene classification; a square around the pin', () => {
  assert.equal(
    cloudyShare([
      [15, 291],
      [4, 5],
    ]),
    0,
  );
  assert.ok(
    Math.abs(
      cloudyShare([
        [50, 50],
        [9, 4],
      ]) - 0.5,
    ) < 1e-9,
  );
  const [w, s, e, n] = square(12.79, 77.7, 150);
  assert.ok(Math.abs((n - s) * 111_320 - 300) < 1);
  assert.ok(w < 77.7 && e > 77.7);
});
