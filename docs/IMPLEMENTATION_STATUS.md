# Implementation status: M1–M12

Tracks progress against
[requirements/PROPITTU_MASTER_IMPLEMENTATION_M1-M11_DAY3.md](requirements/PROPITTU_MASTER_IMPLEMENTATION_M1-M11_DAY3.md).
Updated at every checkpoint. **Read this first when resuming work.**

## Decisions taken for this build (product owner, 2026-10-06)

| Topic | Decision |
|---|---|
| Limited Access | **Strict, as written:** only account, Plan/Trial status, available Plans, the payment journey and support are available. Property screens, uploads and service requests are blocked until a Plan is active. Data is never deleted. |
| Payment provider | **Razorpay** (UPI + cards), behind the provider interface. Stripe India is invite-only and its UPI support is doubtful, so Stripe can be added later as a second adapter. |
| Backoffice | **Staff mode inside the mobile app**, visible only to staff. Same API and business rules. |
| Trial and placeholder Plans | **30-day Trial with Plus Benefits.** Placeholder prices (not final): Basic ₹499/yr, Plus ₹1,499/yr. Everything is editable data. |

## Checkpoints

| # | Modules | Status |
|---|---|---|
| 1 | **M1 Account + M10 security foundation + M11 audit events** | ✅ Done |
| 2 | **M2 Property (location pin, profile completion) + M3 Documents & Media (new categories, videos)** | ✅ Done |
| 3 | **M5 Plans & Benefits + M6 Trial / Usage / Limited Access** | ✅ Done |
| 4 | **M4 Services (catalogue, Included vs Extra, visit reports, usage on confirm) + M9 Backoffice (staff mode)** | ✅ Done |
| 5 | M7 Payments (Razorpay), full Day-3 and security journeys, final report | ⏳ Next |
| — | M8 Notifications | Deferred by design (a central extension point only) |
| — | M12 Property Intelligence & AI | Deferred by design |

## Checkpoint 1: M1 Account + M10 foundation + M11 audit (done)

**Database:** migration `20261006000001_accounts.sql`
- `accounts` (status: active / suspended / closed) and `account_members` (user ↔ account, role owner/member). **V1: one user per account**, enforced by a unique index that can be dropped for multi-user accounts.
- `staff_members` (super_admin, operations, support, finance, service_operations): the Backoffice boundary, separate from customers.
- `account_id` added to `properties`, `property_photos`, `property_documents` and `service_requests`, then backfilled. `user_id` on those rows now means "created by".
- New sign-ups get profile, account and owner membership in one trigger. Existing users were backfilled.
- `audit_events` (append-only; customers can write their own, only staff can read).
- RLS rebuilt on account membership. Staff can **read** across accounts; staff write paths are added per module later.
- Storage: new uploads go to `<account_id>/<property_id>/…`. Older uploads keep their `<user_id>/…` paths and still work.

**API**
- Every request resolves **user → account** server-side after verifying the token. A login with no account gets 403. Every query and insert is scoped by the server-resolved `account_id`, and any `account_id` or `user_id` sent by the client is ignored.
- `GET /me` now returns `account { id, status, role }` and `staff_role`.
- Audit events: property created/deleted, photo uploaded/deleted, document uploaded/deleted, service request created.

**Tests**
- RLS suite: **80 checks**. Covers forged `account_id` and creator, cross-account inserts and reads, customers unable to escalate, staff read but not write, deactivated staff, audit-log privacy, account-folder storage and anonymous access.
- API suite: **34 checks**. New: account resolved server-side, forged `account_id` ignored, no-account login → 403, audit event recorded.

**Live:** migration applied to Supabase; both test users verified as owning their own account, with data backfilled.

## Checkpoint 2: M2 Property + M3 Documents & Media (done)

**Database:** migration `20261006000002_property_media.sql`
- `properties`: `location_source` (user / sale_deed / ai / external / system), `location_confirmed_at` and `field_sources` (a per-field provenance map). Coordinates **require** a source, so future AI or external data can never silently overwrite a user-confirmed value.
- Document categories are now **Sale Deed / Registration / Property Tax / Other**. Old test rows were remapped (tax receipt → Property Tax, everything else → Other) and nothing was deleted. New `description` field, and `status` (uploaded / under review / verified / rejected), which **only staff** can change.
- `property_videos` table and private `property-videos` bucket (MP4/MOV, ≤ 50 MB, which is the Supabase free-plan file limit), with RLS and storage policies matching photos.
- The summary view gains `photo_count` and `video_count`.

**API**
- Property create and update record provenance: user-supplied fields → `user`; a confirmed map pin → `location_source = user`. Any client-sent source is ignored.
- `GET /properties/:id` returns `videos` and `completion` (percent, items, next actions). The rules live in `packages/shared/src/completion.ts`.
- Videos: `GET /properties/:id/videos`, `POST …/videos/intent`, `POST …/videos/:videoId/confirm`, `DELETE /videos/:id`.
- Documents: `description` on upload; new `PATCH /documents/:id` (category and description only).

