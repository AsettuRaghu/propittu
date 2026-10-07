import assert from 'node:assert/strict';
import { test } from 'node:test';
import { locationIssueText, type LocationIssue } from '@propittu/shared';
import { checkRecord, deedKey, distanceKm, storedIssue } from '../src/locationRecord.js';

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
