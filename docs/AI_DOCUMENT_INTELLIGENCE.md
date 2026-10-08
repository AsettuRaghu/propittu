# Propittu — Document Intelligence (AI) design

Status: **agreed design, not built yet** (6 Oct 2026).
Source brief: `PROPITTU_Property_Intelligence_AI_Development_Brief_Updated.md` (owner).
This document records what we decided, so building can start from it.

---

## 1. Scope

**In:** reading three document types with AI, turning them into property
details the customer reviews and confirms, and spotting where a deed and the
customer's entries disagree.

**Out (for now):** encryption vault, restricting staff document access (only
the owner has Backoffice access today), RAG, agents, government/civic
information, chat. AI never decides plans, usage, payments or permissions.

### Documents that are read

| Type | Read? | What we take |
|---|---|---|
| Sale Deed | Yes — full | Property kind, address/location, identifiers, area, registration, parties (names only), schedule/boundaries |
| Registration | Yes | Registration number, date, Sub-Registrar office, parties (names only) |
| Property Tax | Yes | Tax / property ID (PID), assessment year, amount paid, payment date |
| Other | **No** | Stored only |

---

## 2. Customer flows

### 2.1 Add property — two paths

```
Add property
 ├─ ★ Upload your Sale Deed  (recommended)
 │    "Upload your sale deed — we read it securely and set up your property for you."
 │    → pick PDF (no camera capture for deeds)
 │    → draft property created, "Reading your deed…" (customer may leave)
 │    → "We found these details" (pre-filled form, low-confidence values highlighted)
 │    → customer corrects / confirms → property becomes active
 └─ Enter details myself  (today's form)
```

- A **draft property** exists while reading so the deed has a home in storage
  and the customer can come back. Drafts are hidden from Home except as a
  "Finish setting up — we've read your deed" card; they don't count toward
  limits until confirmed; abandoned drafts are removed after 30 days.
- If reading fails or the file isn't a sale deed: "We couldn't read this one"
  → continue with the form (nothing lost; the file stays as a document).

### 2.2 Deed uploaded later — cross-check

When a Sale Deed is added to a property that already has details, only the
**differences** are shown, one card each, e.g.

- City — *You entered* Hyderabad · *Deed says* Anekal, Bengaluru → [Use deed] [Keep mine]
- Area — 1,200 sq ft vs 1,850 sq ft → [Use deed] [Keep mine]
- Missing on profile — Survey No. 12/3 → [Add] [Skip]

Nothing changes until the customer chooses. Values the customer confirmed are
never overwritten automatically. Registration and Property Tax documents get
the same treatment for the fields they carry.

### 2.3 Buyer name vs the account holder (handle carefully)

Deeds name the **purchaser(s)**; the account holder may be a buyer, one of
several, or a relative/manager. We **never block** and never claim legal
ownership — we ask once and record the answer.

Matching (deterministic, not AI):
- Normalise: case, punctuation, titles (Sri/Smt/Mr/Mrs/Ms/Dr/M/s), relation
  clauses (S/o, D/o, W/o, C/o), extra spaces.
- Compare tokens allowing initials (`B.H. Deepthi` ≈ `Deepthi B H`), token
  order, and small spelling differences (edit distance ≤ 1 per long token).
- Results: **match** · **likely match** · **no match** · **can't tell**
  (no name on the account, or the buyer is a company).

What the customer sees:
- Match → nothing to ask; the owner(s) are listed on the property.
- Likely / no match / can't tell → once, gently:
  > "This deed is in the name of **Name A** (and **Name B**). How are you related to this property?"
  > [I'm the owner] [Joint owner] [Family member's property] [I manage it for someone]

