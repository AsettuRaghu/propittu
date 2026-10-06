import { randomUUID } from 'node:crypto';
import express from 'express';
import { pinoHttp } from 'pino-http';
import { requireAuth } from './auth.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { logger } from './logger.js';
import { cronRouter } from './routes/cron.js';
import { documentsRouter } from './routes/documents.js';
import { healthRouter } from './routes/health.js';
import { backofficeRouter } from './routes/backoffice.js';
import { billingReturnRouter, billingRouter } from './routes/billing.js';
import { webhooksRouter } from './routes/webhooks.js';
import { supportRouter } from './routes/support.js';
import { meRouter } from './routes/me.js';
import { plansRouter } from './routes/plans.js';
import { requireActivePlan } from './plan.js';
import { photosRouter } from './routes/photos.js';
import { propertiesRouter } from './routes/properties.js';
import { servicesRouter } from './routes/services.js';
import { videosRouter } from './routes/videos.js';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
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
  app.use(propertiesRouter);
  app.use(photosRouter);
  app.use(videosRouter);
  app.use(documentsRouter);
  app.use(servicesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
