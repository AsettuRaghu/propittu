import { randomUUID } from 'node:crypto';
import express from 'express';
import { pinoHttp } from 'pino-http';
import { requireAuth } from './auth.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { logger } from './logger.js';
import { documentsRouter } from './routes/documents.js';
import { healthRouter } from './routes/health.js';
import { meRouter } from './routes/me.js';
import { photosRouter } from './routes/photos.js';
import { propertiesRouter } from './routes/properties.js';
import { servicesRouter } from './routes/services.js';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  // Render terminates TLS at its proxy; trust exactly one hop for client IPs.
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
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );

  // JSON bodies are small: files never pass through the API (signed URLs).
  app.use(express.json({ limit: '100kb' }));

  // Public
  app.use(healthRouter);

  // Everything below requires a valid Supabase session.
  app.use(requireAuth);
  app.use(meRouter);
  app.use(propertiesRouter);
  app.use(photosRouter);
  app.use(documentsRouter);
  app.use(servicesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
