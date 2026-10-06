# Pittu — guided property setup (design)

Status: **design, not built** (6 Oct 2026). Builds on
[AI_DOCUMENT_INTELLIGENCE.md](AI_DOCUMENT_INTELLIGENCE.md): the deed is read
first; Pittu then asks only what the deed can't tell us, explains local terms,
and ends with a care plan of Propittu services.

---

## 1. Decisions

| | |
|---|---|
| Assistant | **Pittu** |
| Tone | **Warm** — kind, calm, short. Never pushy, never jokey about money or legal matters. |
| Language | English now; Kannada and Telugu later. All copy lives in keyed strings from day one. |
| Review | Region-pack content and anything Pittu infers that needs judgement goes to the **Propittu admin** (Backoffice) for review. Services that need a lawyer are flagged and handled by that service's process. |
| Format | Guided cards with tap answers — **not** an open chatbot. Rules choose the questions; AI reads documents and (optionally) phrases explanations. |

---

## 2. Pittu's voice

- One idea per card. Questions under ~12 words; explanations under ~30.
- Plain words first, local term second: "your property's record with the city (**Khata**)".
- Always say *why* we ask: "So we know if it needs regular checks."
- Celebrate progress lightly: "Nice — that's the hard part done."
- Never claim a legal fact from memory; facts come from the region pack (sourced, dated, admin-approved).
- Never guilt or alarm: "Vacant plots can attract encroachment" — not "Your plot is at risk!".

Examples:

| Avoid | Pittu says |
|---|---|
| "Provide Khata status." | "Is the Khata in your name yet?" |
| "Book cleaning now!" | "Empty sites can get overgrown. Want us to keep it tidy?" |
| "Error: field missing" | "We couldn't spot the area in your deed. Do you know it?" |

---

## 3. Flow

```
Deed read ─► Pittu intro card ("We read your deed!" + 1-line summary)
          ─► 3–6 question cards (chosen by rules, skippable, resumable)
          ─► Property Card (summary, profile score)
          ─► Care plan (2–3 recommended services, each with a reason)
          ─► [Let Propittu look after it]  ·  [Maybe later]
```

- **Max 6 questions** in one sitting; the rest wait on the property page as
  "Pittu has 2 more questions".
- Each card: question · 2–4 tap answers · "Not sure" · "What's this?" · Skip.
- Answers are saved immediately (no "submit"); progress ring + score update.
- No deed? Pittu still runs, with more basic questions (type, city, state).

---

## 4. Question bank (v1)

Each question has: id, when it shows (rule), answers, what each answer sets,
and which care need it may raise.

| id | Question | Shows when | Answers → effect |
|---|---|---|---|
| `owner_relation` | "This deed is in **{buyers}**'s name. How are you related to it?" | buyer name ≠ account name (see AI doc §2.3) | Owner · Joint owner · Family member's · I manage it → `relationship` |
| `plot_built` | "Is it still a vacant plot, or have you built on it?" | kind = land | Vacant · Built a house · Under construction · Not sure → may change type to `independent_house`; vacant → `care.vacant` |
| `occupancy` | "Who uses it today?" | built / apartment | I live there · Rented out · Empty · Family uses it → `occupancy`; empty → `care.vacant`; rented → `care.tenant` |
| `last_visit` | "When did someone last see it in person?" | occupancy ≠ I live there | This year · 1–3 years ago · Longer / can't remember → >1 yr → `care.visit` |
| `khata_name` | "Is the Khata in your name yet?" | state = KA | Yes · Not yet · Not sure → not yet/not sure → `care.khata` |
| `khata_number` | "Do you have your flat's own Khata number?" | state = KA, kind = apartment, no flat Khata | Add it · Don't have one · Not sure → none → `care.khata` |
| `ptin` | "Do you know your property tax number (PTIN)?" | state = TG | Add it · Don't have one · Not sure → none → `care.tax` |
| `tax_payer` | "Who pays the property tax?" | always (once) | I do · Tenant / family · Not sure / not paid lately → not sure → `care.tax` |
| `tax_last_paid` | "When was the property tax last paid?" | tax_payer = I do | This year · Last year · Earlier / not sure → earlier → `care.tax` |
| `association` | "Is there an owners' association?" | kind = apartment | Yes · No · Not sure → (context only) |
| `photos` | "Want to add a few photos so you can see it from anywhere?" | photo_count = 0 | Add now · Later → opens picker |

Rule order: identity (`owner_relation`) → what it is (`plot_built`) → who uses
it → when last seen → records (Khata/PTIN) → tax → nice-to-have (photos).

