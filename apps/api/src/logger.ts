import { pino } from 'pino';
import { env, isProduction } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  // Tokens must never reach the logs.
  redact: ['req.headers.authorization', 'req.headers.cookie'],
  ...(isProduction ? {} : { transport: { target: 'pino-pretty', options: { singleLine: true } } }),
});
