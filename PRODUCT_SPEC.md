# Propittu — Product Specification

**Version:** 1.0  
**Status:** MVP Development Specification  
**Target Market:** India  
**Platform:** iOS + Android  
**Development Target:** 2–3 days  
**Product Name:** Propittu  
**Domain:** propittu.com

---

# 1. Product Overview

Propittu is a mobile-first property management and property-care application designed initially for individual property owners in India.

The core idea is simple:

> **Everything about your property, in one place.**

A property owner should be able to register their real-estate assets, maintain basic property information, store important documents and photos, and request property-related services.

Propittu is NOT initially intended to be a real-estate marketplace, property buying/selling platform, rental management platform, property valuation system, or government compliance platform.

The first version is deliberately small and is intended to validate whether property owners find value in having a centralized digital place to manage their properties.

---

# 2. Product Vision

The long-term vision is:

> **Propittu becomes the personal property manager for property owners.**

A property owner may eventually use Propittu to:

- Maintain property records
- Store property documents
- Monitor property taxes
- Track government requirements
- Monitor property condition
- Schedule site inspections
- Request cleaning and maintenance
- Receive property-related alerts
- Manage tenants/rentals
- Request property services
- Monitor properties remotely
- Receive periodic property health reports

However, only the foundational capabilities required for the MVP should be built now.

---

# 3. MVP Objective

The MVP must answer one fundamental question:

> **Will property owners use a simple digital application to register and manage their properties and express interest in property-related services?**

The MVP must allow a user to:

1. Sign in using only an Indian mobile number and OTP.
2. Add one or more properties.
3. View and edit their properties.
4. Upload property photos.
5. Upload and organize property documents.
6. Browse available property services.
7. Submit service requests.
8. View their service-request history.
9. Securely access their own data.

---

# 4. Target Audience

## Primary Audience

Individual property owners in India.

Examples:

- Owners of land/plots
- Apartment/flat owners
- Independent house owners
- Commercial property owners
- Industrial property owners
- Owners of multiple properties
- People who inherited property
- Owners who live away from their property
- Owners who live in a different city from their property

## High-Potential Future Segment

Remote/NRI property owners.

Example:

An owner lives in Bangalore or Dubai but owns land or an apartment in Hyderabad.

Propittu could eventually help them:

- Monitor the property
- Schedule inspections
- Receive photographs
- Track maintenance
- Track taxes
- Monitor compliance

This is a future opportunity and should not create additional MVP scope.

---

# 5. Initial Geographic Scope

The application is India-first.

V1 authentication should support:

- Indian mobile numbers
- Country code: +91

International phone numbers are out of scope for V1.

The application should use Indian terminology where relevant.

Examples:

- Survey Number
- Plot Number
- Khata / Property ID
- PIN Code
- Property Tax
- Mutation
- Registration

The application must not provide legal advice or make definitive legal/compliance claims in V1.

---

# 6. Product Positioning

Recommended positioning:

> **Propittu — Everything about your property, in one place.**

Alternative positioning:

> **Your personal property manager.**

The product should feel:

- Simple
- Trustworthy
- Modern
- Useful
- Professional
- Property-owner focused

Avoid making the product look like:

- A real-estate marketplace
- A broker application
- A complex enterprise property-management system

---

# 7. Product Principles

1. Keep the MVP extremely simple.
2. Mobile-first.
3. Minimize onboarding friction.
4. Authentication must be OTP-only.
5. Do not ask for unnecessary property information.
6. Allow progressive data collection.
7. A user must only see their own data.
8. Services should initially be request-oriented.
9. Do not build operational infrastructure before validating demand.
10. Prefer simple architecture over premature scalability.
11. Build a foundation that can evolve later.
12. Do not add features merely because they might be useful someday.

---

# 8. V1 Scope

The MVP consists of the following modules:

## 8.1 Authentication

- Mobile number login
- Indian +91 numbers
- OTP verification
- Session persistence
- Logout

No passwords.

No email login.

No Google login.

No Apple login.

No username/password.

No additional authentication methods.

---

## 8.2 Property Management

Users can:

- Add property
- View properties
- View property details
- Edit property
- Delete property
- Add property photos
- Manage multiple properties

---

## 8.3 Property Documents

Users can:

- Upload documents
- Categorize documents
- View documents
- Download/open documents
- Delete documents

