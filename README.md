# Propittu

**Everything about your property, in one place.**

Propittu is a mobile app for property owners in India: register your
properties, keep their documents and photos in one place, and request
property services. This repository is the MVP described in
[PRODUCT_SPEC.md](PRODUCT_SPEC.md), which is the source of truth for scope.

```
Expo app (iOS + Android)
   │  phone OTP ──────────────► Supabase Auth
   │  Bearer <access token>
   ▼
Propittu API (Express on Vercel, Mumbai) ──► Supabase Postgres (RLS on every table)
                               ──► Supabase Storage (private buckets)
```

The app talks to Supabase **only** to sign in. Every read and write goes
through the API, which verifies the token and queries Supabase **as the
signed-in user**, so Row Level Security applies on every request.
Uploads go straight from the phone to Storage through signed URLs that
the API issues.

## Repository layout

```
apps/api/          Express 5 API (TypeScript, run with tsx)
apps/mobile/       Expo SDK 57 app (expo-router)
packages/shared/   Types, zod schemas and constants used by both apps
supabase/          Migrations, CLI config, RLS test suite
docs/              Setup, deployment, decisions, testing
```

## Prerequisites

- Node.js 22+ and npm 10+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for migrations)
- Postgres 15+ server binaries (only for `npm run test:rls`)
- The **Expo Go** app on a phone (development)

## Getting started

1. **Set up Supabase:** create the project, apply the migrations and
   configure phone auth. Follow [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).

2. **Install:**

   ```bash
   npm install
   ```

3. **Run the API:**

   ```bash
   cp apps/api/.env.example apps/api/.env   # then fill in the values
   npm run api                              # http://localhost:4000/health
   ```

4. **Run the app:**

   ```bash
   cp apps/mobile/.env.example apps/mobile/.env   # then fill in the values
   npm run mobile
   ```

   Scan the QR code with Expo Go. On a physical phone, `EXPO_PUBLIC_API_URL`
   must be your computer's **LAN IP** (e.g. `http://192.168.1.20:4000`), not
   `localhost`, and both devices need to be on the same Wi-Fi.

5. **Sign in** with a test number you configured in Supabase
   (e.g. `98765 43210` → OTP `123456`). No SMS is sent for test numbers.

## Environment variables

**API** (`apps/api/.env`; on Vercel, project environment variables):

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | yes | `https://<project-ref>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | yes | Publishable key (`sb_publishable_…`) |
| `PORT` | no | Default `4000` (local only) |
| `NODE_ENV` | no | `development` (pretty logs) or `production` (JSON logs) |
| `LOG_LEVEL` | no | Default `info` |
| `SIGNED_DOWNLOAD_TTL_SECONDS` | no | Lifetime of photo/document view links. Default `3600` |
| `CRON_SECRET` | on Vercel | Protects the daily `/cron/keepalive` endpoint |

The API does **not** use the Supabase secret / service-role key. It never
needs to bypass RLS. The API exits at startup if a required variable is
missing.

**Mobile** (`apps/mobile/.env`; for EAS builds, set with `eas env:create`):

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_API_URL` | Propittu API base URL |
| `EXPO_PUBLIC_SUPABASE_URL` | Same as the API's `SUPABASE_URL` |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Same as the API's publishable key |

Everything in the mobile `.env` is bundled into the app and is public.
**Never put a secret key there.** Restart Expo with `npx expo start -c`
after changing it.

## Scripts

Run from the repository root.

| Command | What it does |
|---|---|
| `npm run api` | API with auto-reload |
| `npm run mobile` | Expo dev server |
| `npm test` | Both automated test suites below |
| `npm run test:rls` | Applies every migration to a throwaway Postgres and runs the RLS / cross-tenant suite |
| `npm run test:api` | Boots the API against a fake Supabase and checks token handling, user scoping and validation |
| `npm run test:bundle -w @propittu/api` | Same API checks against the built Vercel bundle |
| `npm run typecheck` | `tsc --noEmit` in every workspace |
| `npm run lint` | ESLint in every workspace |
| `npm run db:push` | Apply migrations to the linked Supabase project |
| `git push` to `main` | Deploys the API to Vercel when API code changed |

## Documentation

- [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md): manual Supabase configuration
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): Vercel (API) and EAS (app builds)
- [docs/TESTING.md](docs/TESTING.md): what is automated, and the manual device checklist
- [docs/DECISIONS.md](docs/DECISIONS.md): implementation decisions and known tradeoffs
