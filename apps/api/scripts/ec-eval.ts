// Runs Pittu Read's EC task on real ECs, by hand, for review — the first
// step before relying on it. No expected answers yet: it prints a summary per
// EC and saves the full reading as <file>.pittu.json next to each PDF, for a
// person to check against the EC.
//
//   npx tsx scripts/ec-eval.ts                 every PDF in the folder
//   npx tsx scripts/ec-eval.ts some-ec.pdf     one file
//
// ECs (kept OUTSIDE the repo — real records, personal data):
//   $AI_EVAL_EC_DIR (default ~/Downloads/propittu-ec-test)
// Key: ~/propittu-anthropic-eval-key.txt if present (keeps test costs apart in
// the Anthropic Console), else ~/propittu-anthropic-key.txt. Never printed.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EC_ENTRY_KIND_LABELS } from '@propittu/shared';
import { anthropicProvider } from '../src/pittu/core/anthropic.js';
import { estimateCostUsd } from '../src/pittu/core/pricing.js';
import { encumbranceTask } from '../src/pittu/read/tasks/encumbrance.js';

const DIR = process.env.AI_EVAL_EC_DIR ?? path.join(os.homedir(), 'Downloads', 'propittu-ec-test');
const keyFile = ['propittu-anthropic-eval-key.txt', 'propittu-anthropic-key.txt']
  .map((f) => path.join(os.homedir(), f))
  .find((f) => fs.existsSync(f));
if (!keyFile) throw new Error('No Anthropic key file found');
const provider = anthropicProvider(fs.readFileSync(keyFile, 'utf8').trim());

const files = process.argv[2]
  ? [process.argv[2]]
  : fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.pdf'));
let cost = 0;
for (const file of files) {
  const full = path.isAbsolute(file) ? file : path.join(DIR, file);
  const bytes = new Uint8Array(fs.readFileSync(full));
  const answer = await provider.run({
    model: encumbranceTask.model,
    system: encumbranceTask.system,
    documents: [{ kind: 'pdf', bytes }],
    text: encumbranceTask.userText,
    schema: encumbranceTask.schema,
    maxOutputTokens: encumbranceTask.maxOutputTokens,
  });
  const usd = estimateCostUsd(answer.model, answer.inputTokens, answer.outputTokens);
  cost += usd;
  try {
    const ec = encumbranceTask.parse(answer.json);
    fs.writeFileSync(`${full}.pittu.json`, JSON.stringify(ec, null, 2));
    const kinds = ec.entries.reduce<Record<string, number>>((m, e) => {
      const k = EC_ENTRY_KIND_LABELS[e.kind];
      m[k] = (m[k] ?? 0) + 1;
      return m;
    }, {});
    const low = ec.entries.filter((e) => e.confidence === 'low').length;
    console.log(
      `${path.basename(full)}: ${ec.issuing_office ?? '?'} · ${ec.period_from ?? '?'} → ${ec.period_to ?? '?'} · ` +
        (ec.nil_encumbrance
          ? 'NIL (no transactions)'
          : `${ec.entries.length} entries ${JSON.stringify(kinds)}${low ? ` · ${low} low-confidence` : ''}`) +
        ` · $${usd.toFixed(3)}`,
    );
  } catch (err) {
    console.log(`${path.basename(full)}: refused (${(err as Error).message}) · $${usd.toFixed(3)}`);
  }
}
console.log(
  `\n${files.length} EC(s) · total $${cost.toFixed(3)} · readings saved as <file>.pittu.json`,
);
