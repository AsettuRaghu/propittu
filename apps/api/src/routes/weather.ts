import { Router } from 'express';
import { z } from 'zod';
import {
  conditionFromSymbol,
  roundCoordinate,
  SUPPORT_EMAIL,
  type SiteWeather,
} from '@propittu/shared';
import { HttpError, ok } from '../errors.js';
import { logger } from '../logger.js';

/**
 * GET /weather?lat=&lon= — current weather at a property's site.
 *
 * MET Norway Locationforecast (free incl. commercial use, CC BY 4.0). Their
 * terms: identify ourselves, cache until Expires, max 4 decimals. We round
 * to 2 decimals (~1 km) so no precise location leaves the server, and keep
 * a small in-memory cache per server instance.
 */
export const weatherRouter = Router();

const MET_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
const USER_AGENT = `Propittu/1.0 (propittu.com; ${SUPPORT_EMAIL})`;
const MAX_CACHE = 500;

const cache = new Map<string, { data: SiteWeather; expires: number }>();

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

interface MetResponse {
  properties: {
    timeseries: {
      data: {
        instant: { details: { air_temperature?: number } };
        next_1_hours?: { summary: { symbol_code: string } };
        next_6_hours?: { summary: { symbol_code: string } };
      };
    }[];
  };
}

weatherRouter.get('/weather', async (req, res) => {
  const { lat, lon } = querySchema.parse(req.query);
  const key = `${roundCoordinate(lat)},${roundCoordinate(lon)}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    res.setHeader('Cache-Control', 'private, max-age=1800');
    return ok(res, hit.data);
  }

  const [rlat, rlon] = key.split(',');
  let met: Response;
  try {
    met = await fetch(`${MET_URL}?lat=${rlat}&lon=${rlon}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    logger.warn({ err }, 'weather: MET Norway not reachable');
    throw new HttpError(503, 'INTERNAL', 'Weather is not available right now');
  }
  if (!met.ok) {
    logger.warn({ status: met.status }, 'weather: MET Norway refused');
    throw new HttpError(503, 'INTERNAL', 'Weather is not available right now');
  }
  const body = (await met.json()) as MetResponse;
  const now = body.properties.timeseries[0]?.data;
  const symbol = now?.next_1_hours?.summary.symbol_code ?? now?.next_6_hours?.summary.symbol_code;
  const temp = now?.instant.details.air_temperature;
  if (temp === undefined || !symbol) {
    throw new HttpError(503, 'INTERNAL', 'Weather is not available right now');
  }
  const data: SiteWeather = { temp_c: Math.round(temp), ...conditionFromSymbol(symbol) };

  // Respect MET's Expires (at least 10 minutes, at most an hour).
  const expiresHeader = Date.parse(met.headers.get('expires') ?? '');
  const ttl = Number.isNaN(expiresHeader)
    ? 30 * 60_000
    : Math.min(60 * 60_000, Math.max(10 * 60_000, expiresHeader - Date.now()));
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, { data, expires: Date.now() + ttl });
  res.setHeader('Cache-Control', 'private, max-age=1800');
  ok(res, data);
});
