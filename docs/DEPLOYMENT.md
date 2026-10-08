# Deployment

The API is hosted on **Vercel** and the mobile app is built with **Expo EAS**.
Finish [SUPABASE_SETUP.md](SUPABASE_SETUP.md) first.

## API on Vercel

**Live at https://propittu-api.vercel.app**: Vercel project `propittu-api`,
team **Propittu** (`propittu`), owned by the **contact@propittu.com** Vercel
account.

### How it deploys: GitHub Actions

Vercel is **not** connected to GitHub. Deploys are done by the workflow
[.github/workflows/api.yml](../.github/workflows/api.yml), so the Propittu
Vercel account never has to be linked to a personal GitHub account, and the
setup keeps working on the free plan even if the repo becomes private or moves
to a GitHub organization.

On every push to `main` that touches `apps/api`, `packages/shared`,
`supabase` or the lockfile:

1. typecheck → lint → RLS suite (real Postgres) → API security suite against
   the **built bundle**
2. **only if all pass:** deploy that exact bundle to Vercel production
3. smoke-check `https://propittu-api.vercel.app/health`

A failing check blocks the deploy. Pull requests run the checks without
deploying. You can also trigger a deploy manually: **GitHub → Actions → API →
Run workflow**. A full run takes about 2–3 minutes.

| Piece | Setting | Why |
|---|---|---|
| Build | `npm run build` in `apps/api` (esbuild → `.vercel/output`) | The whole API ships as **one self-contained file**, so production runs exactly the code the tests ran against. Uses Vercel's [Build Output API](https://vercel.com/docs/build-output-api). |
| Region | **`bom1` (Mumbai)** | Same region as the Supabase database. |
| Vercel project settings | No Git connection, no Root Directory, Framework "Other", Node 22 | Vercel never builds anything itself; it only receives the prebuilt bundle. |
| Daily cron | `GET /cron/keepalive` at 03:00 UTC | Touches the database so the Supabase free plan never pauses the project for inactivity. Requires `CRON_SECRET`. |
| Daily cron | `GET /cron/watch` at 01:30 UTC (7 am IST) | Pittu Watch: collects news for watched places and has Pittu read it (a few places per run). Requires `CRON_SECRET`. |

**GitHub settings used by the workflow** (repo → Settings → Secrets and
variables → Actions):

| Name | Kind | Value |
|---|---|---|
| `VERCEL_TOKEN` | Secret | Vercel token created by contact@propittu.com, scoped to team *Propittu*, **expires after 1 year** |
| `VERCEL_ORG_ID` | Variable | `team_WkwznNrWiBPov7VquqDQgLsL` |
| `VERCEL_PROJECT_ID` | Variable | `prj_f7kcXCJkzVVS6pgYckbI7YPcsV90` |

**Renewing the token (yearly, or if it leaks):** create a new one at
vercel.com/account/settings/tokens (signed in as contact@propittu.com, scope
*Propittu*), run `gh secret set VERCEL_TOKEN -R AsettuRaghu/propittu` and paste
it, then delete the old token in Vercel. Vercel only lets a person create
tokens in the dashboard, not the CLI.

**Deploying by hand** (rarely needed), from this Mac with the Propittu login:

```bash
cd apps/api && npm run build
npx vercel@latest deploy --prebuilt --prod --global-config ~/.vercel-propittu --scope propittu
```

### Environment variables (Production and Preview)

Set in the Vercel dashboard under **Settings → Environment Variables**, or with
`npx vercel@latest env add <NAME> production --global-config ~/.vercel-propittu --scope propittu`
from `apps/api`:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
| `NODE_ENV` | `production` |
| `LOG_LEVEL` | `info` |
| `SIGNED_DOWNLOAD_TTL_SECONDS` | `3600` |
| `CRON_SECRET` | random string (`openssl rand -hex 32`); Vercel sends it to the cron endpoint |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` — **server only**; used solely to record verified payment events. Get it with `supabase projects api-keys --reveal` (without `--reveal` the CLI returns a masked value that will not work). |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay → Account & Settings → API Keys (test keys now; live keys at launch) |
| `RAZORPAY_WEBHOOK_SECRET` | the secret entered on the Razorpay webhook (see below) |

Payment variables are optional: without them `POST /billing/checkout` answers
503 `PAYMENTS_UNAVAILABLE` and everything else works.

### Razorpay webhook (M7)

Razorpay Dashboard → **Account & Settings → Webhooks → Add New Webhook**:

- **URL:** `https://propittu-api.vercel.app/webhooks/razorpay`
- **Secret:** the same value as `RAZORPAY_WEBHOOK_SECRET` in Vercel
- **Events:** `payment_link.paid`, `payment.failed`, `refund.processed`