Supported initial file types:

- PDF
- JPG
- JPEG
- PNG

---

## 8.4 Property Services

Users can:

- Browse service categories
- View service descriptions
- Select a property
- Submit a service request
- Add a description
- View submitted requests
- View request status

The actual operational fulfillment of these services is NOT part of V1.

---

## 8.5 Profile

Users can:

- View their mobile number
- View basic profile information
- Logout

---

# 9. Explicitly Out of Scope

Do NOT implement these features in V1:

- Property marketplace
- Property sale listings
- Property rental listings
- Property valuation
- Tenant management
- Rental collection
- Property tax API integrations
- Automatic property tax calculation
- Government API integrations
- Automatic Khata conversion
- Automatic mutation processing
- Legal advice
- Automated legal compliance determination
- Payment gateway
- Subscription billing
- Admin portal
- Field-agent portal
- Property-management web application
- AI property valuation
- AI document analysis
- AI compliance assistant
- CCTV integration
- IoT monitoring
- Advanced analytics
- Complex reporting
- International authentication
- Multi-language support
- Social login

These may appear in the future roadmap but must not be implemented as part of the MVP.

---

# 10. Authentication

Authentication is exclusively phone OTP.

## User Flow

```text
Open App
    ↓
Enter Indian Mobile Number
    ↓
Send OTP
    ↓
Receive SMS
    ↓
Enter OTP
    ↓
Supabase Auth verifies OTP
    ↓
Authenticated Session
    ↓
Home
```

---

# 11. OTP Verification Screen

Display:

```text
Verify your mobile number

OTP sent to +91 XXXXX XXXXX

[ _ _ _ _ _ _ ]

Didn't receive it?
Resend OTP

[ Verify ]
```

Requirements:

- 6-digit OTP
- Clear validation errors
- Loading state
- Resend functionality
- Resend cooldown
- Invalid OTP handling
- Expired OTP handling

---

# 12. Supabase Authentication

Supabase Auth will be the authentication authority.

Use Supabase phone authentication.

Do NOT implement:

- Custom OTP generation
- Custom OTP storage
- Custom password authentication
- Custom session management
- Custom JWT issuance

The Supabase session/token should be used to authenticate requests to our API.

Architecture:

```text
Expo Mobile App
       |
       | Phone OTP
       ↓
Supabase Auth
       |
       | Session/JWT
       ↓
Propittu API
       |
       ↓
Supabase PostgreSQL
```

---

# 13. India-Specific Authentication Requirements

V1 supports Indian mobile numbers only.

Example:

```text
+91 9876543210
```

The UI should display the +91 prefix separately from the local number where practical.

The application should validate reasonable Indian mobile-number formatting before requesting OTP.

SMS delivery configuration must be verified before production launch.

India-specific SMS requirements, sender configuration, template/DLT requirements, provider limits and costs must be validated during setup.

Do not assume SMS delivery is completely free.

---

# 14. Main User Journey

## First-Time User

```text
Open App
    ↓
Login
    ↓
Mobile Number
    ↓
OTP
    ↓
Home
    ↓
No Properties
    ↓
"Add your first property"
    ↓
Add Property
    ↓
Save
    ↓
Property Details
```

## Returning User

```text
Open App
    ↓
Restore Session
    ↓
Home
    ↓
View Properties
```

---

# 15. Home Screen

The home screen should be simple.

Example:

```text
Good morning

Your Properties                  +

3 Properties

┌─────────────────────────────┐
│ My Hyderabad Plot           │
│ Land • Hyderabad            │
│                             │
│ Documents       4           │
│ Service Requests 1          │
└─────────────────────────────┘

┌─────────────────────────────┐
│ My Commercial Building      │
│ Commercial • Hyderabad      │
│                             │
│ Documents       7           │
│ Service Requests 0          │
└─────────────────────────────┘
```

If the user has no properties:

```text
You don't have any properties yet.

Add your first property and
start keeping everything organized.

[ + Add Property ]
```

---

# 16. Add Property Flow

The Add Property experience should be short.

## Step 1 — Property Type

Options:

- Land / Plot
- Apartment / Flat
- Independent House
- Commercial
- Industrial
- Other

---

## Step 2 — Basic Information

Fields:

- Property Name
- Address
- City
- State
- PIN Code
- Area
- Area Unit
- Notes

Only essential information should be mandatory.

