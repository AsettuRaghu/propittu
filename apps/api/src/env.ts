import { existsSync } from 'node:fs';
import { z } from 'zod';

// Local development reads apps/api/.env; on Render the platform injects variables.
if (existsSync('.env')) process.loadEnvFile('.env');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  SUPABASE_URL: z.url().transform((u) => u.replace(/\/+$/, '')),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),

  SIGNED_DOWNLOAD_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
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
