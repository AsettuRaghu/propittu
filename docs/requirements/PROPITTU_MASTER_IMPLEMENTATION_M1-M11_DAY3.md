# PROPITTU — MASTER IMPLEMENTATION INSTRUCTION
## Complete M1–M11 for Day-3 Testing

You are now moving from product/architecture discussion into implementation.

The objective is to take the existing Propittu codebase and complete, harden, integrate and test Modules M1–M11 within the next 1 day, so that we can perform meaningful end-to-end product testing on Day 3.

DO NOT treat this as a greenfield rebuild.

First inspect the existing implementation and identify what is already working. Preserve working functionality wherever possible. Extend or refactor only where required to align the architecture below.

---

# 1. CURRENT ARCHITECTURE — DO NOT CHANGE

The approved architecture is:

Expo Mobile
    ↓
Vercel-hosted Express Propittu API
    ↓
Supabase
(PostgreSQL + Auth + Storage + RLS)

Keep the Propittu API on Vercel.

DO NOT reintroduce Render.

Do not modify unrelated Vercel projects.

The API is the business boundary. Mobile is a client. Future Backoffice uses the same business rules/API.

Supabase remains the system of record.

---

# 2. OFFICIAL PROPITTU VOCABULARY

Use one shared vocabulary across product, business, database/API naming, technical documentation and team communication.

Use:

- Account
- User
- Plan
- Benefits
- Feature Benefits
- Usage Limits
- Included Services
- Usage
- Extra Services
- Free Trial
- Payment
- Order
- Payment Status
- Plan Status
- Renewal
- Cancellation
- Refund
- Limited Access
- Backoffice

DO NOT introduce “Entitlement” as Propittu terminology.

“Subscription” may exist only as a technical/payment-provider concept if necessary. The customer-facing/business concept is Plan.

Preferred conceptual model:

Account → Plan → Benefits → Usage

If existing code already contains deeply integrated “entitlement” naming, do not perform a risky broad rename merely for terminology. Prefer safe compatibility/refactoring.

---

# 3. IMPLEMENTATION RULES

Work autonomously.

You may:

- create files
- edit files
- install dependencies
- run migrations
- create database schema
- create storage configuration
- create/update RLS policies
- run tests
- run typecheck
- run lint
- run builds
- fix errors
- refactor existing code when necessary
- improve security
- update documentation
- configure Vercel deployment files when required

Do NOT repeatedly ask for permission.

STOP and ask only when the action requires:

1. credentials/account authorization,
2. a payment/account action that only the owner can perform,
3. destructive irreversible data loss,
4. or a major architectural conflict that cannot safely be resolved.

Do not spend the day polishing low-value UI details.

Priority is a genuinely working, secure, testable V1.

---

# 4. M1 — ACCOUNT

Implement Account as the commercial/business owner of the Propittu experience.

V1:

- one User per Account
- account-centric architecture
- future-ready for multiple users/roles/permissions
- Plan belongs to Account, not directly to mobile number
- Trial eligibility belongs to Account
- Properties belong to Account
- Usage belongs to Account

Do not build multi-user collaboration in V1.

The database/API should not make future multi-user support impossible.

Authentication:

- Indian mobile number
- OTP
- Supabase Auth
- API validates authenticated user
- API resolves the User → Account relationship
- never trust client-supplied account_id

Create/complete the required profile/account relationship.

---

# 5. M2 — PROPERTY

Property is the central Propittu object.

Core relationship:

Account
  → Property
      → Profile
      → Location
      → Photos/Videos
      → Documents
      → Visits
      → Services
      → Maintenance
      → Reminders
      → Future Intelligence

V1 property fields:

- property name/nickname
- property type
- basic address
- city
- state
- PIN
- plot/land area where applicable
- basic property identifiers/details where relevant
- latitude
- longitude

Do NOT add unnecessary V1 fields such as:

- bedrooms
- bathrooms
- parking
- year built
- detailed physical characteristics

Support multiple properties architecturally.

Plan can restrict property count.

V1 assumes the customer owns the property, but do not hard-code the permanent relationship model so tightly that future owns/co-owns/manages relationships become impossible.

Property profile should support progressive completion, e.g.:

“62% complete”

and meaningful next actions.

Location should be first-class:

Address
→ approximate map location
→ user confirms/moves pin
→ save coordinates

Future AI-derived information must be distinguishable from user-confirmed information.

---

# 6. M3 — DOCUMENTS & MEDIA

## Documents

V1 document categories:

1. Sale Deed
2. Registration
3. Property Tax
4. Other

Do NOT add Utility as a V1 document category.