The answer is saved on the property as the customer's relationship to it
(used later for wording and recommendations — e.g. Khata transfer help if
names don't match the tax records). It can be changed anytime in Edit.

---

## 3. Privacy rules (agreed)

- **Never stored:** PAN, Aadhaar, phone numbers, signatures, photographs and
  thumbprints of the parties. The extraction schema has no fields for them,
  and a validation step strips anything that looks like a PAN/Aadhaar/phone
  pattern from every extracted value before saving.
- Names, ages and relation clauses of parties: only **names** (and role:
  buyer/seller/developer/witness are not kept).
- Document text and AI responses are **not logged**. Logs hold job ids,
  status, timings, token counts and cost only.
- Reading starts only from an explicit customer action (choosing the deed path,
  or "Read this document" on an eligible type).
- AI provider: Anthropic (Claude), server-side key only. Processing outside
  India is accepted for now; the privacy policy gets a line about AI
  processing before launch.

---

## 4. What we extract (Sale Deed)

First decide the **property kind**, then extract the fields that fit it.

| Field | Plot / land | Apartment / villa | Lands in |
|---|---|---|---|
| property_type | ✓ | ✓ | properties.property_type |
| name suggestion (project / layout + unit) | ✓ | ✓ | properties.name |
| address, city/town, district, state, PIN | ✓ | ✓ | properties.* |
| village, hobli, taluk | ✓ | – | fact |
| survey number(s) | ✓ | (underlying land) | properties.survey_number (+ fact for extras) |
| plot / site / flat / unit number | ✓ | ✓ | properties.property_number |
| Khata / PID | ✓ | ✓ | properties.khata_number |
| area + unit (acres/guntas, sq ft, sq m, sq yd) | ✓ | built-up, carpet, undivided share | properties.area_* (+ facts) |
| project / developer | – | ✓ | fact |
| boundaries (N/S/E/W) | ✓ | ✓ | fact |
| registration no., date, Sub-Registrar office | ✓ | ✓ | fact |
| sale consideration (₹) | ✓ | ✓ | fact |
| buyers (names), sellers (names) | ✓ | ✓ | fact |

Every value carries: **page number(s)**, **confidence** (high / medium / low)
and the **raw text** it came from (short snippet, privacy-filtered).

Acres/guntas are converted for display (1 acre = 40 guntas; 1 gunta ≈ 1,089 sq ft)
but the original unit is kept.

---

## 5. Pipeline

```
upload (existing intent → signed URL → confirm)
  → eligible type & customer asked to read?
  → create analysis job (queued)                         ← API, returns at once
  → worker:
       1. fetch file from private storage
       2. inspect: pages, size, text layer?
       3. prepare pages: render to images at reading quality,
          drop photo/thumbprint-only pages, cap pages (e.g. 40)
       4. classify (cheap model or rules): is this a sale deed? kind?
       5. extract (strong model) → strict JSON schema
       6. validate deterministically: formats, units, PIN, dates,
          privacy filter, cross-field sanity
       7. save facts + suggestions; job = ready (or failed + reason)
  → app polls job → review screen
  → customer confirms → API writes confirmed values to the property
     (field_sources = 'sale_deed', or 'user' if edited) and facts → confirmed
```

- **Long runs:** a 26-page scan can take 30–90 s; the API answers in under a
  second and the worker runs in the background (Vercel function with a longer
  time limit or a Supabase function — pick after a quick timing test).
- **Read once:** results are tied to the document; re-reading only when the
  file is replaced or the customer asks. Opening screens never calls the AI.
- **Retries:** at most 2 automatic retries on provider errors, then "failed".
- **Provider interface:** `DocumentReader.classify()`, `.extract(schema)` —
  Claude behind it; models configurable (strong for deeds, small for tax
  receipts / classification).

### File size

Today: 10 MB for all documents (shared constant, DB check, storage bucket).
Change: **Sale Deed and Registration up to 60 MB** (real deeds reach 54 MB);
others stay at 10 MB. The worker downsizes pages before sending, so the AI
request stays well under its limits.

---

## 6. Data (conceptual — align with existing schema when building)

- **document_analyses** — document, kind detected, status
  (queued/reading/ready/failed/needs_review), model, pages used, tokens, cost,
  error, timestamps. One active analysis per document version.
- **property_facts** — property, key (e.g. `survey_number`, `buyer_name`,
  `registration_number`), value, unit, page(s), confidence, source document,
  status (suggested / confirmed / rejected / conflict), confirmed_at/by.
- **properties** — existing columns filled from confirmed facts;
  `field_sources` (already exists: user / sale_deed / ai / external / system)
  records where each came from. Plus: draft flag, customer's relationship to
  the property.
- **ai_operations** — every AI call: operation, model, cache hit, ms, tokens,
  ₹ cost, outcome. Backoffice shows totals and failures.
- Audit: business events (`document.analysis_requested`, `.ready`,
  `property.details_confirmed`) + the existing row-change triggers.

Limits: e.g. 5 deed readings per account per day, 1 concurrent; a monthly
spend cap that pauses reading (with a Backoffice alert) if exceeded.

---

## 7. Cost (estimates, to be measured)

| Operation | Model | Approx. per document |
|---|---|---|
| Sale Deed (15–30 scanned pages) | strong (Sonnet) | ₹10–20 |
| Registration | strong / small | ₹3–10 |
| Property Tax receipt, classification | small (Haiku) | ₹1–2 |

Read once, so cost is per upload, not per view.

---

### Measured (trial, 6 Oct 2026 — 4 real deeds, 13–30 scanned pages)

| Approach | Fields right | ≈ cost / deed | Notes |
|---|---|---|---|
| **Sonnet reads the whole deed** (PDF; page images if > 24 MB) | **76/76** | **$0.085 (≈ ₹7)** | Chosen for launch. Handwritten Khata read (medium confidence); ID/photo pages skipped by itself. |
| A · Haiku page triage → chosen pages, 90 dpi → Sonnet | 72/76 | $0.047 | Missed a buyer and a sale price (pages dropped by triage). |
| B · Haiku reads the whole deed | 69/76 | $0.039 | **Invented a name** (expanded initials) with high confidence; missed registration details. |
| C · Tesseract OCR (eng+kan+tel) → text → Sonnet | 72/76 | $0.064 | Kannada/Telugu OCR text is token-heavy; wrong registration no. (low confidence). Needs our own OCR server. |

Decision: launch with **Sonnet on the whole deed**. Optimise when volume
justifies it: OCR + keyword page selection on the OCR text (free), English-only
OCR for English deeds, same-project templates, cached instructions.

## 8. Testing

- **Golden set:** the owner's 4 real deeds (2 plots, 2 apartments; 13–30
  pages; scanned; English + Kannada pages; one 54 MB). Kept **outside the
  repo**. For each, expected values are written down and checked by the owner;
  every change to prompts/schema is scored against them (field accuracy,
  missed fields, false values).