The webhook is authoritative for payment status. If it is late or missing, the
app's "refresh" asks Razorpay directly (server-to-server), so a paid customer is
never stuck — but configure the webhook anyway.

After changing a variable, redeploy (**GitHub → Actions → API → Run
workflow**) for it to take effect.

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

## Testing the app without the laptop (EAS Update in Expo Go)

The app's JavaScript is published to Expo's servers, and Expo Go on the
phone loads it from anywhere, without needing the Mac or the same Wi-Fi.
Project: `@propittus-team/propittu` (organisation; testers are invited as Viewers). Branch and channel: `preview`. Runtime:
`exposdk:57.0.0` (`runtimeVersion.policy = sdkVersion`, which is what Expo Go
requires). The public `EXPO_PUBLIC_*` values live in the EAS `preview` and
`production` environments.

- **Open on the phone:** Expo Go must be signed in as the owner or a member of `propittus-team` (Expo only
  lets you load your own projects). Then open
  `exp://u.expo.dev/49c7914f-4765-49a4-a5cc-0c545a5a6900?channel-name=preview&runtime-version=exposdk:57.0.0`
  (tap it in Notes or Messages). After the first open it is under **Recently
  opened** in Expo Go.
- **Publish a new version** (from `apps/mobile`):
  `npx eas-cli@latest update --branch preview --environment preview --message "what changed"`.
  Close and reopen the app in Expo Go to get it (it may take two launches).
- When real builds are made (TestFlight / Play), switch `runtimeVersion` to
  `{ "policy": "appVersion" }` or `fingerprint`.

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

- [ ] Vercel team *Propittu* upgraded from Hobby to **Pro** (Hobby is non-commercial only); `/health` returns ok
- [ ] `VERCEL_TOKEN` GitHub secret is valid (it expires 1 year after creation)
- [ ] Supabase project on **Pro** (daily backups, more storage, no pausing)
- [ ] Migrations applied to the production Supabase project
- [ ] Phone auth configured with a **DLT-registered** SMS provider ([SUPABASE_SETUP.md §9](SUPABASE_SETUP.md#9-production-sms-india))
- [ ] Test phone numbers removed, or kept only for review accounts
- [ ] SMS rate limit set
- [ ] EAS `production` environment variables point to production URLs
- [ ] Manual checklist in [TESTING.md](TESTING.md) passed on Android and iOS
- [ ] Session storage moved to encrypted storage ([DECISIONS.md](DECISIONS.md#known-debt-before-public-launch))

## Backoffice portal (apps/backoffice)

The team's command center in the browser: <https://propittu-admin.vercel.app>.

- **Code:** `apps/backoffice` in this repository (React + Vite, TypeScript), sharing `packages/shared`.
- **Login:** the same Supabase phone OTP as the app. Only accounts with an active `staff_members`
  row get in (the API enforces the same on every `/backoffice` call).
- **Hosting:** Vercel project `propittu-admin` in the `propittu` team — a static site (no server).
- **Deploys:** `.github/workflows/backoffice.yml` on every push to `main` touching the portal or
  `packages/shared`: typecheck → lint → build → deploy `dist/`. It uses the same `VERCEL_TOKEN`
  secret and these repository variables: `VERCEL_BACKOFFICE_PROJECT_ID`, `BACKOFFICE_API_URL`,
  `BACKOFFICE_SUPABASE_URL`, `BACKOFFICE_SUPABASE_PUBLISHABLE_KEY` (public values only).
- **API access:** the API allows browser calls only from the portal's address (and
  `http://localhost:5173` for development); add others with the `PORTAL_ORIGINS` env var.
- **Run locally:** copy `apps/backoffice/.env.example` to `.env.local`, then
  `npm run dev --workspace @propittu/backoffice`.
