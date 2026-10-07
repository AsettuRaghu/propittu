# Configurable services and Pittu questions — design

Status: **design for review, not built** (7 Oct 2026). Covers five owner notes as one design:
service request templates, customising the whole service module, default schedule intervals
and deviation, campaigns, and configurable Pittu questions.

---

## 1. The idea in one paragraph

Today every service behaves the same way, and Pittu's questions are written in code. A developer
and an app update are needed to change what "Pay property tax" asks for, what it records at the
end, or which question Pittu asks a Telangana plot owner. This design moves **what a service or a
question says and collects** into the database, editable from Backoffice, while **how the app
keeps everyone safe** — statuses, payments, plan coverage, where we serve, who can see what —
stays in code. Everything editable is **versioned**, so a change never rewrites a request already
booked or an answer already given.

---

## 2. What stays fixed, and what becomes configurable

| Stays in code (the engine) | Becomes configurable (per service / question) |
|---|---|
| The 7 request statuses and which moves are allowed (requested → confirmed → …) | The words customers see at each stage, and which stages a service uses |
| Payments, refunds policy, plan coverage, usage counting | Price, payment timing, cancel rule, expected days (already editable today) |
| Where we serve (PIN codes, states) and the check at booking | Reach type per service (already editable today) |
| Who can see what (RLS), audit trail | What the app asks the customer when booking (intake fields) |
| How Pittu reads a deed | What staff do (a checklist) and what they record at the end (outcome fields) |
| | How often a service repeats (schedule interval) |
| | Campaigns (offers, area drives) |
| | Pittu's questions, their conditions, replies and the care plan rules |

**Why this line:** anything involving money, permissions or legal state must behave the same
every time and be tested. Anything that is wording, a field, or a rule of thumb can be changed by
the team, safely, with a preview.

---

## 3. Service templates

A **template** describes one service. Each service has one published template (and maybe a draft
being edited). A request remembers the **template version** it was booked under.

### 3.1 What a template holds

