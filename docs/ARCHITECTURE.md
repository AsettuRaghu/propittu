# Architecture

```
Expo mobile app (iOS/Android)  ──login/logout──►  Supabase Auth (Mumbai)
        │
        │ HTTPS + Bearer <Supabase access token>
        ▼
Propittu API: one stateless Express function on Vercel (bom1, Mumbai)
   the business boundary: identity → Account → ownership → Benefits → Usage → action
        │ queries AS the signed-in user (RLS enforced)
        ▼
Supabase Postgres (system of record) + Supabase Storage (private files)
```

- **Mobile is a client.** It never decides Benefits, Usage or ownership.
- **The API is the business boundary**, used by both the customer app and the Backoffice (staff mode).
- **Supabase is the system of record.** Schema changes only via versioned migrations in `supabase/migrations/`.
- **No microservices, queues or caches.** Provider adapters only where required (payments; later notifications and AI).

## Domain model

```
User (Supabase Auth) ──member of──► Account ──► Plan → Benefits → Usage        (M5/M6)
                                       │
                                       ├──► Property ──► Photos / Videos       (M2/M3)
                                       │       │    └──► Documents
                                       │       └──► Service Requests ──► Visit report (M4)
                                       ├──► Orders → Payments → Refunds        (M7)
                                       └──► Audit events                       (M11)

Staff (staff_members) ──► Backoffice: reads across Accounts; staff-only actions  (M9)
```

### Account (M1)
- The commercial owner of everything: Plan, Trial eligibility, Properties and Usage belong to the **Account**, not to a phone number.
- `account_members(account_id, user_id, role)`. **V1: one user per account**, enforced by a unique index on `user_id`. Multi-user later means dropping that index and adding roles and permissions.
- Created automatically with the first login (database trigger), together with the profile.

### Authorization: every protected operation (M10)
1. **Authenticated?** The Supabase JWT is verified locally against the published signing keys.
2. **Which Account?** Looked up server-side from `account_members`, never taken from the client.
3. **Does the resource belong to that Account?** e.g. `assertOwnsProperty(db, accountId, propertyId)`. Another account's resource returns 404, so IDs can't be probed.
4. **Benefit available?** `requireActivePlan` (no Plan in force → 402 Limited Access), then `requireFeature` → 403 `FEATURE_NOT_INCLUDED`.
5. **Usage available?** `enforceLimit` / `enforceStorage` → 403 `LIMIT_REACHED`. Only *additions* count, so editing and deleting always work.
6. **Perform the action**, as the user, so Postgres RLS re-checks account membership.

Staff are a **separate boundary**: `staff_members`, plus `is_staff()` in RLS. Customers can never reach staff-only functions.

### Plans, Benefits and Usage (M5/M6)
- Plans are versioned data: `plans → plan_versions → plan_version_benefits`. Benefit **codes** are fixed in `packages/shared/src/plans.ts` because the API enforces them; their **values** are rows.
- `account_plans` holds the Account's periods; the Plan in force is the most recently started one covering now. Sources: trial (once per Account, from the sign-up trigger), payment (M7), staff (Backoffice).
- Usage: capacity is derived (`account_usage` view: properties, storage of ready files). Included Services are recorded in `usage_records` when consumed (M4).
- Limited Access is strict: `/me`, `/plans`, `/account/plan*` (and payments) are mounted **before** the gate; everything else after it. Code: `apps/api/src/plan.ts`.

### Services and Backoffice (M4/M9)
- Three separate concepts: **Service Catalogue** (`services`), **Included Services** (Plan Benefits) and **Service Requests**.
- A request is opened only by `create_service_request()` (SECURITY DEFINER). It decides Included vs Extra and snapshots the price. Status changes go through `staff_update_service_request()`, which enforces the lifecycle and **consumes usage on confirmation**. Both run in Postgres, so the API, the Backoffice and any future client share one rule set.
- **Property Visit report:** `visit_reports` plus `visit_report_media`, with files in the customer's account folder.
- **Backoffice** is staff mode inside the mobile app. `/backoffice/*` sits behind `requireStaff` (404 otherwise) plus per-action `STAFF_PERMISSIONS`, and RLS / `is_staff()` re-check in the database. Staff actions are audited against the customer's account.

