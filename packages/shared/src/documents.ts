import { DOCUMENT_TYPE_LABELS, type DocumentType } from './constants';
import { fromBuilder, inBengaluruCity, type PittuAnswers, type PittuContext } from './pittu';

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
