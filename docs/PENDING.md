# Propittu — pending items

Decisions and work parked for later (as of 6 Oct 2026). Revisit once DLT
registration is through.

## Waiting on the owner

| # | Item | What's needed | Status |
|---|---|---|---|
| 1 | **Real SMS (OTP)** | DLT registration (Entity ID, sender header e.g. `PROPTU`, OTP template), MSG91 account + KYC. No Twilio needed. | Owner: DLT in progress. Then ~1 day build: Supabase Send-SMS hook → API → MSG91; keep one reviewer test number. |
| 2 | **Store fee model** | Decide: (a) service-only — app features free for all with one fair-use limit, plans = visit memberships, Razorpay 0%; or (b) keep plans unlocking capacity, sell them on the web (no in-app Buy). | Deferred. Today plans unlock app capacity (Limited Access + per-plan limits) → a reviewer would likely require store billing. |
| 3 | **Store accounts** | Apple Developer (organisation, D-U-N-S), Google Play Console (organisation). | Deferred (5.A). |
| 4 | **Legal pages** | Filled in (Asettulu Technologies LLP; Grievance Officer “Contact Propittu”; no cancellations or refunds — write to contact@propittu.com). Still to do: lawyer review; move to propittu.com. Pages live at `/legal/privacy`, `/legal/terms`, `/legal/delete-account`. | Filled in; lawyer review pending. |
| 5 | **Support phone** | A customer-care number (shown in Help & Support when `EXPO_PUBLIC_SUPPORT_PHONE` is set). | Hidden until available. |

## Dates to remember

| When | What |
|---|---|
| **by 29 Oct 2026** | Replace the Anthropic **production** API key (`propittu-production`, created 6 Oct 2026, 30-day expiry → ~5 Nov). Console → API Keys → create new → paste into Vercel `ANTHROPIC_API_KEY` (Production, Sensitive) → redeploy → delete the old key. Until replaced, Pittu stops reading (nothing else is affected). |

## Open from the UI/UX pass (7 Oct 2026)

Waiting on the owner:
- Photographing deed pages instead of a PDF: proposed (in-app camera, 1–10 pages, server joins them into one PDF); waiting for go-ahead.
- Configurable Pittu questions + configurable service templates: design together (recommended) or separately.
- Publishing to testers (EAS preview): ask each time.

Loose ends noted:
- Deeds uploaded as plain documents (e.g. One's) are never read, so no deed-vs-pin check — offer "Let Pittu read this deed" (explained to the owner; awaiting decision).

Next planned: Home round 3 — "Around your property" news posted from Backoffice, the flash-news marker on cards, analytics groundwork.

## Feature backlog to discuss (owner's notes, 7 Oct 2026)

Nothing below is decided yet. Grouped by theme, in the suggested order.

1. **Add-property improvements (small, next)**
   - Photograph deed pages instead of a PDF (proposed; owner checking).
   - "Let Pittu read this deed" for deeds uploaded as plain documents.
   - Pittu's questions during onboarding — e.g. ask them while Pittu reads the deed, instead of after saving.
2. **Configurable services and questions (one design, built in phases)** — design written: docs/CONFIGURABLE_SERVICES.md (awaiting the owner's review and the decisions in its §9)
   - Service request templates: steps, what the app collects, what staff see, statuses, outcome fields (e.g. tax year, receipt number).
   - Default schedule interval per service (e.g. a site visit every 3 months) and tracking deviation from it.
   - Campaigns from Backoffice: time-limited lower prices; area pushes when an agent is visiting a region (needs notifications).
   - Configurable Pittu questions (rules in the database, conditions, versions, editor with preview).
3. **Home round 3** — "Around your property" news posted from Backoffice, the flash-news marker on cards, analytics groundwork.
4. **Market value estimates** — design pending the owner's answers (area, rate setting, pricing, valuer partner).
5. **Google Maps on both platforms** — iPhone uses Apple Maps today; Google Maps on iPhone needs a Google Maps API key and a native app build (not Expo Go), so it fits with the store builds.

## Go-live setup (5.B.4)

- **Must do before launch — S1 (owner confirmed 7 Oct 2026):** move the login session from plain app
  storage to secure storage (`expo-secure-store`), per docs/SECURITY.md S1 (~2 h). Also make sure a
  reinstall starts at a clean login.
- Git history (owner decision 7 Oct 2026: leave as is): commit `fa2c037` still contains a real phone
  number, PAN and Aadhaar-style number in an old test file (now replaced with fakes). Rewriting
  history was declined for now; revisit if the repo stays public at launch, or make the repo private.
- Razorpay live keys (after their KYC).
- Vercel Pro (commercial use) and Supabase Pro (backups / PITR, longer logs).
- Log drain for API logs (Axiom / Better Stack) — Vercel keeps runtime logs only briefly.
- Optional: Sentry crash reporting.

## Store listing & release (5.B.5, 5.C)

- Final icon, screenshots, description, category (House & Home), age rating, privacy / Data Safety forms.
- Reviewer demo login (fixed-OTP test number).
- `eas build` (production) → TestFlight + Play internal testing → submit. Only when the owner says go.

## Product follow-ups noted

- **Brainstorm (owner asked to be reminded): configurable services at scale.** Each service with
  its own steps, the information collected in the app, what staff / agents see and do, its
  statuses, pricing and timelines — defined in data, not code, and usable by the AI layer.
  Today: services are rows with category, delivery (visit / paperwork), reach, price, includes
  and turnaround; two fixed status flows; outcomes per delivery type. See the brief from 7 Oct.


- Where we serve: per-area service lists, if one area ever offers fewer services.
- Market value estimate (discussed 6 Oct): design doc pending the owner's answers on area, rate setting, pricing and a valuer partner.

- Service-specific fields (e.g. tax assessment year) on paperwork-help outcomes.