**Mobile**
- **Location screen:** the address is geocoded on the phone (free, no API key) to an approximate pin; the owner drags or taps to adjust, or uses their current location, then confirms. The details screen shows a map preview.
- **Completion card** ("62% complete") with tappable next steps: confirm location, upload sale deed, add a photo, and so on.
- **Videos section:** pick (trimmed to 60 s on iOS), upload with progress, play, delete.
- Add Document: the 4 categories, a description field, and the category preselected when opened from "next steps".

**Tests:** RLS **98** checks (videos isolation, retired categories rejected, customers can't self-verify, provenance required) · API **42** checks (video limits, half-pin rejected, provenance merge, no client status) · mobile typecheck, lint, expo-doctor 21/21, iOS and Android bundles.

## Checkpoint 3: M5 Plans & Benefits + M6 Trial / Usage / Limited Access (done)

**Model:** Account → Plan → Benefits → Usage. All of it is **data**, not code:
- `plans` → `plan_versions` (price in paise, billing period, term, one *current* version per plan) → `plan_version_benefits` (`feature` / `limit` / `included_service`). New customers get the current version; existing customers keep theirs. Changing a price or limit means adding a new version, with no code change.
- `account_plans`: the Account's Plan periods (source: trial / payment / staff; `cancel_at_period_end`). The Plan **in force** is the most recently started period covering *now*.
- `usage_records`: consumption of Included Services (property visits), written when a request is confirmed (checkpoint 4). `account_usage` view: property count and storage bytes (ready files only), derived and never stored.
- Seeded placeholder Plans (not final):

| | Trial (30 days) | Basic ₹499/yr | Plus ₹1,499/yr |
|---|---|---|---|
| Properties | 5 | 1 | 5 |
| Documents / photos / videos per property | 50 / 100 / 10 | 10 / 20 / 2 | 50 / 100 / 10 |
| Storage | 2 GB | 512 MB | 2 GB |
| Included property visits | 2 per year | 1 per year | 2 per year |

**Trial (M6):** started by the sign-up trigger, **once per Account** (`accounts.trial_started_at`). `start_trial()` cannot be called by any client. Existing accounts were backfilled with a 30-day Trial.

**Enforcement (the API is the only authority):**
- `requireActivePlan` sits in front of every property, document, photo, video and service route. No Plan in force gives **402 `LIMITED_ACCESS`** (strict, as decided); a suspended Account gives 403.
- Still available in Limited Access: `/me`, `GET /plans`, `GET /account/plan`, `POST /account/plan/cancel`, and later the payment journey.
- On create or upload: Feature check (403 `FEATURE_NOT_INCLUDED`), then limit check (403 `LIMIT_REACHED` with `{limit, used}`), then storage check. These replaced the old fixed caps (20 photos, 10 videos).
- **Downgrade / over limit:** nothing is deleted. Editing and deleting still work; only **additions** are blocked. `GET /account/plan` reports `over_limit`.
- Cancel = no renewal; the paid period continues. A Trial can't be cancelled; it just ends.

**Backoffice (minimal, for operations and testing; the full M9 comes in checkpoint 4):** `/backoffice/*` returns 404 to non-staff.
- `GET /backoffice/accounts/:id/plan`
- `POST /backoffice/accounts/:id/plan` `{plan_code, days?}`: grant a Plan (source `staff`)
- `POST /backoffice/accounts/:id/plan/end`: end now → Limited Access
- Grant and end need the operations or finance role (super_admin can do everything). Each action is audited against the **target** Account with `actor_type = staff`.

**Staff accounts** come from `staff_invites` (a phone number becomes staff on first login). Rows are inserted by an operator with `supabase db query --linked` and are **never committed**. The Super Admin invite is in place.

**Mobile**
- **Home:** trial countdown banner ("Free trial · 23 days left"), or a notice when a cancelled Plan is about to end.
- **Limited Access:** Home and Services show a "Your free trial or plan has ended — your data is safe" screen with **View plans**. Any 402 anywhere refreshes the gate.
- **Plan & Usage** screen (from Profile or the banner): status, days left, usage bars (properties, storage, included visits), an over-limit warning, the available Plans with Benefits, and Cancel. "Choose plan" says online payment is coming (Razorpay in checkpoint 5).
- Limit and Feature errors show the API's message ("Your Basic plan allows 1 properties. Upgrade your plan to add more.").

**Tests:** RLS **126** checks (customers can't grant themselves Plans, write usage or Plan config, or read invites; Trial once per Account; staff can grant) · API **61** checks (Limited Access strict and its allowed routes, limit and feature enforcement, over-limit editing, suspended Account, staff role checks, target-account audit).

## Checkpoint 4: M4 Services + M9 Backoffice (done)

**Database:** migration `20261006000004_services_backoffice.sql`
- **Service Catalogue:** `services` gains `price_paise` (null = priced after review) and `is_extra_available`. New services: **Property Visit** (flagship), Video Documentation and Repair (13 services in total). Placeholder prices, not final: Visit ₹999, Inspection ₹1,499, Photography ₹1,999, Video ₹2,499, Cleaning ₹1,499, Security check ₹999; the rest are priced after review. Staff edit the catalogue; customers see only active services.
- **Service Requests:** lifecycle **Requested → Confirmed → Scheduled → In Progress → Completed / Cancelled**. Old rows were remapped (submitted / in review → requested). New fields: `coverage` (included / extra), `price_paise` snapshot, `preferred_date`, `scheduled_for`, `status_note`, and confirmed/completed/cancelled timestamps.
- **Requests can be created only through `create_service_request()`.** Customers can no longer insert rows directly. The function checks the account, active Plan, property ownership and service availability. It then decides **Included vs Extra on the server**, snapshots the price, and locks the account so the last Included visit can't be given out twice.
- `included_remaining(account, code)`: allowance minus consumed usage minus requests still awaiting confirmation. The API, the catalogue and Plan & Usage all use this one rule.
- **Usage is consumed when staff confirm, not when the customer requests** (`staff_update_service_request()`), and it's released if a confirmed request is cancelled. The same function enforces the allowed status transitions. Customers can cancel only while a request is still Requested.
- **Property Visit reports:** `visit_reports` (visit date, condition good / fair / needs attention, observations, issues, recommendations) and `visit_report_media` (photos and videos). Files live in the **customer's account folder** (`<account>/visits/<request>/…`) so the customer can read them. Only staff can write them.
- **Backoffice:** the `backoffice_accounts` view (staff only; empty for customers) and `staff_set_document_status()` for document review.

**API**
- Customer:
  - `GET /services` returns each service with `coverage` (included / extra / unavailable) and `included_remaining` for the caller's account.
  - `POST /service-requests` accepts an optional preferred date (today or later). Any coverage, price or status sent by the client is ignored.
  - `GET /service-requests/:id` includes the visit report.
  - `POST /service-requests/:id/cancel`.
- Backoffice (`/backoffice/*`; 404 for customers, role-checked per action, every action audited against the customer's account):
  - `GET /requests?status=open|all|…`, `GET /requests/:id`
  - `POST /requests/:id/status` {status, scheduled_for?, note?}
  - `PUT /requests/:id/report`; `POST …/report/media/intent`, `…/:mediaId/confirm`, `DELETE …/:mediaId`
  - `GET /accounts?q=` (mobile number or name), `GET /accounts/:id` (Plan, usage, **why the customer is blocked**, properties, requests), `POST /accounts/:id/status` (suspend / reactivate), and the Plan grant / end actions from C3
  - `GET /properties/:id` (details, photos, documents), `GET /documents/:id/download`, `POST /documents/:id/status`
  - `GET /services`, `POST /services`, `PATCH /services/:id`
- Roles (`packages/shared/src/services.ts → STAFF_PERMISSIONS`): requests → operations and service_operations; Plans → operations and finance; account status and document review → operations and support; catalogue → operations. super_admin can do everything. Any staff role can view.

**Mobile**
- Catalogue and request form show "Included in your plan · 1 left", "Extra · ₹1,499" or "Extra · price confirmed after review". The request form adds an optional **preferred date** (native date picker).
- Request detail: status, cost, preferred and scheduled date, staff note, timeline, **visit report with photos/videos**, and **Cancel** while Requested.
- **Staff mode** (Profile → Open Backoffice, shown only to staff):
  - **Requests** queue with filters. Each request has actions for its allowed next statuses (confirm / schedule with date / start / complete / cancel), a note to the customer, and a visit report form with photo and video upload.
  - **Customers:** search by mobile number, then Plan & usage, why blocked, give Basic/Plus, extend the trial 7 days, end the plan, suspend/reactivate, and their properties and requests.
  - **Property:** details, map link, photos, and documents with Open plus review status (Uploaded / Under review / Verified / Rejected).
  - **Services:** edit name, description, price, active, and available as an Extra.

**Tests:** RLS **164** checks (forged Included rejected, allowance reserved and released, staff-only transitions, invalid transitions, report and media ownership, prices snapshotted) · API **83** checks · live production E2E **38** checks (the full request → confirm → schedule → report with photo → complete → customer sees it journey, isolation, document review, catalogue edit, audit), with the C1–C3 live suites re-run green.

**Not in V1 (by design, per M4):** vendor marketplace, ratings, quotes, field-service tracking. **Payment for Extra Services** comes with M7 in checkpoint 5.

## How to resume
1. Read this file and [ARCHITECTURE.md](ARCHITECTURE.md).
2. `npm install && npm test` (RLS + API suites).
3. Continue with the next checkpoint marked ⏳.
