# Deployment

The API is hosted on **Render** and the mobile app is built with **Expo EAS**.
Finish [SUPABASE_SETUP.md](SUPABASE_SETUP.md) first.

## API on Render

The repository includes a Render Blueprint, [render.yaml](../render.yaml).

1. Push the repository to GitHub.
2. In Render, go to **New → Blueprint** and select the repository.
3. When prompted, enter `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
   Everything else is preset in `render.yaml`.
4. Deploy. Check `https://<service>.onrender.com/health`, which should return
   `{"data":{"status":"ok",…}}`.

What the blueprint does:

| Setting | Value | Notes |
|---|---|---|
| Region | Singapore | Render's only Asia-Pacific region. Supabase stays in Mumbai. |
| Build | `npm ci` for the `api` and `shared` workspaces only | Skips the Expo toolchain. Rehearsed in a fresh clone with production-only dependencies. |
| Start | `npm run start --workspace @propittu/api` | Runs the TypeScript directly with `tsx`, so there's no build step. |
| Health check | `/health` | Doesn't call Supabase, so a Supabase blip won't restart the API. |
| Auto-deploy | on pushes to `main` that touch `apps/api`, `packages/shared` or the lockfile | Mobile-only changes don't redeploy the API. |

**Plan.** The blueprint uses the **free** plan, which sleeps after about
15 minutes idle; the next request then takes 30–60 seconds. The app's
60-second request timeout tolerates this, but it feels broken during
testing. Switch to **Starter** in the Render dashboard before device
testing or launch.

If the service fails to start, the deploy log names any missing environment
variable.

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
    --name EXPO_PUBLIC_API_URL --value https://<service>.onrender.com
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

- [ ] Render service on **Starter** plan; `/health` returns ok
- [ ] Migrations applied to the production Supabase project
- [ ] Phone auth configured with a **DLT-registered** SMS provider ([SUPABASE_SETUP.md §8](SUPABASE_SETUP.md#8-production-sms-india))
- [ ] Test phone numbers removed, or kept only for review accounts
- [ ] SMS rate limit set
- [ ] EAS `production` environment variables point to production URLs
- [ ] Manual checklist in [TESTING.md](TESTING.md) passed on Android and iOS
- [ ] Session storage moved to encrypted storage ([DECISIONS.md](DECISIONS.md#known-debt-before-public-launch))