---

## Step 3 — Property Identification

Optional fields:

- Survey Number
- Plot Number / Property Number
- Khata / Property ID

Do not force users to provide these.

Different property types have different identifiers.

---

## Step 4 — Photos

Allow users to upload property photos.

Initial target:

- Up to 5 photos during property creation

Users can add additional photos later if required.

---

## Step 5 — Save

After saving:

```text
Property Added

Your property has been successfully added.

[ View Property ]
```

---

# 17. Property Data Model

Initial property model:

```text
properties

id
user_id
property_type
name
address_line
city
state
pincode
latitude
longitude
area_value
area_unit
survey_number
property_number
notes
created_at
updated_at
```

All fields except the appropriate core fields should be nullable where reasonable.

---

# 18. Property Details Screen

Example:

```text
My Hyderabad Plot

Hyderabad, Telangana

────────────────────

PROPERTY
Land / Plot

AREA
2,400 sq.ft

PROPERTY ID
XXXXXX

────────────────────

PHOTOS
[ Photo Gallery ]

────────────────────

DOCUMENTS
4 Documents

[ View Documents ]

────────────────────

SERVICES
2 Requests

[ View Services ]

────────────────────

[ Edit Property ]
```

The screen should not be overloaded.

---

# 19. Property Photos

Create a separate table:

```text
property_photos

id
property_id
storage_path
caption
created_at
```

Photos should be stored in Supabase Storage.

The database stores metadata and storage paths, not binary image data.

---

# 20. Documents

Create:

```text
property_documents

id
property_id
document_type
file_name
storage_path
mime_type
file_size
created_at
```

Initial document types:

- Sale Deed
- Registration Document
- Property Tax Receipt
- Khata Certificate
- Encumbrance Certificate
- Building Approval
- Electricity Document
- Rental Agreement
- Other

The list should remain extensible.

---

# 21. Document Upload

User flow:

```text
Property
   ↓
Documents
   ↓
Add Document
   ↓
Select Document Type
   ↓
Choose File
   ↓
Upload
   ↓
Document Saved
```

Show:

- Upload progress
- Success state
- Error state

Do not allow unsupported file types.

Reasonable file-size limits should be applied.

---

# 22. Property Services

The service catalogue should initially contain:

## Property & Government

- Property Tax Assistance
- Document Verification Assistance
- Khata / Mutation Assistance
- Government / Compliance Alert Assistance

## Property Care

- Site Inspection
- Property Photography
- Property Cleaning
- Maintenance
- Security / Site Check

## Other

- Other

These are service request categories only.

V1 does NOT promise automated government access or guaranteed legal outcomes.

---

# 23. Service Request

Example:

```text
Request a Service

Property
[ My Hyderabad Plot ]

Service
[ Site Inspection ]

What do you need?

[ Description ]

Optional Photos

[ Add Photos ]

[ Submit Request ]
```

After submission:

```text
Service request submitted.

Request ID: PR-000123

Status: Submitted
```

---

# 24. Service Request Data Model

```text
service_requests

id
user_id
property_id
service_type
description
status
created_at
updated_at
```

Initial statuses:

```text
Submitted
In Review
In Progress
Completed
Cancelled
```

For MVP, status can initially be managed through the database/backend.

An admin/operations system is NOT required yet.

---

# 25. Profile

Profile screen should be simple.

Display:

```text
Profile

Mobile Number
+91 XXXXX XXXXX

Properties
3

Service Requests
2

[ Logout ]
```

Name can be optional.

---

# 26. Technical Architecture

The initial architecture is:

```text
                    ┌─────────────────────┐
                    │      iOS / Android  │
                    │                     │
                    │ Expo + React Native │
                    │     TypeScript      │
                    └──────────┬──────────┘
                               │
                               │ HTTPS / JSON
                               ↓
                    ┌─────────────────────┐
                    │    Propittu API     │
                    │                     │
                    │ Node.js + TypeScript│
                    │                     │
                    │ Business Logic      │
                    │ Validation          │
                    │ Authorization       │
                    └──────────┬──────────┘
                               │
                ┌──────────────┼──────────────┐
                ↓              ↓              ↓
         Supabase Auth   PostgreSQL       Storage
                          Supabase         Supabase
```

---

# 27. Technology Stack

## Mobile

```text
Expo
React Native
TypeScript
```