Documents belong to a Property.

Document metadata should support:

- type/category
- name
- upload date
- file type
- size
- optional description
- status

Storage:

Private Supabase Storage.

The API controls access.

Sale Deed is first-class because future AI extraction may use it.

Important future rule:

AI must never silently overwrite the original user-confirmed document/data.

Extracted information must be traceable to its source.

V1 does NOT require:

- OCR
- AI classification
- legal analysis
- summarization
- expiry detection

## Media

V1:

- property photos
- property videos
- property association
- basic metadata
- private storage

Future:

- visit albums
- timeline
- AI photo analysis
- condition tracking
- before/after

Security flow:

Mobile
→ Propittu API
→ authenticate
→ verify Account
→ verify Property ownership/access
→ verify Benefits
→ verify Usage
→ issue controlled/signed access
→ Supabase Storage

Service-request photos are NOT required in V1.

---

# 7. M4 — PROPERTY CARE & SERVICES

Keep these concepts separate:

1. Service Catalogue
2. Included Services
3. Service Request

## Service Catalogue

Configurable from Backoffice.

Examples:

- property visit
- inspection
- photography
- video documentation
- cleaning
- maintenance
- repair
- document assistance

## Included Services

A Plan Benefit can include a service allowance.

Example:

“2 property visits/year”

## Service Request

Flow:

Property
→ select service
→ show whether Included or Extra
→ show price if Extra
→ request
→ API checks Benefits
→ API checks Usage
→ create request

Usage is consumed when the service is accepted/confirmed, NOT merely when a request is opened.

Suggested statuses:

- Requested
- Confirmed
- Scheduled
- In Progress
- Completed
- Cancelled

## Property Visit

This is the flagship V1 service.

Support:

- visit date
- photos/videos
- observations
- basic report
- issues/recommendations
- future visit history/timeline

Do NOT build V1 marketplace/vendor complexity:

- vendor ratings
- vendor marketplace
- quote comparison
- complex field-service tracking
- vendor payment system

---

# 8. M5 — PLANS & BENEFITS

Architecture:

Account
→ Plan
→ Benefits
→ Usage

Do NOT hard-code:

if plan == premium

Use configuration/data-driven Benefits.

## Feature Benefits

Examples:

- property profile
- document upload
- video upload

## Usage Limits

Examples:

- maximum properties
- maximum documents per property
- maximum photos per property
- maximum videos per property
- storage

## Included Services

Examples:

- property visits/year

Plans must be configurable.

Backoffice should eventually control:

- Plan name
- description
- price
- billing period
- active/inactive
- version
- Feature Benefits
- Usage Limits
- Included Services

Do not finalize commercial pricing unless it already exists in the code/business configuration.

## Plan versioning

Support future versions conceptually:

Basic v1
Plus v1
Plus v2
etc.

Do not silently change existing customers' benefits when configuration changes.

New customers receive the current version. Existing customers retain their applicable version unless explicitly migrated.

## Downgrade rule

Never delete data.

If an account has 4 properties and the new Plan allows 1:

- retain all 4
- mark account as over-limit where necessary
- prevent new additions that exceed limits
- allow the customer to upgrade or resolve the over-limit state

---

# 9. M6 — FREE TRIAL, BENEFITS & USAGE RULES

## Free Trial

Trial starts for eligible new Accounts.

Make duration configurable.

Trial Benefits should be configurable.

Eligibility is Account-level.

When Trial expires:

DO NOT delete data.

The chosen V1 behavior is:

LIMITED ACCESS

## Limited Access

User can:

- log in
- see basic account information
- see Plan/Trial status
- see available Plans
- enter payment journey
- use support if available

User cannot:

- use normal property-management functionality
- add/edit properties
- upload documents
- upload media
- create service requests
- consume Included Services

Once an active Plan is restored, access returns according to that Plan's Benefits.

## Usage definitions

Property:
- successful creation counts
- delete frees capacity
- edit does not count

Document:
- successful upload counts
- delete frees capacity

Photo/video:
- successful upload counts
- storage should be tracked separately where applicable

Service:
- opening a request does NOT consume Included Service usage
- accepted/confirmed request consumes usage

Usage should be traceable to the underlying action/resource/service.

Do not rely only on opaque counters if a simple traceable usage record can be implemented.

The API is authoritative.

The mobile app must NEVER be the authority for Benefits or Usage Limits.

---

# 10. M7 — PAYMENTS & BILLING

Payment provider for V1:

STRIPE

Must support:

- UPI
- cards

But Propittu must NOT become Stripe-dependent.

Architecture:

