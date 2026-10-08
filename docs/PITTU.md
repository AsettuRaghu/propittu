# Pittu — the AI module

Pittu is Propittu's assistant. All AI lives in **one module** (`apps/api/src/pittu`) that returns
facts and findings; the **application layer** decides what they mean.

## Capabilities (names used everywhere — app, portal, code, cost log)

| Name | What it does | Status |
|---|---|---|
| **Pittu Read** | Reads documents: sale deed (customers) and Encumbrance Certificate (staff, `encumbrance.extract` ec-v1, unscored); tax receipt, Khata, approvals next | Sale deed live; EC first version |
| **Pittu Ask** | Questions and the care plan after a reading | Live (rules in `packages/shared/src/pittu.ts`) |
| **Pittu Watch** | News and government alerts around properties | Planned |
| **Pittu Value** | Value then and now, "Ready to sell", verified property pack | Planned |
| **Pittu Legal** | EC check (upload-first: rules in `apps/api/src/legal/ecRules.ts`, staff review, shareable report); later Check before you buy, Guard, grounded answers | EC check first version |

## Layout

```
apps/api/src/pittu/
  index.ts          what the application layer may use
  core/             providers, task contracts (types.ts), pricing, privacy filter,
                    limits.ts (switch, pilot, daily cap, monthly budget),
                    run.ts — runTask(): budget → model → validation → cost log by capability
  read/             Pittu Read: tasks/ (saleDeed.ts, encumbrance.ts) and jobs.ts (queue, claim, retry,
                    "never read twice" fingerprint) with ReadHooks for the app layer
apps/api/src/legal/ Pittu Legal's application layer: ecRules.ts (EC vs deed → green/amber/red
                    findings, unit-tested), checks.ts (create, review, share)
apps/api/src/deeds/ the application layer for sale deeds: reuse an earlier reading of the
                    same file, mark duplicates, clear an abandoned draft
```

New capabilities get their own folder (`watch/`, `value/`, `legal/`) on the same core.

## Rules

1. **Pittu never decides business outcomes.** It returns facts (with confidence, pages or sources,
   task version, cost). The application decides: fill in the property, raise a review, alert the
   owner, suggest a service, charge.
2. **Never from the model's memory.** Every capability runs: **collect** from trusted sources (no
   AI) → **read** each item once (AI) → **match** to properties by survey number / village / PIN
   (database) → **verify** in the team review queue → **explain** in plain words (AI).
3. **Every call goes through `runTask()`** and is logged in `ai_operations` with its capability, so
   cost is reported per capability, customer and (later) PIN. One monthly budget for all.
4. **Area work is done once and shared** (a notice, a guidance value per village/PIN); only
   per-property work (EC, court search) is charged per property, inside paid products.
5. **Tasks are versioned**; results record the task version and model; changes are scored with
   `apps/api/scripts/ai-eval.ts` first. Use a separate API key for evals and tests.

Details of document reading: `docs/AI_DOCUMENT_INTELLIGENCE.md`. Legal pilot: `docs/PITTU_LEGAL_PILOT.md`.
