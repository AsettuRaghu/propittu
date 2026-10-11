import { DOCUMENT_TYPE_LABELS, type DocumentType } from './constants';
import {
  fromBuilder,
  inBengaluruCity,
  matchBuyerName,
  type NameMatch,
  type PittuAnswers,
  type PittuContext,
} from './pittu';

/**
 * The property file (owner, 11 Oct 2026): every document a property can
 * have, grouped, named the way the state names it, and — per property —
 * which ones matter and why. Fixed rules, shared by the app and the API.
 */

export const DOCUMENT_GROUPS: { key: string; label: string; types: DocumentType[] }[] = [
  {
    key: 'ownership',
    label: 'Ownership',
    types: [
      'sale_deed',
      'link_deed',
      'gift_partition',
      'will_succession',
      'power_of_attorney',
      'court_order',
      'registration',
    ],
  },
  {
    key: 'land',
    label: 'Land and title records',
    types: [
      'encumbrance_certificate',
      'land_record',
      'mutation',
      'survey_sketch',
      'conversion_order',
    ],
  },
  {
    key: 'city',
    label: 'City records and approvals',
    types: ['khata', 'property_tax', 'building_plan', 'occupancy_certificate', 'layout_approval'],
  },
  {
    key: 'flat',
    label: 'Flat and builder papers',
    types: ['sale_agreement', 'possession_letter', 'rera', 'association'],
  },
  { key: 'loan', label: 'Loans', types: ['loan_papers', 'loan_closure'] },
  {
    key: 'upkeep',
    label: 'Use and upkeep',
    types: ['rental_agreement', 'utility_bill', 'insurance'],
  },
  { key: 'owners', label: 'Owners', types: ['owner_id', 'other'] },
];

/** Where the property is, as far as document names go. */
export interface DocumentPlace {
  state: string | null;
  /** Inside the Bengaluru city corporation (GBA): the e-Khata. */
  bengaluru_city?: boolean;
}

const ka = (p: DocumentPlace) => /karnataka/i.test(p.state ?? '');
const tg = (p: DocumentPlace) => /telangana|andhra/i.test(p.state ?? '');

/** The document's name as owners in that state know it. */
export function documentLabel(type: DocumentType, place: DocumentPlace): string {
  switch (type) {
    case 'khata':
      return place.bengaluru_city ? 'e-Khata' : ka(place) ? 'Khata / e-Swathu' : 'Khata';
    case 'land_record':
      return ka(place) ? 'RTC (Pahani)' : tg(place) ? 'Pahani / ROR-1B' : 'Land record';
    case 'mutation':
      return ka(place)
        ? 'Mutation register (MR)'
        : tg(place)
          ? 'Mutation proceedings'
          : 'Mutation record';
    case 'conversion_order':
      return ka(place)
        ? 'Conversion order (DC)'
        : tg(place)
          ? 'NALA conversion order'
          : 'Land conversion order';
    case 'layout_approval':
      return ka(place)
        ? 'Layout approval (BDA / BMRDA / DTCP)'
        : tg(place)
          ? 'Layout approval / LRS'
          : 'Layout approval';
    case 'survey_sketch':
      return ka(place) ? 'Survey sketch (Tippan / 11E)' : 'Survey sketch';
    case 'property_tax':
      return tg(place) ? 'Property tax receipt (PTIN)' : 'Property tax receipt';
    default:
      return DOCUMENT_TYPE_LABELS[type];
  }
}

export interface DocumentNeed {
  type: DocumentType;
  label: string;
  /** One line: why this property needs it. */
  why: string;
  /** Key documents first; the rest are worth keeping. */
  key: boolean;
}

/**
 * Which documents matter for THIS property, most important first: by type
 * (flat, plot, house), state, whether it came from a builder and whether
 * it's rented. Everything else can still be added under its group.
 */