- Plus: wrong document type, poor scans, partial deeds, a deed for a different
  city than entered (cross-check), duplicate upload (no second AI call),
  provider timeout, cross-account access attempts, privacy filter (no
  PAN/Aadhaar/phone in any saved value or log).

---

## 8b. How the AI layer is built (Pittu core + Pittu Read, in `apps/api/src/pittu/` — see docs/PITTU.md)

| Piece | File | Rule |
|---|---|---|
| **Task** | `read/tasks/saleDeed.ts` | Instructions + schema + validation, with a `version`. Any change → bump the version → score with `scripts/ai-eval.ts` first. Old results keep their version. |
| **Provider** | `core/anthropic.ts` (+ `core/provider.ts`) | The only code that knows a vendor. Another provider = another adapter; tasks don't change. `AI_PROVIDER=fake` for tests. |
| **Our rules** | `core/privacy.ts`, task `conventions()` | Privacy filter and naming conventions run in code after the model — deterministic, unit-tested, never in the prompt alone. |
| **Jobs** | `read/jobs.ts` (+ `src/deeds/reading.ts` for what a deed reading means), `routes/analysis.ts` | One reading per document per task version (cache). Background via `waitUntil`; a status check restarts queued/stuck jobs. Max 3 attempts. Results written with the server key only after validation. |
| **Cost** | `core/run.ts`, `core/pricing.ts`, `ai_operations` | Every call goes through `runTask()` and is logged (capability, task, version, model, tokens, ₹/$, time, outcome). Hard monthly cap `AI_MONTHLY_BUDGET_USD`; per-account daily limit `AI_DAILY_READS_PER_ACCOUNT`. |
| **Switches** | `env.ts`, `core/limits.ts` | `AI_ENABLED` (off by default), `AI_PILOT_ACCOUNTS` (only these accounts while piloting). |
| **Improvement loop** | `property_facts.final_value` | Every customer edit is kept next to what the AI said — the material for the next task version. |
| **Tests** | `test/ai-unit.ts` (CI), `scripts/ai-eval.ts` (by hand), RLS suite | Unit tests cost nothing; the eval spends ~$0.35 per full run on the private test set. |

Not yet: deeds over 24 MB (need page rendering or the provider's file upload —
they are marked `too_large` and go to staff), Registration / Property Tax tasks,
OCR path, prompt caching.

## 9. Phases

1. **AI-1 + Sale Deed path for new properties** — provider interface, jobs,
   worker, extraction + validation, review screen, draft property, confirm →
   profile. 60 MB deeds. Golden-set scoring. Backoffice: job status + cost.
2. **Cross-check + more types** — later-uploaded deeds vs entered details,
   buyer-name check and relationship question, Registration and Property Tax
   reading.
3. **Next steps** — rule-based recommendations with reasons, linked to
   services (no Khata → Khata assistance; old tax receipt → Property Tax
   assistance; vacant plot → site check / cleaning).
4. **Later** — trusted current information with source and date; RAG/agents
   only if a concrete need appears.

## 10. Decisions log

| Date | Decision |
|---|---|
| 6 Oct 2026 | Encryption vault deferred; staff document restriction not needed now (owner only). |
| 6 Oct 2026 | Claude as provider; processing outside India accepted for now. |
| 6 Oct 2026 | Add-property offers "Upload Sale Deed" (recommended) and "Enter details"; later deeds are cross-checked. |
| 6 Oct 2026 | Only Sale Deed, Registration, Property Tax are read. |
| 6 Oct 2026 | Draft property while reading — OK. |
| 6 Oct 2026 | Buyer-name mismatch → ask relationship once, never block (design in 2.3). |
| 6 Oct 2026 | Never store PAN, Aadhaar, photos, thumbprints, signatures. |
| 6 Oct 2026 | Raise size limit for deeds (60 MB). No camera capture for deeds. |
| 6 Oct 2026 | Trial + 3-arm cost experiment: launch with Sonnet reading the whole deed (~₹7/deed, 76/76). Haiku not used for deeds (invented a name). Cost optimisation deferred until volume. |
