import { Router } from 'express';
import { auth } from '../auth.js';
import { invalid, ok } from '../errors.js';
import { pincodeArea } from '../geo.js';
import { within } from '../locationCheck.js';

/**
 * GET /geo/pincode/:pin — where a PIN code's area is (its centre, in words),
 * so "Move the pin" can start there instead of at a pin that's far away.
 * Signed-in only; cached and rate-limited in geo.ts. Null when unknown.
 */
export const geoRouter = Router();

geoRouter.get('/geo/pincode/:pin', async (req, res) => {
  auth(req);
  const pin = String(req.params.pin);
  if (!/^\d{6}$/.test(pin)) throw invalid('Enter a 6-digit PIN code');
  const area = await within(pincodeArea(pin), 8000);
  ok(res, area ? { latitude: area.latitude, longitude: area.longitude, label: area.label } : null);
});
