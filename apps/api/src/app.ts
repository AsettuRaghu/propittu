import { randomUUID } from 'node:crypto';
import express from 'express';
import { pinoHttp } from 'pino-http';
import { requireAuth } from './auth.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { logger } from './logger.js';
import { cronRouter } from './routes/cron.js';
import { analysisRouter } from './routes/analysis.js';
import { pittuRouter } from './routes/pittu.js';
import { documentsRouter } from './routes/documents.js';
import { healthRouter } from './routes/health.js';
import { legalRouter } from './routes/legal.js';
import { backofficeRouter } from './routes/backoffice.js';
import { billingReturnRouter, billingRouter } from './routes/billing.js';
import { webhooksRouter } from './routes/webhooks.js';
import { supportRouter } from './routes/support.js';
import { meRouter } from './routes/me.js';
import { plansRouter } from './routes/plans.js';
import { requireActivePlan } from './plan.js';
import { photosRouter } from './routes/photos.js';
import { propertiesRouter } from './routes/properties.js';
import { geoRouter } from './routes/geo.js';
import { remindersRouter } from './routes/reminders.js';
import { propertySetupRouter } from './routes/propertySetup.js';
import { servicesRouter } from './routes/services.js';
import { videosRouter } from './routes/videos.js';
import { weatherRouter } from './routes/weather.js';

/** Websites allowed to call the API from a browser: the Backoffice portal. */
const PORTAL_ORIGINS = [
  'https://propittu-admin.vercel.app',
  'http://localhost:5173',
  ...(process.env.PORTAL_ORIGINS ?? '').split(',').filter(Boolean),
];

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  // Baseline security headers (no dependency): no MIME sniffing, no framing,
  // no referrer leaks, HTTPS only. The public pages (legal, payment return)
  // are static HTML with inline styles only.
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
    );
    next();
  });
  // The Backoffice portal (a separate website) may call this API from a
  // browser; only its own address (and local development) is allowed.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && PORTAL_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
      res.setHeader('Access-Control-Max-Age', '600');
      if (req.method === 'OPTIONS') return void res.status(204).end();
    }
    next();
  });
  // The host (Vercel) terminates TLS at its proxy; trust one hop for client IPs.
  app.set('trust proxy', 1);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = req.headers['x-request-id']?.toString() || randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/cron/keepalive' },
    }),
  );

  // Payment webhooks need the RAW body for signature checks: before express.json.
  app.use(webhooksRouter);

  // JSON bodies are small: files never pass through the API (signed URLs).
  app.use(express.json({ limit: '100kb' }));

  // Public (cron checks its own secret)
  app.use(healthRouter);
  app.use(cronRouter);
  app.use(billingReturnRouter);
  app.use(legalRouter);

  // Everything below requires a valid Supabase session.
  app.use(requireAuth);

  // Always available, even in Limited Access (M6): account, Plan status,
  // available Plans, payment journey. Backoffice has its own staff gate.
  app.use(meRouter);
  app.use(plansRouter);
  app.use(billingRouter);
  app.use(supportRouter);
  app.use('/backoffice', backofficeRouter);

  // Normal property-management functionality needs an active Plan or Trial.
  app.use(requireActivePlan);
  app.use(geoRouter);
  app.use(remindersRouter);
  app.use(propertySetupRouter);
  app.use(propertiesRouter);
  app.use(photosRouter);
  app.use(videosRouter);
  app.use(documentsRouter);
  app.use(analysisRouter);
  app.use(pittuRouter);
  app.use(servicesRouter);
  app.use(weatherRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