Propittu Billing Service
→ Payment Provider Interface
→ Stripe Provider

Future providers must be replaceable/addable without rewriting the core billing domain.

Propittu owns:

- Account
- Plan
- Benefits
- Usage
- Orders
- Payment records
- Plan Status

Stripe owns payment execution/provider mechanics.

Payment records should support:

- account
- order
- amount
- currency
- status
- provider
- provider payment reference
- timestamps

Stripe IDs are provider references, NOT core Propittu business identities.

## Webhooks

Webhooks are authoritative.

Do not activate a Plan solely because the mobile app says payment succeeded.

Implement the payment abstraction and webhook foundation.

Do not create final Stripe Products/Prices until commercial Plans and pricing are finalized.

Do not make Stripe-specific tables the core domain model.

Prefer Propittu-owned:

- orders
- payments
- plan status

## Cancellation

Cancellation means:

- no future renewal
- current paid period continues
- when period ends → Plan expires
- account enters Limited Access unless another active Plan exists

## Refunds

Refunds are separate financial events.

Do not overwrite original payment history.

## Extra Services

Extra Services have their own:

- Order
- Payment
- Payment Status
- Fulfillment Status

---

# 11. M8 — NOTIFICATIONS

Notifications are IMPORTANT but intentionally deferred.

DO NOT implement notification infrastructure now unless required as a minimal extension point.

Future channels may include:

- push
- SMS
- email
- WhatsApp

Do not scatter notification logic throughout M1–M7.

Design so a centralized notification capability can be added later.

---

# 12. M9 — BACKOFFICE

Build a practical V1 Backoffice foundation.

This is NOT an enterprise CRM.

Backoffice should eventually allow authorized staff to manage:

## Accounts

- search
- status
- Plan
- Trial
- properties
- Usage
- payments
- service requests

## Plans

- name
- description
- price
- billing period
- active/inactive
- version
- Feature Benefits
- Usage Limits
- Included Services

## Trial

- duration
- Benefits
- eligibility

## Services

- name
- description
- active/inactive
- price
- Plan inclusion
- Extra Service availability

## Service Requests

- customer
- property
- service
- status
- scheduling
- completion/cancellation

## Payments

- customer
- Plan/Extra Service
- amount
- status
- date
- provider reference
- refund status

## Usage

Staff should be able to understand WHY a customer cannot perform an action.

Backoffice should use the same core business rules/API wherever practical.

Do not create a separate conflicting rules engine.

Future roles can include:

- Super Admin
- Operations
- Customer Support
- Finance
- Service Operations

V1 can keep roles simple, but do not hard-code the architecture so roles are impossible later.

---

# 13. M10 — SECURITY & ACCESS CONTROL

Security is a core deliverable.

Every customer-owned object must trace back to Account.

V1:

User → Account

Future:

Account → Users → Roles/Permissions

## API authorization

For every protected operation:

1. Is the user authenticated?
2. Which Account does the user belong to?
3. Does the target resource belong to that Account?
4. Is the relevant Benefit available?
5. Is sufficient Usage available?
6. Perform the action.

Never trust:

- account_id from mobile
- property_id from mobile
- document ownership claims
- media ownership claims
- service ownership claims
- payment ownership claims

Resolve ownership server-side.

## Supabase RLS

Use Supabase RLS as a second security layer.

Database migrations must be version-controlled.

Do not rely on undocumented manual production changes.

## Storage

Use private buckets.

Expected V1 buckets:

- property-photos
- property-documents

Suggested paths:

property-photos/<user_id>/<property_id>/<uuid>.jpg

property-documents/<user_id>/<property_id>/<uuid>.pdf

Use controlled/signed access.

## Backoffice security

Treat Backoffice as a separate security boundary.

Do not allow ordinary customers to access Backoffice functions.

## Secrets

Never put server secrets in:

- Git
- mobile public environment variables
- client-side code

Server-only secrets include:

- Supabase server credentials
- Stripe secret key
- Stripe webhook secret
- future AI keys
- future notification provider keys

## Security testing

Explicitly test attempts to access another Account's:

- property
- document
- photo
- video
- service request
- payment
- Plan information

Also test:

- forged account_id
- forged property_id
- forged document/media IDs
- webhook tampering
- unauthenticated API calls
- expired/invalid auth

---

# 14. M11 — DATA, STORAGE & TECHNICAL ARCHITECTURE

PostgreSQL is the system of record for:

- Accounts
- Users/profile
- Properties
- location
- document/media metadata
- Plans
- Benefits
- Usage
- Services
- Service Requests
- Payments
- Plan Status
- Audit events
- future AI-derived information

