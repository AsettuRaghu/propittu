import { Router } from 'express';
import type { PincodeInfo } from '@propittu/shared';
import { auth } from '../auth.js';
import { invalid, must, notFound, ok } from '../errors.js';
import { searchPlaces } from '../geo.js';
import { within } from '../locationCheck.js';

/**
 * GET /geo/search?q= — places matching what the customer typed on the map,
 * to jump close to the site. Called when they press Search (OpenStreetMap's
 * policy forbids search-as-you-type).
 */
export const geoRouter = Router();

geoRouter.get('/geo/search', async (req, res) => {
  auth(req);
  const q = String(req.query.q ?? '').trim();
  if (q.length < 3 || q.length > 120) throw invalid('Type at least 3 letters');
  const places = (await within(searchPlaces(q), 8000)) ?? [];
  ok(
    res,
    places.map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      label: p.label,
      detail: [p.city, p.state, p.pincode].filter(Boolean).join(', '),
    })),
  );
});

/* GET /pincodes/:pin — place, district and state from India's PIN directory */
geoRouter.get('/pincodes/:pin', async (req, res) => {
  const { db } = auth(req);
  const pin = String(req.params.pin);
  if (!/^[1-9][0-9]{5}$/.test(pin)) throw invalid('Enter a 6-digit PIN code');
  const row = must<PincodeInfo | null>(
    await db
      .from('pincodes')
      .select('pincode, place, district, state, localities')
      .eq('pincode', pin)
      .maybeSingle(),
  );
  if (!row) throw notFound('PIN code');
  ok(res, row);
});