| Part | What it is | Example — "Pay property tax" (Karnataka) |
|---|---|---|
| **Intake** | Fields the app asks when booking. Each: label, type (text, number, date, choice, yes/no, photo/file), required or not, help text, and an optional condition. Fields can be **pre-filled from the property** (e.g. Khata number). | Khata / PID number (pre-filled) · Tax year (choice: 2026–27, 2025–26) · Last year's receipt (file, optional) |
| **Stages** | Which engine statuses this service uses, and the customer-facing words for each. | Requested → "Accepted" → "Working on it: paying at BBMP" → "Paid — receipt ready" |
| **Milestones** (optional) | Smaller steps inside "working on it", ticked by staff and shown to the customer as progress. | Documents checked · Paid online · Receipt downloaded |
| **Staff checklist** | Instructions and checks for whoever does the work (staff-only). | "Confirm the PID matches the deed", "Pay via BBMP portal, not cash" |
| **Outcome fields** | What staff must record to finish — typed fields plus files. | Tax year · Amount paid (₹) · Receipt number · Receipt (file, saved to Documents as Property Tax) |
| **After completion** | What the outcome updates on the property. | "Tax paid for 2026–27" shown on the property page; next due date set to 1 Apr 2027 |
| **Commercials** | Price, payment timing, cancel rule, expected days, includes, turnaround (today's columns, moved into the template so they are versioned too). | On quote · paid on confirmation · cancel until confirmed · 7 days |

### 3.2 More examples

- **Site visit** (visit): intake = preferred day and slot (as today) + "Anything to check?" ·
  outcome fields = condition, photos, issues found, "Needs attention?" (yes/no) · after
  completion = last visited date; if a schedule exists, next visit due.
- **Khata transfer** (assistance): intake = current Khata holder, reason (sale / inheritance /
  gift) · milestones = application filed, ward inspection, approval · outcome fields = new Khata
  number, date issued, Khata copy (file) · after completion = Khata number updated on the
  property (shown under "Differs from your deed" if it differs from the deed).
- **Cleaning** (visit): intake = area to clean (choice), access instructions · outcome = before
  and after photos.

### 3.3 Where the data lives

- `service_templates` — service, version, status (draft / published / retired), the definition
  (validated against a shared schema), who published it and when.
- `service_requests.template_version` — the version a request was booked under; intake answers
  stored with the request.
- `service_outcome_values` — the typed outcome fields (so "tax year" is a real value, not text in
  a note), next to today's visit reports and outcome files.

**Day one:** every existing service gets a version-1 template generated from how it behaves
today. Nothing changes for customers until a new version is published.

---

## 4. Schedules — default interval and deviation

Some services are meant to repeat. A template can set a **default interval** and a **window**.

| Setting | Example |
|---|---|
| Default interval | Site visit every 90 days |
| Window | ±15 days counts as "on time" |
| Starts | from the last completed visit, or from a set date |

- A property gets a **schedule** when the customer turns it on (or their plan includes, say, four
  visits a year). The app shows **"Next visit due 12 Jan"** on the property page.
- **Deviation** is worked out from the dates: done on 3 Feb against a due date of 12 Jan →
  **"22 days late"**. Staff see late and upcoming visits as a list in Backoffice; customers see a
  gentle "Due this week" note.
- **Open choice (§9):** when a visit falls due, does the app **create the request automatically**
  (staff then schedule it), or only **remind** the customer to book it?

---

## 5. Campaigns

Two kinds, both run from Backoffice and both time-limited.

| Kind | Example | How it works |
|---|---|---|
| **Offer** | "Site visits 20% off this month" | Applies to chosen services, for chosen areas / states / plans, between two dates, optionally capped (first 50 bookings). The price is worked out at booking and **frozen on the request** with the campaign it came from. |
| **Area drive** | "Our agent is in Anekal on 15 Oct — book a visit for ₹499" | An area (PIN codes), a date, a set number of slots and a price. Customers with a property there see a banner on Home and Services and can book a slot until it's full. Staff get the day's route as a list. |

- Customers learn about campaigns **in the app** (banners, a tag on the service) from day one.
- **Push notifications are not built yet** (they need a proper app build). Until then, area
  drives reach only customers who open the app. SMS waits for DLT registration.
- Plan-included services stay free — campaigns only lower the price of extras.

---

## 6. Pittu's questions and care plan

The same building blocks, applied to Pittu.

| Part | What it is | Example |
|---|---|---|
| **Question** | Title (can include the owner's name or the Khata number), why we ask, options, Pittu's reply to each option, optional "What's a Khata?" explainer. | "Is the Khata (123/4) in your name yet?" · Yes / Not yet / Not sure |
| **Condition** | When it is asked: state, property type, earlier answers, what the deed says. | Only Karnataka · only if not "I'm the owner by name" |
| **When** | While Pittu reads (needs no deed) or after the reading. | "Last visit" and "tax paid" while reading (as built today) |
| **Care rule** | If these answers → suggest this service, with the reason shown. | Khata "Not yet" → suggest Khata transfer, "So it's in your name" |

- Answers already given keep their meaning: if an option is renamed, old answers still point to
  the same option (options have fixed ids; only labels change).
- Questions about money or legal standing are marked **sensitive**: publishing them needs a
  second person in Backoffice to approve.

---

## 7. One condition language for everything

Intake fields, Pittu questions and care rules all decide "does this apply?" the same way. In the
editor it's built with dropdowns, never typed as code:

> **State** is **Karnataka** · and · **Property type** is **Plot** · and · answer to
> **Who lives there?** is **Tenants**

Things a condition can use: the property (state, PIN code, type, area), what the deed says, the
customer's plan, earlier answers, and the service's fulfilment type. One shared function
evaluates them in the app, the server and the preview — so what the preview shows is exactly what
customers get.

---

## 8. The Backoffice editor

- **Services → [service] → Template**: edit intake fields, stages and their words, milestones,
  the staff checklist, outcome fields, schedule and commercials. Changes go into a **draft**.
- **Preview**: "Show me as a Karnataka plot owner on the Basic plan" — renders the booking screen,
  the request timeline and the staff screen exactly as they would be.
- **Publish**: creates the next version; new bookings use it, existing requests keep theirs. A
  short change note is required. Any version can be compared with the previous one.
- **Pittu → Questions** and **Pittu → Care plan**: the same pattern.
- **Campaigns**: create, schedule, pause, see bookings and slots used.

**Open choice (§9):** these editors are big forms. Backoffice today lives inside the phone app;
building them as a simple **web page for staff** would be much easier to use.

---

## 9. Decisions needed from you

1. **Web or in-app editor?** My recommendation: a small staff-only web page for the editors (same
   login, same permissions); everything else in Backoffice stays in the app.
2. **Schedules: auto-create or remind?** Recommendation: auto-create the request a week before the
   due date for plan-included visits (staff schedule it); only remind for paid extras.
3. **Who can publish?** Recommendation: Operations can draft; Super Admin publishes; sensitive
   Pittu questions need a second approver.
4. **Campaign stacking:** if two offers apply, take the best one, or never combine? Recommendation:
   best one only.
5. **Area drives:** fixed slots per day (e.g. 8), or unlimited until the date?
6. **Outcome on the property:** should outcome values (tax paid, new Khata number) update the
   property's details directly, or appear as suggestions the customer accepts? Recommendation:
   update directly — our team verified them — and show "Updated by Propittu".
7. **Milestones:** show them to customers, or keep them staff-only? Recommendation: show them —
   it makes requests feel alive.
8. **Notifications:** confirm they wait for the store build (part of go-live), with in-app banners
   until then.

---

## 10. Phases

Each phase ships on its own and is useful without the next.

| Phase | What ships | Rough size |
|---|---|---|
| **1. Templates underneath** | Template model and versions; version-1 templates for all services; requests remember their version; intake fields and outcome fields (e.g. tax year, receipt number) for the paperwork services; outcome values shown on the property. No editor yet — templates seeded by us. | Large |
| **2. Editor** | Backoffice editor with preview and publish (web or in-app per decision 1). | Large |
| **3. Schedules** | Default interval and window, schedules per property, "Next visit due", deviation, the staff list of late / upcoming visits. | Medium |
| **4. Pittu in the database** | Questions, conditions and care rules moved into the database with today's questions as version 1; their editor. | Medium |
| **5. Campaigns** | Offers first (price at booking, frozen on the request), then area drives with slots and in-app banners. Push notifications when the store build exists. | Medium |

Suggested order: 1 → 3 → 2 → 4 → 5. Schedules come before the editor because they're useful
with seeded templates, and they feed visits into the plan straight away.

---

## 11. Risks and how the design handles them

| Risk | Handling |
|---|---|
| An edit breaks requests in progress | Versions: requests keep the version they were booked with. |
| A wrong field or wording reaches customers | Draft → preview → publish, change note, compare versions, roll back to an earlier version. |
| Configuration touches money or permissions | It can't: statuses, payments, coverage and access stay in code and in the database rules. |
| Preview differs from reality | One shared condition function used by app, server and preview. |
| Too many options make the editor hard | Start with the field types and conditions listed here; add more only when a real service needs them. |
