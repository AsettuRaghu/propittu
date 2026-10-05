# Deployment

The API is hosted on **Vercel** and the mobile app is built with **Expo EAS**.
Finish [SUPABASE_SETUP.md](SUPABASE_SETUP.md) first.

## API on Vercel

**Live at https://propittu-api.vercel.app**: Vercel project `propittu-api`,
team *Moka Projects*.

### How it deploys

Every push to `main` that changes `apps/api`, `packages/shared` or the
lockfile deploys to production automatically, usually in under a minute.
Commits that only touch the mobile app or docs are skipped.

| Piece | Setting | Why |
|---|---|---|
| Build | `npm run build` in `apps/api` (esbuild → `.vercel/output`) | The whole API ships as **one self-contained file**, so production runs exactly the code the tests ran against. Uses Vercel's [Build Output API](https://vercel.com/docs/build-output-api). |
| Region | **`bom1` (Mumbai)** | Same region as the Supabase database. |
| Project settings | Root Directory `apps/api`, Framework "Other", Node 22 | Configured once; the rest lives in [apps/api/vercel.json](../apps/api/vercel.json). |
| Daily cron | `GET /cron/keepalive` at 03:00 UTC | Touches the database so the Supabase free plan never pauses the project for inactivity. Requires `CRON_SECRET`. |

### Environment variables (Production)

Set with `npx vercel@latest env add <NAME> production` from `apps/api`, or in
the dashboard under **Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
| `NODE_ENV` | `production` |
| `LOG_LEVEL` | `info` |
| `SIGNED_DOWNLOAD_TTL_SECONDS` | `3600` |
| `CRON_SECRET` | random string (`openssl rand -hex 32`); Vercel sends it to the cron endpoint |

After changing a variable, redeploy (push a commit, or use **Redeploy** in the
dashboard) for it to take effect.

### Checking a deployment

```bash
curl https://propittu-api.vercel.app/health      # {"data":{"status":"ok",…}}
```

The `x-vercel-id` response header should start with `bom1::`. Logs are under
**Project → Logs** in the Vercel dashboard. To roll back a bad deploy, open
**Deployments**, pick the previous one and choose **Promote to Production**.

### Testing the build locally

```bash
npm run test:bundle --workspace @propittu/api
```

This builds the bundle and runs the 29-check API security suite against it
under plain Node, the same way Vercel invokes it.

### Plan

The project is on Vercel's **Hobby (free)** plan, which is for non-commercial
use, while Propittu is pre-launch. **Upgrade the team to Pro before launching
commercially** (see the launch checklist below). Nothing in the code changes.

## Mobile builds with EAS

Use `npx eas-cli@latest` (no global install needed). Run commands from
`apps/mobile`.

### One-time setup

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest init        # links an Expo project; writes its id into app.json
```

### Configure the app's environment

`.env` files are git-ignored, so **EAS cloud builds never see them**. A build
without these values opens on a "Configuration missing" screen. Set them as
EAS environment variables once per environment:

```bash
for ENVIRONMENT in preview production; do
  npx eas-cli@latest env:create --environment $ENVIRONMENT --visibility plaintext \
    --name EXPO_PUBLIC_API_URL --value https://propittu-api.vercel.app
  npx eas-cli@latest env:create --environment $ENVIRONMENT --visibility plaintext \
    --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co
  npx eas-cli@latest env:create --environment $ENVIRONMENT --visibility plaintext \
    --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value sb_publishable_…
done
```

`plaintext` is correct here: these values are bundled into the app anyway.
Check the exact flags with `npx eas-cli@latest env:create --help`.

### Build profiles ([eas.json](../apps/mobile/eas.json))

| Profile | Produces | Use |
|---|---|---|
| `preview` | Android **APK**, iOS ad-hoc build | Install directly on test phones |
| `production` | Android App Bundle, iOS App Store build | Play Store, TestFlight / App Store |

```bash
# Android APK for testers. No Google Play account needed.
npx eas-cli@latest build --profile preview --platform android

# Store builds
npx eas-cli@latest build --profile production --platform android
npx eas-cli@latest build --profile production --platform ios
```

### iOS requirements

- An **Apple Developer Program** membership ($99/year; enrolment can take
  24–48 hours or more) is required for any iOS build installed outside Expo Go,
  including TestFlight.
- EAS builds iOS in the cloud, so **Xcode is not required** on your Mac.
- Until the account is ready, test on iPhone with **Expo Go**. Every native
  module Propittu uses is included in Expo Go.

### Submitting to the stores

```bash
npx eas-cli@latest submit --profile production --platform ios       # TestFlight
npx eas-cli@latest submit --profile production --platform android   # Play Console
```

App Store and Play Store review times are outside our control (§44).

## Launch checklist

- [ ] Vercel team upgraded from Hobby to **Pro** (Hobby is non-commercial only); `/health` returns ok
- [ ] Supabase project on **Pro** (daily backups, more storage, no pausing)
- [ ] Migrations applied to the production Supabase project
- [ ] Phone auth configured with a **DLT-registered** SMS provider ([SUPABASE_SETUP.md §9](SUPABASE_SETUP.md#9-production-sms-india))
- [ ] Test phone numbers removed, or kept only for review accounts
- [ ] SMS rate limit set
- [ ] EAS `production` environment variables point to production URLs
- [ ] Manual checklist in [TESTING.md](TESTING.md) passed on Android and iOS
- [ ] Session storage moved to encrypted storage ([DECISIONS.md](DECISIONS.md#known-debt-before-public-launch))