---

## 5. Region packs

Local knowledge as **reviewed data**, not AI memory. One pack per state;
versioned; every factual statement has a source and date; nothing goes live
until the admin approves it.

```
region_pack
  state            KA | TG | …
  version, status  draft | approved | retired   (approved by admin)
  terms[]          key, label, plain explanation, source, reviewed_at
  field_labels     e.g. khata_number → "Khata number" (KA) / "PTIN" (TG)
  admin_levels     village → hobli → taluk → district (KA)
                   village → mandal → district (TG)
  questions[]      which question ids apply + state-specific wording
  insights[]       "Did you know?" lines, each sourced and dated
  services[]       care need → Propittu service code(s)
```

### Karnataka (draft — admin to verify every line)

| Term | Plain explanation (draft) |
|---|---|
| Khata | Your property's record with the city or local body — needed to pay tax, take a loan or sell. |
| e-Khata | The digital Khata record. *[verify current rules + source]* |
| Hobli | A group of villages within a taluk. |
| Taluk | A sub-division of a district (e.g. Anekal, Bengaluru North). |
| Sub-Registrar | The government office where your deed was registered. |
| Survey number | The government's number for a piece of land; layouts are built on one or more. |

Address levels: village → hobli → taluk → district (city shown as district
for Bengaluru Urban, e.g. "Bengaluru Urban", taluk "Anekal").

### Telangana (draft — admin to verify every line)

| Term | Plain explanation (draft) |
|---|---|
| PTIN | Property Tax Identification Number — your property's tax record with the municipal body (e.g. GHMC). |
| Mandal | A sub-division of a district (like a taluk). |
| GHMC | Greater Hyderabad Municipal Corporation — the city body for most of Hyderabad. |
| SRO | Sub-Registrar Office, where the deed was registered. |
| Survey number | As above. |

Address levels: village → mandal → district.

---

## 6. Care plan

Care needs raised by answers (and deed facts) map to services:

| Care need | Raised by | Propittu service | Reason Pittu gives |
|---|---|---|---|
| `care.vacant` | vacant plot / empty home | Site Inspection, Property Cleaning | "Empty properties can get overgrown or encroached. A regular check keeps it safe." |
| `care.visit` | not seen > 1 year | Property Visit | "It's been a while — we'll visit, take photos and tell you how it looks." |
| `care.khata` | Khata not in name / no flat Khata | Khata / Mutation Assistance | "A Khata in your name makes tax, loans and selling easier. We can help." |
| `care.tax` | tax payer unknown / not paid lately / no PTIN | Property Tax Assistance | "We can check what's due and pay it for you." |
| `care.tenant` | rented | Property Visit | "A periodic check is useful when it's rented." |

Rules:
- Show **at most 3**, most important first (identity/records → safety → upkeep).
- Each shows its reason; "Let Propittu look after it" opens a pre-filled
  request (or plan) using the existing service request flow.
- Services marked **requires legal review** (e.g. Khata/Mutation in disputed
  cases) say so up front: "Our team, with a lawyer where needed, will review this first."
- Dismissed recommendations stay dismissed (until something changes).

---

## 7. Admin review (Backoffice)

- **Region packs:** draft → admin edits/approves → live. Each change audited.
- **Flags from Pittu:** owner relation "I manage it" / name mismatch, possible
  type change (plot → house), conflicting deed vs entered details, low-confidence
  extracted values → a **Review** list in Backoffice. Customer flow is never
  blocked; admin can follow up.
- **Lawyer-required services:** flagged on the service; requests go through the
  existing staff flow with a "needs legal review" step.

---

## 8. Data (conceptual)

- `property_answers` — property, question id, answer, answered_at (+ audit).
- `property_care_needs` — property, need, raised_by, status (open / planned / dismissed / done).
- `region_packs` — as §5, with status and approved_by.
- Strings — keyed (`pittu.q.plot_built.title`, …) for later Kannada/Telugu.

---

## 9. Measures

- Setup completion rate; median time (target < 60 s); questions skipped.
- Care plan → request conversion; dismissals per recommendation.
- Admin flags per 100 setups.

---

## 10. Phases

1. Prototype (clickable web mock) → owner review of flow and wording.
2. Build with Phase 1 of document intelligence: intro card, question cards,
   Property Card, care plan → existing service requests. KA + TG packs (approved).
3. Admin review list, more questions, "Did you know?" insights, dismiss/remind.
4. Kannada and Telugu.
