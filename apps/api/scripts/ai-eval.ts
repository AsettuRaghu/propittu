// Scores the PRODUCTION sale-deed task against the private test set.
// Run by hand before changing instructions, schema, model or provider.
//
//   npx tsx scripts/ai-eval.ts               all deeds
//   npx tsx scripts/ai-eval.ts deed2          one deed
//
// Test set (kept OUTSIDE the repo — real deeds, personal data):
//   $AI_EVAL_DIR/trial/expected.json   expected values (deed id → fields + file)
//   $AI_EVAL_DEEDS/<file>              the PDFs
// Key: ~/propittu-anthropic-key.txt (never printed). Costs ~$0.35 per full run.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { anthropicProvider } from '../src/ai/anthropic.js';
import { estimateCostUsd } from '../src/ai/pricing.js';
import { saleDeedTask, type SaleDeedResult } from '../src/ai/tasks/saleDeed.js';

const EVAL_DIR =
  process.env.AI_EVAL_DIR ?? path.join(os.homedir(), 'Downloads', 'propittu-ai-test');
const DEEDS_DIR = process.env.AI_EVAL_DEEDS ?? path.join(os.homedir(), 'Downloads');
const expected: Record<string, Record<string, unknown>> = JSON.parse(
  fs.readFileSync(path.join(EVAL_DIR, 'trial', 'expected.json'), 'utf8'),
);
const key = fs.readFileSync(path.join(os.homedir(), 'propittu-anthropic-key.txt'), 'utf8').trim();
const provider = anthropicProvider(key);
// Fields that measure our definitions rather than reading (see trial notes).
const NOT_SCORED = new Set(['file', 'stamp_duty_inr', 'city']);

const norm = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/\b(sri|smt|mr|mrs|ms|m\/s)\b\.?/g, '')
    .replace(/hobli|taluk|mandal/g, '')
    .replace(/[^a-z0-9]/g, '');
function same(field: string, got: unknown, want: unknown): boolean {
  if (want === null) return got === null || (Array.isArray(got) && got.length === 0);
  if (got === null || got === undefined) return false;
  if (typeof want === 'number') return Math.abs(Number(got) - want) < 0.5;
  if (Array.isArray(want)) {
    return (
      (Array.isArray(got) ? got : [got]).map(norm).sort().join('|') ===
      want.map(norm).sort().join('|')
    );
  }
  if (['project_name', 'sub_registrar_office', 'village'].includes(field)) {
    const a = norm(got);
    const b = norm(want);
    return a.includes(b) || b.includes(a);
  }
  return norm(got) === norm(want);
}

let right = 0;
let total = 0;
let cost = 0;
const ids = process.argv[2] ? [process.argv[2]] : Object.keys(expected);
for (const id of ids) {
  const exp = expected[id];
  if (!exp) throw new Error(`No expected values for ${id}`);
  const file = path.join(DEEDS_DIR, String(exp.file));
  const bytes = new Uint8Array(fs.readFileSync(file));
  if (bytes.length > 24 * 1024 * 1024) {
    console.log(
      `\n== ${id}: ${(bytes.length / 1e6).toFixed(0)} MB — over the direct-PDF limit (production sends it to staff for now); skipped`,
    );
    continue;
  }
  const answer = await provider.run({
    model: saleDeedTask.model,
    system: saleDeedTask.system,
    documents: [{ kind: 'pdf', bytes }],
    text: saleDeedTask.userText,
    schema: saleDeedTask.schema,
    maxOutputTokens: saleDeedTask.maxOutputTokens,
  });
  const result: SaleDeedResult = saleDeedTask.parse(answer.json);
  const usd = estimateCostUsd(answer.model, answer.inputTokens, answer.outputTokens);
  cost += usd;
  const fields = Object.keys(exp).filter((k) => !NOT_SCORED.has(k));
  const misses = fields.filter(
    (f) => !same(f, result.fields[f as keyof SaleDeedResult['fields']]?.value ?? null, exp[f]),
  );
  right += fields.length - misses.length;
  total += fields.length;
  console.log(
    `\n== ${id} · ${saleDeedTask.version} · ${answer.model} · ${(answer.durationMs / 1000).toFixed(1)}s · ~$${usd.toFixed(3)} · ${fields.length - misses.length}/${fields.length}` +
      (result.privacy_removed ? ` · privacy filter removed ${result.privacy_removed}` : ''),
  );
  for (const f of misses) {
    const got = result.fields[f as keyof SaleDeedResult['fields']];
    console.log(
      `   ✗ ${f}: got ${JSON.stringify(got?.value)} (${got?.confidence}) · expected ${JSON.stringify(exp[f])}`,
    );
  }
}
console.log(`\n${saleDeedTask.version}: ${right}/${total} fields right · ~$${cost.toFixed(3)}`);
