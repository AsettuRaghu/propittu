import { existsSync } from 'node:fs';
import { z } from 'zod';

// Local development reads apps/api/.env; on Vercel the platform injects variables.
if (existsSync('.env')) process.loadEnvFile('.env');

/** Optional secret: an empty value counts as "not set". */
const optionalSecret = (min: number) =>
  z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().min(min).optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  SUPABASE_URL: z.url().transform((u) => u.replace(/\/+$/, '')),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),

  SIGNED_DOWNLOAD_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),

  // Set on Vercel; Vercel Cron sends it as a Bearer token to /cron/keepalive.
  CRON_SECRET: z.string().min(16).optional(),

  // ---- Payments (M7). All optional: without them checkout answers 503. ----
  // Supabase server key — used ONLY to record verified payment events
  // (record_payment_event is executable by service_role alone).
  SUPABASE_SECRET_KEY: optionalSecret(20),
  RAZORPAY_KEY_ID: optionalSecret(8),
  RAZORPAY_KEY_SECRET: optionalSecret(8),
  RAZORPAY_WEBHOOK_SECRET: optionalSecret(8),
  // Public base URL of this API (payment return page). Vercel provides
  // VERCEL_PROJECT_PRODUCTION_URL automatically.
  PUBLIC_API_URL: z.url().optional(),

  // ---- AI (see docs/AI_DOCUMENT_INTELLIGENCE.md). Off unless switched on. ----
  AI_ENABLED: z.preprocess((v) => v === 'true' || v === '1', z.boolean()).default(false),
  // 'fake' answers from a fixture (tests); never set in production.
  AI_PROVIDER: z.enum(['anthropic', 'fake']).default('anthropic'),
  ANTHROPIC_API_KEY: optionalSecret(20),
  // Pilot: comma-separated account ids allowed to use AI. Empty = everyone (when enabled).
  AI_PILOT_ACCOUNTS: z.preprocess(
    (v) =>
      typeof v === 'string'
        ? v
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
        : [],
    z.array(z.uuid()),
  ),
  // Cost guards: readings per account per day, and a hard monthly spend cap (USD).
  AI_DAILY_READS_PER_ACCOUNT: z.coerce.number().int().min(0).max(100).default(5),
  AI_MONTHLY_BUDGET_USD: z.coerce.number().min(0).max(10_000).default(10),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast at boot rather than on the first request that needs the value.
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('See apps/api/.env.example.');
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';

export const publicApiUrl = (
  env.PUBLIC_API_URL ??
  (env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
    : `http://localhost:${env.PORT}`)
).replace(/\/+$/, '');
