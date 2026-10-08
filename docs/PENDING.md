# Propittu — pending items

What is open, as of **8 Oct 2026**. Built work is tracked in the Build Tracker; product decisions are in
docs/DECISIONS.md; Pittu's design in docs/PITTU.md.

## Waiting on the owner

| # | Item | What's needed |
|---|---|---|
| 1 | **Real SMS (OTP)** | DLT registration (Entity ID, sender header e.g. `PROPTU`, OTP template), MSG91 account + KYC. Then ~1 day build: Supabase Send-SMS hook → API → MSG91; keep one reviewer test number. |
| 2 | **Store fee model** | Decide: (a) service-only — app features free with one fair-use limit, plans = visit memberships; or (b) plans unlock capacity, sold on the web (no in-app Buy). |
| 3 | **Store accounts** | Apple Developer (organisation, D-U-N-S), Google Play Console (organisation). |
| 4 | **Legal pages** | Lawyer review; move to propittu.com. Live at `/legal/privacy`, `/legal/terms`, `/legal/delete-account`. |
| 5 | **Support phone** | A customer-care number (shown in Help & Support when `EXPO_PUBLIC_SUPPORT_PHONE` is set). |
| 6 | **Pittu Legal manual pilot** | Run the Basic check by hand on our properties (docs/PITTU_LEGAL_PILOT.md); send the results and the ECs. |
| 7 | **EC provider** | Send the drafted email to Landeed (+ one alternative): API pricing and Karnataka/Telangana coverage. Needed for automatic EC fetching. |
| 8 | **Kaveri helpdesk** | Confirm a company account may apply for ECs on customers' behalf. |
| 9 | **Lawyer partner** | For the advocate-signed tier, and to review the legal report wording before we charge for it. |
| 10 | **Prices and products** | Prices of the legal checks (guide: ₹2,000 / ₹5,000 / ₹10,000) and Guard; whether "Check before you buy" is a separate product. |
| 11 | **Separate AI keys** | A testing key (`~/propittu-anthropic-eval-key.txt`) apart from the app's, so Console totals match the Pittu page. |
| 12 | **Current PIN directory** | Download "All India Pincode Directory" (data.gov.in) into Downloads; we load it with `supabase/pincodes/pincodes.mjs` (the 2017 copy is in use). |
| 13 | **In-app Backoffice** | The link is hidden (8 Oct 2026); decide before go-live: bring it back or remove the in-app Backoffice. |
| 14 | **Publishing the app** | Ask each time. Waiting in the app: PIN-first property form, live support chat and "new reply" alerts, categories from the portal, EC document type, renewal price, Backoffice link hidden. |

## Dates to remember

| When | What |
|---|---|
| **by 29 Oct 2026** | Replace the Anthropic **production** API key (`propittu-production`, 30-day expiry → ~5 Nov). Console → API Keys → create new → Vercel `ANTHROPIC_API_KEY` (Production, Sensitive) → redeploy → delete the old key. Until replaced, Pittu stops reading (nothing else is affected). |

## Next that needs no decision (Claude)

- Built 8 Oct 2026, waiting for the next app publish and a phone test: the property page's "From
  Pittu" rows (Around your property, Government value, Records check) with their screens, the news dot
  on Home cards, and S1 secure login storage. ("Let Pittu read this deed" was already in the app.)
- Check that the live server reaches the GDELT news index after the first daily Watch run.
- Portal lists: move search and filters to the server when they pass a few hundred rows.

## Parked (owner's priorities)

| Priority | Item | Notes |
|---|---|---|
| P4 | **Service templates and steps** | Per-service intake fields, steps, conditions and calculations, outcome fields, versions (docs/CONFIGURABLE_SERVICES.md). Today's two paths with the guided request pane are enough; build it around the first service that doesn't fit. |
| P4 | **Vendors in service steps** | A vendor directory and a vendor step (e.g. a lawyer). Builds on templates. |
| P5 | **Colour-coded PIN map** | A dot per PIN (covered / not / waiting), later shaded PIN boundaries. |
| On hold | **Configurable Pittu questions, schedules, campaigns** | Part of the configurable-services design. |
| Store build | **Push notifications, Google Maps on iPhone** | Need a native app build. |

## Pittu — what is built and what waits

- **Pittu Read:** sale deed (live); Encumbrance Certificate (first version, staff-started) — score on the pilot ECs.
- **Pittu Legal:** EC check, upload-first — rules, staff review, printable report, share. Automatic EC fetching waits on item 7.
- **Pittu Watch:** local news, daily at 7 am, team-approved. Government notices next on the same pipeline.
- **Pittu Value:** government value from published rates × area. Market prices need a data partner later.

## Go-live setup (5.B.4)

- **S1 secure login storage:** built 8 Oct 2026 (`apps/mobile/src/lib/authStorage.ts`); test after
  the next publish that you stay signed in through the update, and that deleting and reinstalling the
  app starts at sign-in (this part needs a real build, not Expo Go).
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
