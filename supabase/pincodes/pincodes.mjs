// India PIN code directory → public.pincodes.
//
//   node supabase/pincodes/pincodes.mjs build <raw.csv>   writes supabase/pincodes/pincodes.csv
//   node supabase/pincodes/pincodes.mjs load              upserts it into the linked project
//
// Source: "All India Pincode Directory", Department of Posts, Government of
// India, via the Open Government Data Platform (data.gov.in), Government
// Open Data Licence – India (GODL). Attribution is shown in the app's data
// credits. Accepts both the older column names (officename, Districtname,
// statename) and the current ones (Office Name, District, StateName).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
const OUT = join(HERE, 'pincodes.csv');

/** Minimal CSV reader (quoted fields, commas inside quotes). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

const STATE_FIX = {
  CHATTISGARH: 'Chhattisgarh',
  PONDICHERRY: 'Puducherry',
  'ANDAMAN & NICOBAR ISLANDS': 'Andaman and Nicobar Islands',
  'DADRA & NAGAR HAVELI': 'Dadra and Nagar Haveli and Daman and Diu',
  'DAMAN & DIU': 'Dadra and Nagar Haveli and Daman and Diu',
  'JAMMU & KASHMIR': 'Jammu and Kashmir',
};
const title = (s) =>
  s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bAnd\b/g, 'and')
    .trim();
const state = (s) => STATE_FIX[s.trim().toUpperCase()] ?? title(s);
/** States and union territories; anything else in the state column is a misaligned row. */
const STATES = new Set([
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh',
  'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal',
]);
/** "Indiranagar S.O (Bangalore)" → "Indiranagar" */
const place = (office) =>
  office
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s+(B\.?O|S\.?O|H\.?O|G\.?P\.?O|BO|SO|HO|GPO)\.?\s*$/i, '')
    .trim();

function build(raw) {
  const [head, ...rows] = parseCsv(readFileSync(raw, 'utf8'));
  const col = (...names) => {
    const i = head.findIndex((h) => names.some((n) => h.trim().toLowerCase() === n.toLowerCase()));
    if (i < 0) throw new Error(`Column not found: ${names.join(' / ')}`);
    return i;
  };
  const iOffice = col('officename', 'Office Name');
  const iPin = col('pincode');
  const iType = col('officeType', 'OfficeType');
  const iDistrict = col('Districtname', 'District');
  const iState = col('statename', 'StateName');
  const pins = new Map();
  for (const r of rows) {
    const pin = (r[iPin] ?? '').trim();
    if (!/^[1-9][0-9]{5}$/.test(pin)) continue;
    const p = pins.get(pin) ?? { offices: [], districts: new Map(), states: new Map(), main: null };
    const name = place(r[iOffice] ?? '');
    if (name && !p.offices.includes(name)) p.offices.push(name);
    if (!p.main && /^(S\.?O|H\.?O|G\.?P\.?O|SO|HO|PO)$/i.test((r[iType] ?? '').trim())) p.main = name;
    const d = title(r[iDistrict] ?? '');
    const s = (r[iState] ?? '').trim();
    if (d && d !== 'Null') p.districts.set(d, (p.districts.get(d) ?? 0) + 1);
    if (STATES.has(state(s))) p.states.set(state(s), (p.states.get(state(s)) ?? 0) + 1);
    pins.set(pin, p);
  }
  const top = (m) => [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = ['pincode,place,district,state,localities'];
  for (const [pin, p] of [...pins].sort()) {
    if (p.states.size === 0) continue; // no trustworthy state: leave it out
    const localities = p.offices.slice(0, 30).join('|');
    lines.push([pin, p.main ?? p.offices[0] ?? '', top(p.districts), top(p.states), localities].map(esc).join(','));
  }
  writeFileSync(OUT, lines.join('\n') + '\n');
  console.log(`${pins.size} PIN codes → ${OUT}`);
}

function load() {
  const [, ...rows] = parseCsv(readFileSync(OUT, 'utf8')).filter((r) => r.length >= 5);
  const q = (v) => `'${v.replace(/'/g, "''")}'`;
  const dir = mkdtempSync(join(tmpdir(), 'pincodes-'));
  const size = 2000;
  for (let i = 0; i < rows.length; i += size) {
    const values = rows
      .slice(i, i + size)
      .map(
        ([pin, plc, dist, st, loc]) =>
          `(${q(pin)}, ${q(plc)}, ${q(dist)}, ${q(st)}, ${loc ? `string_to_array(${q(loc)}, '|')` : "'{}'"})`,
      )
      .join(',\n');
    const file = join(dir, `batch-${i}.sql`);
    writeFileSync(
      file,
      `insert into public.pincodes (pincode, place, district, state, localities) values\n${values}\n` +
        `on conflict (pincode) do update set place = excluded.place, district = excluded.district,\n` +
        `  state = excluded.state, localities = excluded.localities;\n`,
    );
    execFileSync('supabase', ['db', 'query', '--linked', '-f', file], { stdio: ['ignore', 'ignore', 'inherit'] });
    console.log(`loaded ${Math.min(i + size, rows.length)} / ${rows.length}`);
  }
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'build' && arg) build(arg);
else if (cmd === 'load') load();
else console.log('usage: pincodes.mjs build <raw.csv> | load');
