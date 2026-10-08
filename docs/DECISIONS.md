# Implementation decisions

PRODUCT_SPEC.md is the source of truth. This file records where the
implementation made a choice the spec left open, or deliberately departed
from the letter of the spec, and why. Newest decisions go at the bottom
of each section.

## Architecture

| Decision | Reason |
|---|---|
| **The API queries Supabase as the signed-in user**, forwarding the user's JWT, rather than with the service-role key. | It's the only setup where RLS actually protects the API's own data path (§35, "defense-in-depth"). With a service-role key, one missing `user_id` filter would leak data across users. Handlers still filter by `user_id` as well. |
| **The API has no secret / service-role key at all.** | Nothing on a request path needs to bypass RLS. Seeding happens in migrations, and status changes happen in the SQL editor. |
| **JWTs are verified locally against Supabase's JWKS**, falling back to `auth.getUser()` for legacy HS256 projects. | Saves a network round trip to Supabase Auth on every request. |
| **Uploads use signed URLs** (intent → direct upload → confirm), not multipart uploads through the API. | Gives real upload progress (§21), avoids buffering files in the API or hitting request timeouts, and the API still chooses every storage path (§37). |
| **Express 5**, not Fastify or NestJS. | §27 asks for the simpler option. Express 5 now handles async errors natively. |
| **npm workspaces** monorepo with `packages/shared` as TypeScript source and no build step. | Validation schemas are shared by the API and the app forms. Metro (SDK 57) detects the workspace automatically. |
| **The API is hosted on Vercel (Hobby, free) in Mumbai (`bom1`)**, instead of the originally planned Render. | Requirement: $0 and always on. Render's free plan sleeps (30–60 s wake-ups), Railway and Fly have no free plan, and Cloud Run/Lambda have cold starts or need billing set up. Vercel runs Express with almost no changes, in the same region as Supabase. Hobby is non-commercial, so the team moves to **Pro before commercial launch** (product decision). Cloudflare Workers was the $0 alternative that is also commercially allowed; it would need an Express → Hono rewrite. |
| **We bundle the API ourselves with esbuild** into Vercel's Build Output API format. | Vercel compiles TypeScript file by file and can't resolve our shared workspace package's extension-less imports without an *experimental* flag. A single bundle means production runs exactly the code the tests ran against, and starts faster. |
| **The API lives in a dedicated Vercel account** (contact@propittu.com, team *Propittu*), separate from the founder's personal Vercel account. | Keeps Propittu's infrastructure, billing and access independent of unrelated projects. Moved on 2026-10-05; `propittu-api.vercel.app` was transferred with it. |
| **Deploys run from GitHub Actions with a scoped Vercel token**, not Vercel's built-in GitHub connection. | The built-in connection requires linking a personal GitHub user to the Vercel account (a GitHub user can only be linked to one Vercel account), and on Hobby it can't deploy *private* repos owned by a GitHub organization. Actions avoids both, works for public and private repos, and runs every test suite before deploying. |
| **A daily Vercel Cron calls `/cron/keepalive`**, which runs `select now()` through a dedicated database function. | Supabase's free plan pauses a project after about 7 days without activity. The function reads no tables and is the only thing anonymous callers may run. |
| **Locally the API runs TypeScript directly with `tsx`**, with no build step. | Fast development loop. `tsc --noEmit` typechecks, and `npm run test:bundle` checks the bundle that actually ships. |
| **No `cors` or `helmet`.** | Native apps aren't subject to CORS, and there's no web client (§9). |
| **TypeScript ~6.0.3**, not npm's latest 7.x. | It's the version the Expo SDK 57 template pins. |
| **Root `overrides` pin `react`/`react-dom` to 19.2.3.** | Without them npm installed React 19.3.0 at the root as a peer dependency while the app used 19.2.3. Two copies of React in one bundle crash at runtime. |

## Data model (vs. spec §17–§24)

| Departure | Reason |
|---|---|
| Added `properties.khata_number`. | §16 Step 3 collects "Khata / Property ID", but §17's model has no column for it. |
| Added `user_id` to `property_photos` and `property_documents`. | Lets every RLS policy be a simple `user_id = auth.uid()` check, with no join. |
| `services` is a table, and `service_requests.service_id` references it (instead of a `service_type` value). | §30 requires `GET /services`, and §22 needs names, descriptions and categories. |
| `service_requests.property_id` is nullable, with `ON DELETE SET NULL`. | Deleting a property keeps that user's request history (§8.4). |
| `upload_status` (`pending`/`ready`) on the file tables. | A row exists before its file has finished uploading. Lists only show `ready` rows. |
| `service_requests.reference`, e.g. `PR-000123`, generated from a sequence that starts at 123. | Matches the §23 confirmation mockup. |
| Lists such as property types are `text` + `CHECK` constraints, not Postgres `ENUM`s. | §20 asks for extensible lists. A CHECK constraint can be widened in a simple migration. |
| Users can update only `profiles.full_name`, `photos.caption` and `documents.document_type`/`upload_status`; service requests can't be updated by users at all. | Enforced with column-level grants, so a user can't change their phone number, re-point a file's storage path, or mark their own request completed. |

## Product and UX