Supabase Storage stores actual files.

Property remains the central object.

Preserve information provenance for future use.

Useful source concepts include:

- User
- Sale Deed
- AI
- External Data
- System

Future AI-derived information must not silently overwrite user-confirmed values.

## Environments

Support:

- development
- production

Staging can come later.

Do not casually mix production data/credentials into development.

## Database

Use version-controlled migrations.

Avoid undocumented manual production schema changes.

## API

Keep one stateless Express API process.

Do NOT introduce microservices.

Do NOT introduce unnecessary API versioning.

## Observability

At minimum provide:

- structured logs
- useful error logging
- request IDs where practical
- health endpoint
- webhook logging
- important business event logging

## Future-ready provider abstraction

Use provider interfaces/adapter boundaries for:

- payments
- future AI
- future notifications

Do not over-engineer these abstractions.

---

# 15. M12 — EXPLICITLY DEFERRED

Do NOT implement M12 Property Intelligence & AI in this one-day sprint.

Specifically defer:

- Sale Deed AI extraction
- property profile auto-population from documents
- location intelligence
- property valuation
- local market rates
- tax integrations
- document intelligence
- RAG
- Propittu knowledge assistant
- AI property intelligence
- advanced external data integrations

The future product direction is:

DOCUMENTS
→ PROPERTY PROFILE
→ PROPERTY INTELLIGENCE
→ ACTIONS / SERVICES

But M12 starts only after M1–M11 are working and tested.

Design extension points where sensible, but do not build the AI system now.

---

# 16. ONE-DAY IMPLEMENTATION PRIORITY

## P0 — MUST WORK

These are required for Day-3 testing:

- OTP authentication
- User → Account
- Account security/isolation
- Property CRUD
- property ownership/access control
- property location
- photos
- documents
- private storage
- Plans
- Benefits
- Usage Limits
- Usage tracking
- Free Trial
- Trial expiry
- Limited Access
- Included Services
- Service Catalogue
- Service Requests
- basic Backoffice capability
- database migrations
- RLS
- API authorization
- existing Vercel deployment
- mobile/API integration
- typecheck
- lint
- tests
- production build

## P1 — IMPLEMENT IF TIME ALLOWS

- Stripe provider abstraction
- payment domain foundation
- Orders
- Payment records
- webhook foundation
- Plan/payment relationship
- audit-event foundation
- future multi-user extension points
- AI extension points

## P2 — DO NOT SPEND THE DAY BUILDING

- notifications
- AI
- RAG
- Property Intelligence
- valuation
- market data
- marketplace
- vendor ecosystem
- advanced analytics
- IoT
- CCTV
- complex field-service management
- social login
- unnecessary infrastructure

If a P2 item threatens completion of P0, stop work on P2.

---

# 17. IMPLEMENTATION METHOD

Before changing code:

1. Inspect repository structure.
2. Inspect mobile app.
3. Inspect API.
4. Inspect Supabase integration.
5. Inspect existing migrations.
6. Inspect existing storage configuration.
7. Inspect existing tests.
8. Inspect Vercel configuration.
9. Identify what is already implemented.
10. Produce a concise internal implementation map.

Then implement.

Do not rebuild working modules.

Do not create duplicate models for the same concept.

Prefer extending the existing codebase.

Keep naming consistent.

---

# 18. DATABASE REQUIREMENTS

At minimum, the architecture should support entities equivalent to:

- profiles/users
- accounts
- properties
- property_photos
- property_documents
- services
- service_requests
- plans
- plan_versions where needed
- benefits / feature benefits
- usage limits
- included services
- usage records
- orders
- payments
- plan status / account plan state
- audit events

Exact table design is up to the implementation, but the business model must remain clear.

Every customer-owned record must be traceable to Account.

Use foreign keys and constraints.

Use appropriate CHECK constraints.

Use timestamps.

Use indexes for common ownership/query paths.

Use RLS appropriately.

Create an auth.users → profile/account relationship trigger if required by the existing architecture.

Do not duplicate business logic unnecessarily between database, API and mobile.

---

# 19. DAY-3 END-TO-END TEST JOURNEY

The system should support this real journey:

1. New User
2. OTP Login
3. User → Account created/resolved
4. Free Trial starts
5. User sees Account/Plan/Trial status
6. User creates Property
7. User enters property details
8. User confirms/moves location pin
9. User uploads property photo
10. User uploads Sale Deed/document
11. User views Property
12. User sees profile completion/progress where implemented
13. User sees Plan Benefits
14. User sees Usage Limits/Usage
15. User selects a Service
16. User creates Service Request
17. Backoffice sees request
18. Backoffice updates request status
19. Customer sees updated request status
20. Trial expiry / Plan expiry behavior is tested
21. Account enters Limited Access
22. User can still log in and view Plan/payment journey
23. User chooses an available Plan
24. Payment foundation is exercised
25. Successful provider webhook updates payment/Plan status
26. Active Plan restores appropriate Benefits
27. Usage limits are enforced by API

