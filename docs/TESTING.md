# Testing

## Automated

```bash
npm test             # both suites below
npm run typecheck    # all workspaces
npm run lint         # all workspaces
```

### `npm run test:rls`: database security (51 checks)

Applies **every migration** to a throwaway local Postgres, with a small
stand-in for Supabase's `auth` and `storage` schemas, then runs the
checks as the real `authenticated` and `anon` roles. It covers:

- **User B can't read** any of user A's properties, photos, documents,
  service requests, storage objects or summary rows, including fetching
  one by its id.
- **User B can't modify** A's data: updates and deletes affect 0 rows, and
  inserts stamped with A's `user_id`, attached to A's property, or written
  into A's storage folder are rejected.
- **Users can't escalate on their own rows:** they can't change a request's
  status, delete request history, change their phone number, point a file
  at a different storage path, or give a property away to another user.
- **Integrity checks:** PIN code format, area without a unit, unknown types,
  disallowed file types, and the 10 MB document limit.
- **Anonymous access** to any table is denied.
- **Deleting a property** removes its photos and documents and keeps its
  service-request history.

Needs Postgres 15+ server binaries (`brew install postgresql@15`); no
Docker and no Supabase project.

### `npm run test:api`: API security (27 checks)

Starts the real API against a fake Supabase that publishes signing keys and
records every database request. It covers:

- **Rejected tokens:** missing, malformed, signed with the wrong key,
  expired, wrong issuer, wrong audience, or the `anon` role.
- **Every database call carries the user's own JWT**, which is what makes
  RLS apply on the API path.
- A client-supplied `user_id` is ignored, and the identity comes from the
  token (§31).
- Request validation, unsupported file types, and the 10 MB size limit.

## Not yet tested

These need a real Supabase project and a phone, and **have not been run
yet**:

- Real OTP sign-in against Supabase Auth, including test numbers
- Uploading and downloading files to and from real Supabase Storage
- The app on a physical Android or iOS device

The app has been typechecked, linted and **bundled for iOS and Android**
(Hermes), and `expo-doctor` passes, but no screen has run on a device yet.

## Manual device checklist (§41)

Run on a physical Android phone and an iPhone. Use two test numbers
(`98765 43210` and `98765 43211`, OTP `123456`).

### Authentication

- [ ] Valid number → OTP screen shows "+91 98765 43210"
- [ ] Fewer than 10 digits → Send OTP stays disabled
- [ ] 10 digits starting with 0–5 (e.g. `5876543210`) → "Enter a valid Indian mobile number", no OTP sent
- [ ] Paste `+91 98765 43210` → field shows `9876543210`
- [ ] Correct OTP → Home
- [ ] Wrong OTP → "That code is incorrect"
- [ ] OTP entered after expiry → "This code has expired"
- [ ] Resend is disabled for 30 s, then works
- [ ] Airplane mode → "No internet connection"
- [ ] Logout → Login screen
- [ ] Log in again → same data
- [ ] Kill and reopen the app → still signed in (session restored)

### Properties

- [ ] New account → "You don't have any properties yet." with an Add button
- [ ] Add with only type and name → saved
- [ ] Add with every field, plus 3 photos → saved, upload progress shown
- [ ] PIN `012345` → error; area entered without a unit → error
- [ ] Home card shows type • city and document/request counts
- [ ] Details show only the fields that were filled in
- [ ] Edit: clear an optional field → it disappears from details
- [ ] Delete → confirmation mentions photos/documents; property removed
- [ ] Multiple properties all listed

### Photos

- [ ] Add from library and from camera
- [ ] Deny camera permission → "Camera access is off" with an Open Settings option
- [ ] Tap photo → full screen; delete works

### Documents

- [ ] Upload a PDF → progress → "Document saved"
- [ ] Upload a JPG/PNG
- [ ] Unsupported files (e.g. .docx) are greyed out in the picker, or rejected before upload if the phone lets you pick one
- [ ] Pick a file over 10 MB → rejected with its size shown
- [ ] Open a PDF (iOS: opens in-app; Android: opens the share sheet) and an image (in-app viewer)
- [ ] Delete a document

### Services

- [ ] Browse: 3 groups, 10 services, disclaimer at the bottom
- [ ] Request: choose property and service, add a description → "Service request submitted." with `PR-000123`
- [ ] My requests lists it with status "Submitted"
- [ ] Change its status in the SQL editor → pull to refresh shows the new status
- [ ] Property details → View Services lists only that property's requests

### Security (§41: critical)

- [ ] Signed in as user B, user A's properties are not visible anywhere
- [ ] Profile shows the correct number and counts for each user