## API

```text
Node.js
TypeScript
Express OR Fastify
```

Choose the simpler option for the 3-day development window.

Do not use NestJS unless there is a compelling reason.

## Backend Infrastructure

```text
Supabase
```

Use:

- Supabase Auth
- Supabase PostgreSQL
- Supabase Storage
- Supabase RLS

## Source Control

```text
GitHub
```

## Mobile Build

```text
Expo EAS
```

---

# 28. Architecture Philosophy

The product is intentionally small.

Do NOT introduce:

- Neon
- Redis
- Cloudflare R2
- Kafka
- RabbitMQ
- Kubernetes
- Microservices
- Multiple backend services
- Separate authentication service
- Separate file-storage service

The goal is:

> Simple enough to build in three days, structured enough to evolve later.

---

# 29. Why an API Exists Between Expo and Supabase

The mobile application should not directly contain business logic for database operations.

Preferred flow:

```text
Expo
  ↓
Propittu API
  ↓
Supabase
```

The API handles:

- Authentication verification
- Authorization
- Business rules
- Validation
- Property operations
- Service requests
- Future integrations

This gives us a clean business layer for future web/admin/field applications.

---

# 30. API Design

Initial endpoints:

## Health

```text
GET /health
```

## User

```text
GET /me
```

## Properties

```text
GET    /properties
POST   /properties
GET    /properties/:id
PATCH  /properties/:id
DELETE /properties/:id
```

## Documents

```text
GET    /properties/:id/documents
POST   /properties/:id/documents
DELETE /documents/:id
```

## Services

```text
GET /services
POST /service-requests
GET /service-requests
GET /service-requests/:id
```

The exact API implementation may evolve slightly as development proceeds, but the API should remain small.

---

# 31. Authentication Between Mobile and API

The mobile app authenticates with Supabase Auth.

After authentication, the app receives the Supabase access token.

API requests should include:

```text
Authorization: Bearer <supabase-access-token>
```

The API validates the authenticated user.

The API must derive the user identity from the verified token.

Never trust:

```text
user_id
```

sent by the client as the authoritative identity.

---

# 32. Supabase Database

Initial tables:

```text
users/profile
properties
property_photos
property_documents
service_requests
```

Supabase Auth's user identity should be the authoritative authentication identity.

Do not create a second password/authentication system.

A profile table may be used for application-specific user information.

---

# 33. Database Relationships

```text
User
 │
 ├──── Property
 │        │
 │        ├──── Property Photos
 │        │
 │        └──── Property Documents
 │
 └──── Service Requests
          │
          └──── Property
```

Every property belongs to exactly one user.

Every document/photo belongs to a property.

Every service request belongs to a user and property.

---

# 34. Security Requirements

Security is important even in the MVP.

## Authentication

Only authenticated users may access protected resources.

## Authorization

A user must only access their own:

- Properties
- Property photos
- Property documents
- Service requests

## Never trust client user IDs

The API should derive the authenticated user from the Supabase token.

## Secrets

Never expose:

```text
SUPABASE_SERVICE_ROLE_KEY
```

to the mobile application.

Server-only secrets belong only in the API environment.

---

# 35. Row Level Security

Supabase RLS should be enabled appropriately.

Example principle:

```text
User A
  ↓
can access
  ↓
User A's properties

User B
  ↓
cannot access
  ↓
User A's properties
```

RLS should provide defense-in-depth even though our API performs authorization.

---

# 36. Environment Variables

Mobile environment variables may include:

```text
EXPO_PUBLIC_API_URL
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
```

API environment variables may include:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
PORT
```

Exact names may be adjusted during implementation.

Never commit `.env` files containing secrets.

Commit an example:

```text
.env.example
```

with placeholder values.

---

# 37. Storage

Use Supabase Storage.

Initial buckets:

```text
property-photos
property-documents
```

Storage paths should be organized so that ownership can be validated.

Example:

```text
property-photos/
  <user-id>/
    <property-id>/
      image-001.jpg
```

and:

```text
property-documents/
  <user-id>/
    <property-id>/
      sale-deed.pdf