### Payments & Billing (M7)
```
Mobile ──POST /billing/checkout──► API ──create_plan_order()──► orders (priced by the DB)
                                    └──PaymentProvider.createCheckout──► Razorpay Payment Link
Mobile opens the hosted page (UPI / cards) in the in-app browser
Razorpay ──signed webhook──► /webhooks/razorpay ──verify HMAC──► record_payment_event()  (service_role)
                                                        └─► payments, orders=paid, account_plans (+ renewals queue)
Mobile ──POST /billing/orders/:id/refresh──► API asks Razorpay server-to-server (if the webhook is late)
```
- **Propittu owns** orders, payments, refunds, payment_events (webhook log) and Plan status. Razorpay ids are references only.
- **Provider interface** (`apps/api/src/billing/provider.ts`): `createCheckout`, `fetchCheckout`, `verifyWebhook`, `parseWebhook` → provider-neutral events. Razorpay is one adapter; Stripe (or another) is a second file, not a rewrite.
- **Activation rules** (in `record_payment_event()`): Trial → paid starts now and ends the Trial; buying the Plan you already have queues after the current period (no lost days); a different Plan starts now. Cancellation = no renewal (M5). Extra Services have their own order/payment; fulfilment stays the request lifecycle.

### Notifications (M8 — deferred)
- One extension point: `notify(event)` in `apps/api/src/notify.ts`, called for request status changes, report publication and payments. It only logs today; a notification service plugs in there.

### Property profile (M2)
- Location is first-class: address → approximate position (phone geocoder) → the owner confirms or moves the pin → saved with `location_source = user`.
- **Provenance:** `field_sources` records who supplied each value (user / sale_deed / ai / external / system). Future M12 extraction writes its own source and must never overwrite a `user` value.
- **Completion:** one shared function (`packages/shared/src/completion.ts`) produces the percent and next actions; the API computes it and the app renders it.

### Storage (M3/M10)
- Private buckets `property-photos`, `property-documents` and `property-videos` (≤ 50 MB per file).
- Object paths are chosen by the API: `<account_id>/<property_id>/<uuid>.<ext>`. Uploads made before accounts existed use `<user_id>/…` and remain readable.
- Uploads and downloads use short-lived signed URLs, issued only after the ownership checks above.

### Audit and observability (M11)
- `audit_events`: important business events, append-only; staff read, customers write their own.
- Structured JSON logs (pino) with request IDs; tokens redacted. `/health` checks liveness. A daily cron (`/cron/keepalive`) keeps the Supabase free project awake.

## Where things live

| Path | What |
|---|---|
| `apps/api/src/auth.ts` | Token verification + user → account resolution |
| `apps/api/src/ownership.ts` | Resource-belongs-to-account checks |
| `apps/api/src/audit.ts` | Audit event helper (never fails the request) |
| `apps/api/src/routes/` | One router per resource |
| `packages/shared/src/` | Types, zod schemas and constants shared by API and app |
| `supabase/migrations/` | All schema and RLS, in order |
| `supabase/rls-check/` | Database security suite (`npm run test:rls`) |
| `apps/api/test/smoke.mjs` | API security suite (`npm run test:api`) |

## Mobile app structure and rules

| Path | What |
|---|---|
| `apps/mobile/src/app/` | Screens only (Expo Router: every file is a route) |
| `apps/mobile/src/api/` | Talking to the API: `client.ts` (auth token, timeout, errors) and React Query hooks per area |
| `apps/mobile/src/auth/` | Session (Supabase Auth: sign-in only) |
| `apps/mobile/src/components/` | Shared components; `ui/` holds the primitives (Buttons, Surfaces, Status, Selection) |
| `apps/mobile/src/lib/` | Helpers and cross-screen hooks (`plans.ts`, `useLogout`, formatting, icons) |
| `apps/mobile/src/theme.ts` | Design tokens (colours, spacing, type) |

**How data flows.** The app reads and writes **only through the API** (`api()` in `client.ts`).
Supabase is used directly for sign-in (OTP) and nothing else; files go up and down through
short-lived signed URLs that the API issues after checking ownership. No secret is ever in the
app: only `EXPO_PUBLIC_*` values (API URL, Supabase URL and publishable key, support phone).

**Rules for every change.**
- Screens compose shared components; logic used by more than one screen lives in `lib/` or `api/`.
- Extend a shared component with an option rather than copying it (see `docs/UI_GUIDELINES.md`).
- Keep files focused: when a screen grows past ~400 lines, move its flows into a hook.
- No dead code: run `npx knip` (config in `knip.json`) before committing; it lists unused files,
  exports and dependencies. `npm run typecheck`, `npm run lint`, `npm run format:check` and the
  test suites must pass.
- Business rules are enforced on the server (API + database); the app only explains them.

**API protections** (`apps/api/src/app.ts`): baseline security headers, a 100 kb JSON limit,
webhooks verified on the raw body before anything else, then `requireAuth`, then
`requireActivePlan`; logs redact the authorization header.