export function documentPlan(ctx: PittuContext, answers: PittuAnswers = {}): DocumentNeed[] {
  const place: DocumentPlace = { state: ctx.state, bengaluru_city: inBengaluruCity(ctx) };
  const flat = ctx.property_type === 'apartment';
  const land = ctx.property_type === 'land';
  const house = ctx.property_type === 'independent_house';
  const builder = fromBuilder(ctx);
  const out: DocumentNeed[] = [];
  const add = (type: DocumentType, key: boolean, why: string) =>
    out.push({ type, label: documentLabel(type, place), why, key });

  add('sale_deed', true, 'The proof that it’s yours');
  add(
    'encumbrance_certificate',
    true,
    'Every registered sale and loan on it — banks and buyers ask',
  );
  if (ka(place)) add('khata', true, 'The city’s record in your name — needed to sell or register');
  add('property_tax', true, 'This year’s receipt, so nothing is due');
  if (land) {
    add('land_record', true, 'The land record should show the right owner and area');
    add('conversion_order', true, 'Shows the land may be used for building');
    add('layout_approval', false, 'The layout was approved by the planning authority');
    add('survey_sketch', false, 'The plot’s boundaries on the survey map');
  }
  if (flat) {
    if (builder) add('occupancy_certificate', true, 'Shows the building was finished as approved');
    add('sale_agreement', false, 'The builder’s promises: area, parking, amenities');
    add('possession_letter', false, 'When you got the keys');
    if (builder) add('rera', false, 'The project’s registration with RERA');
    add('association', false, 'Association membership and no dues');
  }
  if (house) {
    add('building_plan', true, 'The approved plan the house was built to');
    add('occupancy_certificate', false, 'Shows the house was finished as approved');
    add('land_record', false, 'The land record under the house');
  }
  if (answers.occupancy === 'rented' || answers.rent_out === 'yes') {
    add('rental_agreement', true, 'Protects you and the tenant; we track its end date');
  }
  add('link_deed', false, 'Earlier deeds show the chain of owners before you');
  if (!land) add('utility_bill', false, 'Electricity and water in the owner’s name');
  add('owner_id', false, 'Masked Aadhaar or PAN, to match names on the records');
  return out;
}

export interface ChecklistItem {
  document_type: DocumentType;
  label: string;
  have: boolean;
  hint: string;
}

/** The key documents for this property, and whether each is in the locker (Pittu's care plan). */
export function documentChecklist(ctx: PittuContext, answers: PittuAnswers = {}): ChecklistItem[] {
  return documentPlan(ctx, answers)
    .filter((d) => d.key)
    .map((d) => {
      const have = ctx.documents.includes(d.type);
      return {
        document_type: d.type,
        label: d.label,
        have,
        hint: have ? (d.type === 'sale_deed' ? 'Read by Pittu' : 'Uploaded') : d.why,
      };
    });
}

/* ------------------------------------------------------------------ *
 * Pittu reads the other documents (task document.read) and checks each
 * against the sale deed. Facts only — the owner sees what matches and
 * what differs; nothing here says a property is "clean".
 * ------------------------------------------------------------------ */

export type ReadKind =
  | 'khata'
  | 'property_tax'
  | 'land_record'
  | 'mutation'
  | 'conversion_order'
  | 'occupancy_certificate'
  | 'building_plan'
  | 'rental_agreement'
  | 'loan_closure'
  | 'loan_papers'
  | 'utility_bill'
  | 'encumbrance_certificate'
  | 'sale_deed'
  | 'id_document'
  | 'other';

/** Document types Pittu reads by itself as soon as they're uploaded. */
export const AUTO_READ_TYPES: readonly DocumentType[] = [
  'khata',
  'property_tax',
  'land_record',
  'mutation',
  'conversion_order',
  'occupancy_certificate',
  'building_plan',
  'rental_agreement',
  'loan_closure',
  'utility_bill',
];

/** What Pittu read on one document (validated, privacy-filtered). */
export interface DocumentReading {
  document_kind: ReadKind;
  owner_names: string[];
  khata_number: string | null;
  ptin: string | null;
  property_id: string | null;
  survey_numbers: string[];
  village: string | null;
  area_value: number | null;
  area_unit: 'sqft' | 'sqyd' | 'sqm' | 'acre' | 'guntha' | 'cent' | null;
  issued_on: string | null;
  period_from: string | null;
  period_to: string | null;
  amount_inr: number | null;
  amount_meaning: 'tax_paid' | 'tax_due' | 'monthly_rent' | 'loan_amount' | 'bill' | null;
  paid_on: string | null;
  authority: string | null;
  khata_kind: 'a_khata' | 'b_khata' | 'e_khata' | 'e_swathu' | null;
  land_use: string | null;
  note: string | null;
  confidence: 'high' | 'medium' | 'low';
}

/** What the deed (and the property) say, to compare with. */
export interface DeedSide {
  buyers: string[];
  sellers: string[];
  survey_numbers: string[];
  khata_number: string | null;
  area_sqft: number | null;
  property_type: string;
}

export interface DocumentFinding {
  level: 'ok' | 'note' | 'differs';
  text: string;
  /** Filed under the wrong type: where it belongs (the app offers a one-tap move). */
  move_to?: DocumentType;
}

/** Pittu's line on one document (GET /properties/:id/documents). */
export interface DocumentPittu {
  status: 'reading' | 'ready' | 'failed';
  summary: string | null;
  findings: DocumentFinding[];
}