```

Do not allow arbitrary storage paths supplied by clients.

---

# 38. UI/UX Principles

The application should feel:

- Modern
- Clean
- Trustworthy
- Simple
- Professional

Avoid unnecessary animations and complex interactions.

Use:

- Clear typography
- Consistent spacing
- Clear primary actions
- Cards where appropriate
- Simple icons
- Clear status indicators
- Good empty states
- Good loading states
- Good error messages

Do not spend excessive time on visual perfection during the MVP.

Functionality and usability are more important.

---

# 39. Navigation

Recommended initial structure:

```text
Authentication Stack
├── Splash
├── Login
└── OTP Verification

Authenticated Stack
├── Home
├── Property Details
├── Add Property
├── Edit Property
├── Documents
├── Add Document
├── Services
├── Service Request
├── Service Requests
└── Profile
```

A bottom-tab navigation can be used if it improves usability.

Suggested tabs:

```text
Home
Properties
Services
Profile
```

However, avoid overcomplicating navigation.

---

# 40. Error States

The application must gracefully handle:

## Authentication

- Invalid phone number
- Incorrect OTP
- Expired OTP
- OTP resend unavailable
- Network failure
- Session expired

## Properties

- Failed to load
- Failed to create
- Failed to update
- Failed to delete

## Photos

- Permission denied
- Unsupported file
- Upload failure

## Documents

- Unsupported file
- Upload failure
- Download/view failure

## Services

- Failed request submission
- Network failure

Every asynchronous operation should have:

- Loading state
- Success state
- Error state

Prevent duplicate submissions.

---

# 41. Testing Requirements

Test on physical devices where possible.

## Authentication

Test:

- Valid Indian number
- Invalid number
- Correct OTP
- Wrong OTP
- Expired OTP
- Resend OTP
- Logout
- Login again
- Session restoration

## Properties

Test:

- Add
- View
- Edit
- Delete
- Multiple properties
- Optional fields
- Property photos

## Documents

Test:

- Upload PDF
- Upload image
- View
- Delete
- Invalid file
- Large file

## Services

Test:

- Browse services
- Submit request
- View request
- Status

## Security

Critical test:

> User A must never be able to access User B's data.

Test this at API and database/RLS levels.

---

# 42. Three-Day Development Plan

## Day 1 — Foundation + Vertical Slice

### Product

Finalize:

- Product specification
- Architecture
- Database model
- Supabase setup

### Development

Build:

```text
Expo
 ↓
Login
 ↓
OTP
 ↓
Home
 ↓
Add Property
 ↓
API
 ↓
Supabase
 ↓
Property Details
```

By the end of Day 1, a real user should be able to:

1. Install/run the app.
2. Enter an Indian mobile number.
3. Receive OTP.
4. Authenticate.
5. Add a property.
6. Save it to Supabase.
7. View it again.

---

# 43. Day 2 — Core MVP

Implement:

- Property list
- Property details
- Edit property
- Delete property
- Property photos
- Documents
- Services
- Service requests
- Profile
- Logout

Add proper:

- Loading states
- Empty states
- Error handling

---

# 44. Day 3 — Testing + Release

Stop adding features.

Focus on:

- Functional testing
- Security testing
- RLS testing
- Android testing
- iOS testing
- UI polish
- Error handling
- Production environment configuration
- Production build

Use:

```text
Expo EAS
```

for production builds.

Target:

- Android production build
- iOS/TestFlight build

App Store and Play Store review timelines are external dependencies and cannot be guaranteed within three days.

---

# 45. Definition of Done

The MVP is considered complete when:

- User can authenticate using Indian mobile OTP.
- User can maintain multiple properties.
- User can view/edit/delete properties.
- User can upload property photos.
- User can upload/manage documents.
- User can browse services.
- User can submit service requests.
- User can view service-request history.
- Data persists correctly.
- Users cannot access other users' data.
- App works on Android.
- App works on iOS.
- Production builds can be generated.
- No critical security issue is known.

---

# 46. Future Roadmap

These are future opportunities, NOT MVP requirements.

## Property Monitoring

- Scheduled site inspection
- Site photographs
- Video walkthrough
- GPS verification
- Property condition reports
- Boundary inspection
- Security checks
- Meter readings

## Government / Compliance

- Property tax reminders
- Property tax assistance
- Khata monitoring
- Mutation assistance
- Land-use conversion assistance
- Government alerts
- Compliance reminders

## Property Care

- Cleaning
- Maintenance
- Security
- Landscaping
- Repairs
- Emergency site visits

## Advanced Features

- Property Health Score
- AI document extraction
- AI property assistant
- Property valuation
- Rental management
- Tenant management
- Payment collection
- Subscription plans
- Admin portal
- Field-agent application
- Web application

---

# 47. Product Evolution

The long-term product can evolve through three stages.

## Stage 1 — Property Vault

> Know what you own.

Properties + documents + photos.

## Stage 2 — Property Manager

> Know what needs attention.

Taxes + reminders + inspections + maintenance + compliance.

## Stage 3 — Property Care Platform

> We take care of it for you.

Inspections + cleaning + maintenance + tax assistance + compliance assistance + property services.

---

# 48. Claude Code Development Rules

Claude Code must treat this document as the primary product specification.

## Rule 1 — Do not expand scope

Do not implement future roadmap features unless explicitly instructed.

## Rule 2 — Keep architecture simple

Do not introduce infrastructure that is not required.

## Rule 3 — Do not expose secrets

Never place privileged Supabase credentials in Expo.

## Rule 4 — Security first

Always enforce authenticated ownership.

## Rule 5 — TypeScript

Use TypeScript throughout.

## Rule 6 — Test after implementation

After each meaningful milestone:

- Run type checking.
- Run linting.
- Run tests if configured.
- Fix errors.
- Report what was tested.

## Rule 7 — Database changes

Before making major schema changes:

- Explain the change.
- Explain the reason.
- Explain migration impact.

## Rule 8 — Keep documentation current

Update:

- README
- environment variable documentation
- setup instructions

when appropriate.

## Rule 9 — Do not pretend something works

If something has not been tested, explicitly say so.

## Rule 10 — Three-day constraint

When choosing between two technically valid approaches:

> Prefer the simpler approach that can be implemented and tested quickly.

---

# 49. Claude Code Initial Instruction

After Claude Code is started, the first instruction should be:

```text
Read PRODUCT_SPEC.md completely before making any code changes.

