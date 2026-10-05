import { createApp } from './app.js';
import { env } from './env.js';
import { logger } from './logger.js';

const server = createApp().listen(env.PORT, (error?: Error) => {
  if (error) {
    logger.fatal({ err: error }, 'failed to start');
    process.exit(1);
  }
  logger.info(`Propittu API listening on :${env.PORT} (${env.NODE_ENV})`);
});

// Render sends SIGTERM on every deploy; finish in-flight requests first.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