const KIND_NAMES: Record<ReadKind, string> = {
  khata: 'Khata',
  property_tax: 'tax receipt',
  land_record: 'land record',
  mutation: 'mutation record',
  conversion_order: 'conversion order',
  occupancy_certificate: 'occupancy certificate',
  building_plan: 'building plan',
  rental_agreement: 'rental agreement',
  loan_closure: 'loan closure letter',
  loan_papers: 'loan document',
  utility_bill: 'bill',
  encumbrance_certificate: 'Encumbrance Certificate',
  sale_deed: 'sale deed',
  id_document: 'personal ID card',
  other: 'document',
};
const UPLOADED_AS: Partial<Record<DocumentType, ReadKind>> = {
  khata: 'khata',
  property_tax: 'property_tax',
  land_record: 'land_record',
  mutation: 'mutation',
  conversion_order: 'conversion_order',
  occupancy_certificate: 'occupancy_certificate',
  building_plan: 'building_plan',
  rental_agreement: 'rental_agreement',
  loan_closure: 'loan_closure',
  utility_bill: 'utility_bill',
  owner_id: 'id_document',
};
const SQFT: Record<string, number> = {
  sqft: 1,
  sqm: 10.7639,
  sqyd: 9,
  acre: 43_560,
  guntha: 1_089,
  cent: 435.6,
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
/** "2026–27" for a date in that financial year. */
const fyOf = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}–${String(y + 1).slice(2)}`;
};

/** Does a property tax reading cover the financial year `now` is in? */
export function taxCoversThisYear(r: DocumentReading, now = new Date()): boolean {
  if (r.document_kind !== 'property_tax' || r.amount_meaning === 'tax_due') return false;
  const fy = fyOf(now.toISOString().slice(0, 10));
  if (r.period_from && r.period_to) {
    return fyOf(r.period_from) === fy || fyOf(r.period_to) === fy;
  }
  return !!r.paid_on && fyOf(r.paid_on) === fy;
}

/**
 * Pittu's one-line summary of a reading, and how it compares with the deed:
 * owner names (still in the seller's name?), survey number, Khata number,
 * area, the tax year, a rental agreement's end, a B-Khata, farmland use.
 */
export function checkDocument(
  uploadedAs: DocumentType,
  r: DocumentReading,
  deed: DeedSide | null,
  now = new Date(),
): { summary: string | null; findings: DocumentFinding[] } {
  const findings: DocumentFinding[] = [];
  const kind = KIND_NAMES[r.document_kind];
  if (r.document_kind === 'id_document') {
    // Nothing is read from ID cards; just say where it belongs.
    return {
      summary: 'A personal ID card',
      findings:
        uploadedAs === 'owner_id'
          ? []
          : [
              {
                level: 'note',
                text: 'This looks like an ID card — file it under Owner ID',
                move_to: 'owner_id',
              },
            ],
    };
  }
  const expected = UPLOADED_AS[uploadedAs];
  if (expected && r.document_kind === 'other' && uploadedAs !== 'other') {
    findings.push({
      level: 'note',
      text: `This doesn’t look like a ${KIND_NAMES[expected]}`,
      move_to: 'other',
    });
  }
  if (expected && r.document_kind !== expected && r.document_kind !== 'other') {
    const home = (Object.keys(UPLOADED_AS) as DocumentType[]).find(
      (t) => UPLOADED_AS[t] === r.document_kind,
    );
    const moveTo: DocumentType | undefined =
      r.document_kind === 'sale_deed'
        ? 'sale_deed'
        : r.document_kind === 'encumbrance_certificate'
          ? 'encumbrance_certificate'
          : r.document_kind === 'loan_papers'
            ? 'loan_papers'
            : home;
    findings.push({
      level: 'note',
      text: `This looks like a ${kind}, not a ${KIND_NAMES[expected]}`,
      ...(moveTo ? { move_to: moveTo } : {}),
    });
  }

  if (deed && r.owner_names.length && deed.buyers.length) {
    const owners = r.owner_names.join(', ');
    const best = r.owner_names
      .map((o) => matchBuyerName(o, deed.buyers))
      .reduce<NameMatch>(
        (b, m) => (m === 'match' || b === 'match' ? 'match' : m === 'likely' ? 'likely' : b),
        'no_match',
      );
    const seller = r.owner_names.some((o) => matchBuyerName(o, deed.sellers) === 'match');
    if (best === 'match') {
      findings.push({ level: 'ok', text: `In the owner’s name, as on the deed` });
    } else if (seller) {
      findings.push({
        level: 'differs',
        text: `Still in the previous owner’s name (${owners}) — the transfer may not be done`,
      });
    } else if (best === 'likely') {
      findings.push({ level: 'note', text: `Owner name is close to the deed’s: ${owners}` });
    } else {
      findings.push({
        level: 'differs',
        text: `Owner here: ${owners}; on the deed: ${deed.buyers.join(', ')}`,
      });
    }
  }
  if (deed && r.survey_numbers.length && deed.survey_numbers.length) {
    const theirs = new Set(deed.survey_numbers.map(norm));
    findings.push(
      r.survey_numbers.some((s) => theirs.has(norm(s)))
        ? { level: 'ok', text: 'Survey number matches the deed' }
        : {
            level: 'differs',
            text: `Survey number ${r.survey_numbers.join(', ')} here; ${deed.survey_numbers.join(', ')} on the deed`,
          },
    );
  }
  if (deed?.khata_number && r.khata_number) {
    findings.push(
      norm(deed.khata_number) === norm(r.khata_number)
        ? { level: 'ok', text: 'Khata number matches' }
        : {
            level: 'differs',
            text: `Khata number ${r.khata_number} here; ${deed.khata_number} on the deed`,
          },
    );
  }
  if (deed?.area_sqft && r.area_value && r.area_unit) {
    const sqft = r.area_value * (SQFT[r.area_unit] ?? 1);
    const off = Math.abs(sqft - deed.area_sqft) / deed.area_sqft;
    if (off > 0.1) {
      findings.push({
        level: 'note',
        text: `Area here about ${Math.round(sqft).toLocaleString('en-IN')} sq ft; the deed says ${Math.round(deed.area_sqft).toLocaleString('en-IN')} sq ft`,
      });
    }
  }
  if (r.document_kind === 'property_tax') {
    findings.push(
      taxCoversThisYear(r, now)
        ? { level: 'ok', text: 'This year’s tax is paid' }
        : r.amount_meaning === 'tax_due'
          ? { level: 'note', text: 'This is a bill — the tax is still to pay' }
          : { level: 'note', text: 'This is an older year — this year’s tax is still to pay' },
    );
  }
  if (r.document_kind === 'rental_agreement' && r.period_to) {
    const days = (Date.parse(r.period_to) - now.getTime()) / 86_400_000;
    if (days < 0) findings.push({ level: 'differs', text: `Ended on ${day(r.period_to)}` });
    else if (days <= 60)
      findings.push({ level: 'note', text: `Ends on ${day(r.period_to)} — time to renew` });
  }
  if (r.khata_kind === 'b_khata') {
    findings.push({
      level: 'note',
      text: 'It’s a B-Khata — worth checking whether it can move to an A-Khata',
    });
  }
  if (
    r.document_kind === 'land_record' &&
    deed?.property_type === 'land' &&
    /agri|dry|wet|garden|cultivat/i.test(r.land_use ?? '')
  ) {
    findings.push({
      level: 'note',
      text: `The land record still shows ${r.land_use} use — check the conversion order`,
    });
  }
  if (r.confidence === 'low') {
    findings.push({ level: 'note', text: 'Parts were hard to read — check the details' });
  }

  const parts: (string | null)[] =
    r.document_kind === 'property_tax'
      ? [
          r.period_from ? `Tax for ${fyOf(r.period_from)}` : 'Tax receipt',
          r.amount_inr
            ? `${inr(r.amount_inr)} ${r.amount_meaning === 'tax_due' ? 'due' : 'paid'}${
                r.paid_on && r.amount_meaning !== 'tax_due' ? ` on ${day(r.paid_on)}` : ''
              }`
            : r.paid_on
              ? `paid on ${day(r.paid_on)}`
              : null,
        ]
      : r.document_kind === 'rental_agreement'
        ? [
            r.amount_inr ? `Rent ${inr(r.amount_inr)} a month` : 'Rental agreement',
            r.period_to ? `ends ${day(r.period_to)}` : null,
          ]
        : r.document_kind === 'khata'
          ? [
              r.khata_kind === 'e_khata'
                ? 'e-Khata'
                : r.khata_kind === 'b_khata'
                  ? 'B-Khata'
                  : 'Khata',
              r.khata_number,
              r.owner_names.length ? `in ${r.owner_names.join(', ')}` : null,
            ]
          : r.document_kind === 'loan_closure'
            ? [
                'Loan closed',
                r.authority ? `with ${r.authority}` : null,
                r.issued_on ? `on ${day(r.issued_on)}` : null,
              ]
            : [
                kind.charAt(0).toUpperCase() + kind.slice(1),
                r.authority ? `from ${r.authority}` : null,
                r.issued_on ? day(r.issued_on) : null,
              ];
  // Something Pittu couldn't place: its own note says what it is.
  const summary =
    r.document_kind === 'other' && r.note ? r.note : parts.filter(Boolean).join(' · ') || r.note;
  return { summary, findings };
}
