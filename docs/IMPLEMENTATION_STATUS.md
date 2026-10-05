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
| 2 | M2 Property (location pin, profile completion) + M3 Documents & Media (new categories, videos) | ⏳ Next |
| 3 | M5 Plans & Benefits + M6 Trial / Usage / Limited Access | Planned |
| 4 | M4 Services (new catalogue, visit reports, usage on confirm) + M9 Backoffice (staff mode) | Planned |
| 5 | M7 Payments (Razorpay), full Day-3 and security journeys, final report | Planned |
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

## How to resume
1. Read this file and [ARCHITECTURE.md](ARCHITECTURE.md).
2. `npm install && npm test` (RLS + API suites).
3. Continue with the next checkpoint marked ⏳.
