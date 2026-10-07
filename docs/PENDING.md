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

- Account deletion: consider a 7-day grace period (deletion scheduled, cancelled by logging in) — needs the delete function to run from the server, and the delete page wording updated.

- Where we serve: tell interested customers when their PIN code is added (needs notifications); use the map pin as a cross-check on wrong PIN codes; per-area service lists, if one area ever offers fewer services.
- Market value estimate (discussed 6 Oct): design doc pending the owner's answers on area, rate setting, pricing and a valuer partner.

- Document access logging (who opened / downloaded which document) — not recorded today.
- Service-specific fields (e.g. tax assessment year) on paperwork-help outcomes.
- Deleting a saved result file from Documents breaks its link on the request (same file).