| Decision | Reason |
|---|---|
| **Service-request photos are dropped from V1.** | The §23 mockup shows them, but §24 and §30 define no model or endpoint for them. Confirmed with product. |
| **Three tabs (Home, Services, Profile) instead of the four suggested in §39.** | §15's Home already lists the properties, so a separate Properties tab would show the same list twice. §39 also says to avoid overcomplicated navigation. |
| **Add Property is one form split into sections**, not a four-screen wizard. | Covers the same steps as §16 with far less code and no draft state carried between screens. |
| **Photos are uploaded right after the property is saved.** | A photo's storage path includes the new property's id. If a photo fails, the property is still saved, and the confirmation screen says how many photos failed. |
| **Photos are resized to a 1600 px long edge and saved as JPEG on the device.** | Keeps uploads under 5 MB, and converts iPhone HEIC photos, which the bucket doesn't accept. |
| **Invalid vs. expired OTP is decided by elapsed time.** | Supabase returns the same error for both, but §11 asks for separate handling. |
| **PDFs open in Safari View Controller on iOS, and download to the share sheet on Android.** | Android's in-app browser can't display PDFs inline. |
| **Photo delete (`DELETE /photos/:id`) was added** even though §30 doesn't list it. | Without it, a wrongly uploaded photo could only be removed by deleting the whole property. |
| **Latitude/longitude columns exist but are never filled.** | They're in the §17 model, but no screen uses a map, and a map would mean a Maps API key and extra scope. |
| **`full_name` exists but there's no screen to edit it.** | §25 says name is optional, and §30/§39 define no edit-profile screen. |
| **No server-side idempotency keys on create endpoints.** | Buttons disable while a request is in flight, and React Query never retries mutations, which together prevent duplicate submissions (§40). |
| **Where we serve (2026-10-06, migration 21): a property can be added anywhere; location limits services, never properties.** Each service has a `reach`: `area` (visits: the PIN code must be in an active service area), `state` (paperwork help: the state, taken from the PIN prefix first and the typed state second, must be active) or `everywhere`. Launch coverage is visits across Bengaluru Urban district (111 PIN codes from the India Post directory) and paperwork help in Karnataka and Telangana. Staff manage areas, PIN codes and states in Backoffice → Services → Where we serve, and can mark one property as an exception. `create_service_request()` refuses a service that doesn't reach the property. | Our team can only visit where it exists, and paperwork depends on each state's process. Blocking in the database means no app version can book a visit we can't make. |
| **Per-service payment and cancellation rules (7 Oct 2026).** Each service sets when an extra is paid (`upfront` when booking — default for fixed-price visits; `on_confirmation` — default, and for quotes; `on_completion`), whether the customer may cancel (`until_confirmed` / `never`) and its usual days (for "Expected by"). The rules are copied onto each request. No refunds in the app; plan-included requests can't be cancelled by the customer. "On quote" requests are priced by staff (`staff_set_request_price`) and paid in the app. | Push payment into the app where possible, keep terms fixed once a request is made, and leave exceptions to staff. |
| **PIN code is required for new properties.** Existing ones without it get an "Add the PIN code" prompt. | It decides which services reach the property. |
| **Plan purchase warns, never blocks, when none of the customer's properties can get visits.** | The customer decides. Documents, Pittu and reminders still work everywhere. |
| **"Tell me when you arrive" is recorded per property** (`reach_interest`). Staff see properties outside our areas grouped by PIN code, with how many customers asked. | Shows where to expand next. |
| **A sale deed already in the locker (7 Oct 2026).** Same file (fingerprint, no AI cost) or same registration number → "Pittu knows this deed" with the property's name; **Open it** (the attempt is cleared) or the quiet link **"It's a different property — add it as new"** (form pre-filled from it). | The usual case is a forgotten upload; the link covers one deed for two sites. |
| **The sale deed comes first (7 Oct 2026).** Pittu fills in from the deed; going against it asks first; if the customer goes ahead, it stays listed under "Differs from your deed" (with "Use deed's") until closed, and changes at setup go on the Backoffice Review list. | The deed is the most reliable source; the app warns and records, the customer decides. |

| **Coverage is built on PIN codes (8 Oct 2026).** India's PIN directory (India Post, data.gov.in, GODL) is loaded into `pincodes` (`supabase/pincodes/pincodes.mjs`). Zones are named groups of PINs made of whole states, whole districts, single PINs and PINs left out; state and district rules follow the directory. Each service lists where it's offered (everywhere, zones, states, districts, PINs); the database decides per property (`service_covers`, `property_reach`). Old visit areas became zones; paperwork states became state rules on paperwork services. | One model for every service and place; nothing changed for customers on day one (checked on live data). The directory in use is the 2017 copy; refresh it with the current official file (`build` then `load`). |
| **Services and plans are ordered by drag, categories are data, pricing is an explicit choice** (Fixed, On quote, Plan only) **(8 Oct 2026).** | The team runs the catalogue without code changes. |
| **Renewals can stay on the customer's plan version** (per-version setting, on by default when publishing) **(8 Oct 2026).** | Changing a plan never surprises existing customers at renewal. |

## Known debt before public launch

| Item | Risk | Fix |
|---|---|---|
| Session tokens are stored in `AsyncStorage`, which is not encrypted. | Someone with access to the unlocked app sandbox (for example a jailbroken phone) could read the refresh token. | Switch to `expo-secure-store` with a chunking adapter, since sessions can exceed SecureStore's 2 KB limit per item on iOS. |
| Abandoned `pending` upload rows are never deleted. | Clutters the database; users never see them. | A scheduled cleanup of `pending` rows older than a day, plus their storage objects. |
| Real SMS isn't set up yet (DLT). | Only test numbers can sign in. | See SUPABASE_SETUP.md §9. |
| Vercel Hobby plan is non-commercial. | Not allowed for a commercial launch. | Upgrade the team to Pro (about $20/month) before launch. |
| `VERCEL_TOKEN` (GitHub secret) expires 1 year after creation. | Deploys stop working when it expires. | Renew it as described in DEPLOYMENT.md. |
| PIN directory is the 2017 copy of India Post's file. | Newer PIN codes are missing (the app warns but doesn't block). | Download the current "All India Pincode Directory" from data.gov.in, then `node supabase/pincodes/pincodes.mjs build <file>` and `load`. |
