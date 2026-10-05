# Security

What protects Propittu today, and the security work still to do, ordered by
**when** it must be done. Pick items up from the backlog; move them to "Done"
with the date when finished.

> This repository is public. Never add secrets, real phone numbers or
> environment values to this file.

## Controls in place

- **Phone-OTP login only** through Supabase Auth; no passwords exist.
- **1-hour access tokens with rotating refresh tokens**; renewal pauses in the
  background and resumes on open. Expired sessions are handled with a clear
  message, not broken screens.
- **Logout cancels the session on Supabase**, not just on the phone, and clears
  all cached data on the device. Logout also works offline.
- **Account isolation (M1/M10):** every customer-owned row carries `account_id`;
  the API resolves user → account server-side and ignores any account or user
  ID sent by the client. Staff are a separate boundary (`staff_members`).
- **Three independent "own data only" walls:** the API derives the user and
  Account from the verified token and filters every query by Account; Postgres RLS refuses other users'
  rows; Storage policies restrict files to the owner's folder.
- **The API holds no master key.** It acts as the signed-in user, so RLS applies
  to every request. The phone holds only the public publishable key.
- **Files never pass through the API.** The API chooses every storage path, and
  files are reached only via short-lived signed URLs.
- **Validated twice:** shared rules in the app for instant feedback, and
  authoritatively in the API and database (types, sizes, PIN format and so on).
- **Automated security tests gate every deploy** (GitHub Actions): 51 database
  checks (80 since M1), 29 API checks (34 since M1); a 46-check end-to-end run was done against production.
- Tokens are redacted from logs; all traffic is HTTPS.

## Backlog

### Before the closed beta (before any real property owner uses the app)

| ID | Item | Risk today | Fix | Effort |
|---|---|---|---|---|
| S1 | **Store the login in the iOS Keychain / Android Keystore** | The login (including the refresh token) is in ordinary app storage (AsyncStorage). iOS encrypts it while the phone is locked, but it is **readable from an unencrypted computer backup of the phone, or on a jailbroken/rooted or unlocked phone**. Whoever copies it can view, edit and delete that user's properties and **documents** until the user logs out. Other users' data stays safe (RLS), and it can't be stolen remotely. | Supabase's recommended Expo pattern: encrypt the session, with the key held in `expo-secure-store`. Also make sure a reinstall starts at a clean login (iOS Keychain survives app deletion). | ~2 h |
| S2 | **"Delete my account" in the app** | **Apple and Google reject apps** that allow sign-up without in-app account deletion. Also expected under India's DPDP Act. | API endpoint that deletes the user's files, rows and auth user; confirmation screen in Profile. | ~½ day |
| S3 | **Confirm the SMS rate limit is set** | Without it, a bug or abuse could send unlimited paid SMS. | Supabase → Authentication → Rate Limits → SMS per hour = 15. *Dashboard setting; can't be verified from code.* | 2 min |
| S4 | **Privacy policy and terms** | Required by both app stores; users are storing property documents. DPDP Act 2023: notice and consent for personal data. | Publish pages (e.g. on propittu.com); link them from Login and Profile. | Content: owner; wiring: ~1 h |

### Before public launch

| ID | Item | Risk | Fix |
|---|---|---|---|
| S5 | **Remove the test phone numbers** from Supabase Auth — **especially the Backoffice Super Admin number** | Test numbers accept a fixed OTP, so anyone who knows one can log in as that account. For the Super Admin, that means **every customer's data**. | Delete them under Authentication → Phone (keep one only if a store-review account is needed). |
| S6 | **Real SMS provider with DLT registration** | Without it only test numbers can sign in (functional, not security, but a launch blocker). | See SUPABASE_SETUP.md §9; revisit rate limits with real traffic. |
| S7 | **Backups for customer data** | The Supabase free plan has **no automatic backups**; losing sale deeds would be serious. | Supabase Pro (daily backups) at launch. Interim: periodic `supabase db dump`. Storage files need their own backup plan. |
| S8 | **Renew `VERCEL_TOKEN` before it expires** (~Oct 2027) | Deploys stop when it expires (availability, not exposure). | Steps in DEPLOYMENT.md. Rotate immediately if it ever leaks. |
| S9 | **Dependency vulnerabilities** | API runtime: **0**. Mobile: 31 advisories (12 moderate, 19 high), almost all in Expo/Metro **build tooling** that runs on the developer machine, pinned by Expo SDK 57. | Before launch: `npx expo install --fix` on the latest SDK 57 patch, re-run `npm audit --omit=dev`, and review anything that ships in the app bundle. Don't `npm audit fix --force` (it breaks SDK alignment). |
| S10 | **Clean up abandoned uploads** | Uploads started but never confirmed leave `pending` rows (invisible to users) and possibly orphaned files. Hygiene and cost, low risk. | Scheduled job deleting `pending` rows older than a day, plus their objects. |

### Later / optional

| ID | Item | Notes |
|---|---|---|
| S11 | **Face ID / fingerprint to open the app** | Common for sensitive documents; an alternative to forcing re-logins. `expo-local-authentication`. |
| S12 | **Error monitoring and alerting** | Currently there's no alert if the API starts failing. e.g. Sentry free tier, or Vercel log alerts. |
| S13 | **API rate limiting / abuse protection** | Vercel provides baseline DDoS protection; there are no per-user limits. Add if abuse appears. |
| S14 | **Post-logout token window** | The API verifies tokens locally (fast, no network call), so an *access* token already copied stays usable for up to 60 minutes after logout. Accepted for now; shortening the JWT lifetime in Supabase reduces it. |

## Accepted decisions

| Date | Decision | By |
|---|---|---|
| 2026-10-05 | Logout ends the user's session on **all** their devices (Supabase default), not just the current phone. Acceptable for V1. | Product owner |
| 2026-10-05 | The repository is public. It contains no secrets; environment values live only in `.env` files (git-ignored), Vercel, and GitHub secrets. Making it private later is supported by the deploy setup. | Product owner |

## Done

_(Move backlog items here with the date when completed.)_
