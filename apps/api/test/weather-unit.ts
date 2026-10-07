// Weather: MET Norway symbol codes → our conditions (no network).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conditionFromSymbol, roundCoordinate } from '@propittu/shared';

test('MET symbols map to a small set of conditions, with day / night', () => {
  assert.deepEqual(conditionFromSymbol('clearsky_day'), { condition: 'clear', is_day: true });
  assert.deepEqual(conditionFromSymbol('clearsky_night'), { condition: 'clear', is_day: false });
  assert.equal(conditionFromSymbol('fair_day').condition, 'partly_cloudy');
  assert.equal(conditionFromSymbol('partlycloudy_night').condition, 'partly_cloudy');
  assert.equal(conditionFromSymbol('cloudy').condition, 'cloudy');
  assert.equal(conditionFromSymbol('fog').condition, 'fog');
  assert.equal(conditionFromSymbol('lightrainshowers_day').condition, 'rain');
  assert.equal(conditionFromSymbol('drizzle').condition, 'drizzle');
  assert.equal(conditionFromSymbol('heavyrainandthunder').condition, 'storm');
  assert.equal(conditionFromSymbol('lightsleetshowers_day').condition, 'snow');
});

test('coordinates are rounded to about a kilometre before leaving the server', () => {
  assert.equal(roundCoordinate(12.971598), 12.97);
  assert.equal(roundCoordinate(77.594566), 77.59);
});