---

# 20. SECURITY TEST JOURNEY

Explicitly attempt:

- User A accessing User B's property
- User A accessing User B's document
- User A accessing User B's photo
- User A accessing User B's video
- User A accessing User B's service request
- User A accessing User B's payment
- forged account_id
- forged property_id
- forged document ID
- forged media ID
- forged service request ID
- unauthenticated requests
- expired authentication
- invalid webhook signature
- client-side attempts to bypass Plan limits
- client-side attempts to bypass Usage limits
- expired Trial attempting normal operations

The server must reject unauthorized operations.

---

# 21. TESTING REQUIREMENTS

Do not stop after the code compiles.

Run:

- unit tests where appropriate
- API tests
- authorization/security tests
- database/RLS tests where practical
- service-request tests
- Plan/Benefits/Usage tests
- Trial/expiry tests
- payment/webhook tests where implemented
- mobile typecheck
- API typecheck
- lint
- production build

Fix failures.

Do not hide failing tests.

If a test is based on a wrong assumption, correct the test and explain why.

---

# 22. VERCEL REQUIREMENTS

The current Propittu API architecture uses Vercel.

Keep it there.

Do not introduce Render.

Do not change unrelated Vercel projects.

Keep the deployment simple and compatible with the existing Express API.

Verify:

- deployment works
- health endpoint works
- environment variables are correct
- Supabase connectivity works
- production API works
- mobile points to the correct API
- no secrets are exposed

---

# 23. UI REQUIREMENT

The mobile UI only needs to be good enough for meaningful Day-3 testing.

Prioritize:

- reliable navigation
- clear authentication
- clear property creation/editing
- clear property details
- photo/document upload
- Plan/Benefits/Usage visibility
- Trial/Plan status
- service request flow
- clear Limited Access state
- useful errors/loading states

Do not spend excessive time on visual polish.

Functional clarity > cosmetic polish.

---

# 24. DO NOT OVERBUILD

Do not introduce:

- microservices
- complex event buses
- unnecessary queues
- unnecessary caching
- advanced analytics
- elaborate RBAC
- generic configuration engines
- marketplace infrastructure
- AI infrastructure
- notification infrastructure
- complex subscription engines
- unnecessary abstractions

Build the smallest architecture that correctly supports the approved model and future extension.

---

# 25. DOCUMENTATION

Update concise project documentation where needed.

Document:

- architecture
- environment variables
- database migrations
- storage buckets
- local development
- deployment
- test commands
- Plan/Benefits/Usage model
- Limited Access behavior
- payment abstraction
- known deferred items

Do not create excessive documentation.

---

# 26. FINAL REPORT TO ME

When implementation is complete, give a concise final report containing:

## Existing and preserved
What was already working and retained.

## Implemented
What was added/changed for M1–M11.

## Database
Tables/entities, migrations and RLS completed.

## Storage
Buckets and access model.

## API
Important endpoints/business rules.

## Mobile
Important screens/flows.

## Backoffice
What V1 capability exists.

## Payments
What Stripe abstraction/foundation is implemented and what still requires credentials/commercial setup.

## Tests
Exact test/typecheck/lint/build results.

## Security
Isolation/security tests performed and results.

## Deployment
Vercel deployment status.

## Blockers
Only genuine blockers.

## Deferred
Explicitly list M12 and other intentionally deferred items.

## Day-3 Test Instructions
Give me the shortest possible sequence to run the real end-to-end test.

---

# 27. DEFINITION OF DONE

M1–M11 are NOT considered complete merely because files/tables exist.

They are complete when:

- the architecture is coherent
- the database works
- migrations are reproducible
- RLS works
- API authorization works
- Plan/Benefits/Usage rules work
- Trial/expiry works
- Limited Access works
- property management works
- documents/media work
- service requests work
- basic Backoffice workflow works
- payment foundation is coherent
- mobile can exercise the core flow
- security tests pass
- typecheck passes
- lint passes
- production build passes
- Vercel deployment works
- the full Day-3 journey is realistically testable

The goal is not “lots of code”.

The goal is:

A real, secure, coherent Propittu V1 that we can test end-to-end on Day 3.

Start by inspecting the existing codebase and then execute the work.
