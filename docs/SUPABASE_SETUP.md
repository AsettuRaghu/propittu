# Supabase setup

These steps are done once per Supabase project, in the dashboard and with
the Supabase CLI. Tables, policies, storage buckets and the service
catalogue all come from the migrations; everything else is set by hand
here.

Dashboard menu names change from time to time. If a label below doesn't
match exactly, look for the closest equivalent.

## 1. Create the project

1. Create a new project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. **Region: South Asia (Mumbai) — `ap-south-1`.** Propittu is India-first;
   this keeps auth and data close to users. Region cannot be changed later.
3. Save the database password somewhere safe. You'll need it for the CLI.

## 2. Get the API keys

**Project Settings → API Keys.** You need:

| Value | Goes into |
|---|---|
| Project URL (`https://<ref>.supabase.co`) | `SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_URL` |
| Publishable key (`sb_publishable_…`) | `SUPABASE_PUBLISHABLE_KEY` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |

You do **not** need the secret key (`sb_secret_…`) anywhere in Propittu.
Don't put it in any `.env` file.

> Older projects show "anon" and "service_role" keys instead. The anon key
> works in place of the publishable key.

## 3. Check JWT signing keys

**Project Settings → JWT Keys** (or "JWT Signing Keys").

The API verifies sign-in tokens locally against the project's published
signing keys, which is faster than asking Supabase on every request. That
needs **asymmetric** signing keys (ES256/RS256), which new projects use by
default.

If the project still uses the **legacy shared secret** (HS256), the API
still works, but it falls back to checking each token with Supabase over
the network. Migrating to asymmetric keys in this screen removes that
extra round trip.

## 4. Apply the migrations

From the repository root:

```bash
supabase login
supabase link --project-ref <your-project-ref>   # asks for the DB password
npm run db:push                                  # = supabase db push
```

This creates:

- tables `profiles`, `properties`, `property_photos`, `property_documents`,
  `services` and `service_requests`, plus the `property_summaries` view
- Row Level Security policies on every table
- **private** storage buckets `property-photos` (5 MB, JPG/PNG) and
  `property-documents` (10 MB, PDF/JPG/PNG), with owner-only object policies
- the 10-service catalogue

**Verify:** Table Editor shows the six tables, each marked *RLS enabled*;
Storage shows both buckets as *Private*; `services` has 10 rows.

## 5. Configure phone sign-in

**Authentication → Sign In / Providers.**

1. **Phone:** enable it.
2. **Email:** disable it. Propittu is phone-OTP only (PRODUCT_SPEC.md §8.1).
3. Make sure every social provider (Google, Apple, …) is disabled.
4. Leave **anonymous sign-ins** disabled.

### SMS provider

Supabase doesn't send SMS itself. The Phone provider needs an SMS provider
(Twilio, Twilio Verify, MessageBird, Vonage or Textlocal), and the
dashboard may refuse to enable Phone until one is configured.

**For development** you don't need working SMS. Use test numbers (next
section): Supabase answers them with their fixed code and **never
contacts the SMS provider**. The provider form still has to be filled in
before the dashboard lets you enable Phone, but only non-empty values are
required, not working ones:

| Field | Development value |
|---|---|
| SMS provider | Twilio |
| Account SID / Auth Token | from a free Twilio trial account |
| Message Service SID | placeholder `MG00000000000000000000000000000000` |

Twilio trial accounts can't create a Messaging Service without
upgrading, and you don't need to. With this setup the test numbers sign
in, and any other number gets "couldn't send the OTP". That's expected
until a real provider is configured in step 8.

**For production** in India, see [step 8](#8-production-sms-india).

### Phone settings

In the Phone provider settings:

| Setting | Value | Why |
|---|---|---|
| SMS OTP expiry | **600** seconds | Must match `OTP_EXPIRY_SECONDS` in `packages/shared/src/constants.ts`. The app uses it to tell "wrong code" apart from "expired code". |
| SMS OTP length | **6** (if shown) | The app's OTP screen has 6 boxes (§11). |
| SMS message template | `{{ .Code }} is your Propittu verification code. Do not share it with anyone.` | In India the production text must exactly match your DLT-approved template. |

### Test phone numbers

Still in the Phone provider settings, find **Test phone numbers and OTPs**
and add your numbers **with the `91` country code and no `+`** (the
examples below are placeholders):

```
919876543210=123456
919876543211=123456
```

In the app, enter `98765 43210` and then the OTP `123456`. No SMS is sent
and nothing is charged. Two numbers let you check that two users can't
see each other's data.

## 6. Rate limits

**Authentication → Rate Limits.**

Set **SMS messages sent per hour** to about **15**. Every real SMS costs
money, and this limit is the only thing stopping a bug or abuse from
turning into a bill.

## 7. Managing service requests

There is no admin app in V1 (§24). To change a request's status, go to
**SQL Editor** and run:

```sql
update public.service_requests
set status = 'in_review'      -- submitted | in_review | in_progress | completed | cancelled
where reference = 'PR-000123';
```

The SQL editor runs as the database owner, so it isn't restricted by RLS.
Users can't change status themselves; the database rejects it.

To see new requests along with the owner's phone number:

```sql
select r.reference, r.status, s.name as service, p.name as property,
       pr.phone, r.description, r.created_at
from public.service_requests r
join public.services s on s.id = r.service_id
left join public.properties p on p.id = r.property_id
join public.profiles pr on pr.id = r.user_id
order by r.created_at desc;
```

## 8. Production SMS (India)

Real OTP delivery to Indian numbers requires **TRAI DLT** registration:

- a registered **entity** (business documents such as GST and PAN)
- an approved **sender ID / header** (6 characters)
- an approved **content template** whose text matches the Supabase SMS
  template exactly

Registration takes days to weeks, and messages from unregistered senders
are filtered by Indian carriers, often silently. Choose an SMS provider
that supports Indian DLT, finish registration, then enter the provider
credentials in the Phone settings above. **No code changes are needed.**

Until DLT is complete, sign-in only works for the test numbers.