This document is the source of truth for the Propittu MVP.

Do not start implementing yet.

First inspect the repository and give me:

1. Proposed project structure
2. Exact technologies you intend to use
3. Expo/React Native architecture
4. API architecture
5. Supabase components required
6. Database schema
7. Authentication approach
8. Storage approach
9. Environment variables required
10. Manual Supabase configuration required
11. Development dependencies required
12. Risks or ambiguities you identify
13. Day-1 implementation plan

Important constraints:

- This is a 2–3 day MVP.
- India-first.
- Indian +91 phone numbers only.
- Authentication is OTP-only.
- Expo + React Native + TypeScript.
- Node.js + TypeScript API.
- Supabase Auth.
- Supabase PostgreSQL.
- Supabase Storage.
- API sits between mobile and Supabase.
- No Neon.
- No Redis.
- No Cloudflare R2.
- No web application.
- No admin portal.
- No payments.
- No AI.
- No government integrations.
- No unnecessary infrastructure.

Do not make code changes yet.

After reviewing the specification, stop and wait for approval.
```

---

# 50. Initial Repository Structure

The preferred structure is:

```text
propittu/
│
├── PRODUCT_SPEC.md
│
├── apps/
│   ├── mobile/
│   └── api/
│
├── packages/
│   └── shared/
│
├── docs/
│
├── .gitignore
├── .env.example
├── README.md
└── package.json
```

However:

> If setting up a monorepo threatens the 3-day development target, simplify it.

The application must be built before the tooling is perfected.

---

# 51. First Development Milestone

The first implementation milestone is:

```text
User
 ↓
Propittu Mobile App
 ↓
Enter +91 Number
 ↓
OTP
 ↓
Supabase Auth
 ↓
Authenticated Home
 ↓
Add Property
 ↓
Propittu API
 ↓
Supabase PostgreSQL
 ↓
Property Details
```

This is the first end-to-end vertical slice.

It must use real authentication and a real database.

Do not use mock authentication or fake property data unless explicitly needed for UI development.

---

# 52. Final Product Principle

The most important principle for this MVP:

> **Do less, but make what we build actually work.**

The goal is not to build the complete future Propittu platform in three days.

The goal is to create a small, usable, secure foundation that can be put into the hands of real property owners and used to validate the idea.

```text
Propittu V1

Login
  ↓
Add Property
  ↓
Manage Property
  ↓
Store Documents
  ↓
Request Services
```

Everything else comes later.
