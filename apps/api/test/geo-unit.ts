import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkRecord, distanceKm, storedIssue } from '../src/locationRecord.js';

const issue = {
  pin_place: 'Manikonda, Ranga Reddy (500089)',
  pincode_place: 'Avalahalli, Bengaluru Urban',
  pincode: '560064',
  distance_km: 481,
};

test('distanceKm: Bengaluru to Hyderabad is about 500 km', () => {
  const km = distanceKm([12.97, 77.59], [17.39, 78.49]);
  assert.ok(km > 480 && km < 520, String(km));
});

test('storedIssue: a check about the current pin and PIN code is used as is', () => {
  const p = { pincode: '560064', latitude: 17.399, longitude: 78.371 };
  assert.deepEqual(storedIssue(checkRecord(p, issue), p), { issue, stale: false });
});

test('storedIssue: moving the pin or changing the PIN code makes it stale', () => {
  const p = { pincode: '560064', latitude: 17.399, longitude: 78.371 };
  const check = checkRecord(p, issue);
  assert.deepEqual(storedIssue(check, { ...p, latitude: 13.1 }), { issue: null, stale: true });
  assert.deepEqual(storedIssue(check, { ...p, pincode: '500089' }), { issue: null, stale: true });
  assert.deepEqual(storedIssue(null, p), { issue: null, stale: true });
});

test('storedIssue: nothing to check without both a pin and a PIN code', () => {
  assert.deepEqual(storedIssue(null, { pincode: null, latitude: 17.4, longitude: 78.3 }), {
    issue: null,
    stale: false,
  });
  assert.equal(checkRecord({ pincode: '560064', latitude: null, longitude: null }, null), null);
});
