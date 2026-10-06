/**
 * Pittu — guided property setup (docs/PITTU_PROPERTY_SETUP.md).
 *
 * Shared by the app (which shows the cards) and the API (which validates
 * and stores answers), so both always agree. Everything here is fixed
 * rules — no AI: which questions show, their wording, name matching and
 * the care plan. Region wording (Karnataka / Telangana) is a v1 in code;
 * it moves to admin-reviewed region packs later.
 */

export type PittuQuestionId =
  'relation' | 'plot_built' | 'occupancy' | 'last_visit' | 'khata_name' | 'ptin' | 'tax_paid';

export interface PittuOption {
  value: string;
  label: string;
  /** Pittu's warm reply after this answer (mentions how Propittu helps). */
  reply: string;
}

export interface PittuQuestion {
  id: PittuQuestionId;
  title: string;
  why: string;
  options: PittuOption[];
  /** "What's a Khata?" style explainer. */
  glossary?: { label: string; text: string; source: string };
}

/** What the questions depend on (from the property, its deed and the account). */
export interface PittuContext {
  state: string | null;
  property_type: string;
  /** Buyers on the sale deed. */
  buyers: string[];
  /** The account holder's name (may be empty). */
  account_name: string | null;
  khata_number: string | null;
  /** Document types already uploaded for this property. */
  documents: string[];
}

export type PittuAnswers = Partial<Record<PittuQuestionId, string>>;

/* ------------------------------------------------------------------ *
 * Name matching (deterministic — design §2.3)
 * ------------------------------------------------------------------ */

const TITLES = /\b(sri|shri|smt|srimathi|mr|mrs|ms|miss|dr|m\/s|late)\b\.?/gi;
const RELATION = /\b(s|d|w|c)\s*\/\s*o\b.*$/i;

function tokens(name: string): string[] {
  return name
    .replace(RELATION, ' ')
    .replace(TITLES, ' ')
    .toLowerCase()
    .replace(/[^a-z\s.]/g, ' ')
    .replace(/\./g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function close(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  // one edit apart (substitution / insertion / deletion)
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export type NameMatch = 'match' | 'likely' | 'no_match' | 'unknown';

/**
 * Compares the account holder's name with the deed's buyers. Ignores titles
 * (Sri, Smt, Mr…), relation clauses (S/o, D/o, W/o), word order and
 * initials ("B.H. Deepthi" ≈ "Deepthi B H"), and allows a one-letter
 * spelling difference in longer words.
 */
export function matchBuyerName(accountName: string | null, buyers: string[]): NameMatch {
  const mine = tokens(accountName ?? '');
  const mineWords = mine.filter((t) => t.length > 1);
  if (mineWords.length === 0 || buyers.length === 0) return 'unknown';
  let best: NameMatch = 'no_match';
  for (const buyer of buyers) {
    // A company buyer can't be compared with a person's name.
    if (/\b(ltd|limited|pvt|llp|company|developers|constructions)\b/i.test(buyer)) continue;
    const theirs = tokens(buyer);
    const theirWords = theirs.filter((t) => t.length > 1);
    if (theirWords.length === 0) continue;
    const hits = mineWords.filter((t) => theirWords.some((u) => close(t, u))).length;
    if (hits === 0) continue;
    // Initials on either side must fit the other's words or initials.
    const fits = (ini: string, other: string[]) => other.some((t) => t[0] === ini);
    const initialsOk =
      theirs.filter((t) => t.length === 1).every((i) => fits(i, mine)) &&
      mine.filter((t) => t.length === 1).every((i) => fits(i, theirs));
    const allWords = hits === mineWords.length && hits === theirWords.length;
    if (allWords && initialsOk) return 'match';
    best = 'likely';
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * The questions
 * ------------------------------------------------------------------ */

const isKarnataka = (s: string | null) => /karnataka/i.test(s ?? '');
const isTelangana = (s: string | null) => /telangana|andhra/i.test(s ?? '');

/** Wording that follows the ownership answer. */
function whose(relation: string | undefined, owner: string | null) {
  if (relation === 'owner')
    return {
      khata: 'in your name',
      built: 'have you built on it',
      tax: 'Have you paid this year’s property tax?',
      name: 'your name',
    };
  if (relation === 'joint')
    return {
      khata: 'in all the owners’ names',
      built: 'have you built on it',
      tax: 'Has this year’s property tax been paid?',
      name: 'all the owners’ names',
    };
  if ((relation === 'family' || relation === 'manage') && owner)
    return {
      khata: `in ${owner}’s name`,
      built: 'has anything been built on it',
      tax: 'Has this year’s property tax been paid?',
      name: `${owner}’s name`,
    };
  return {
    khata: 'in the owner’s name',
    built: 'has anything been built on it',
    tax: 'Has this year’s property tax been paid?',
    name: 'the owner’s name',
  };
}

/** The questions to ask, in order, for this property (answered or not). */
export function pittuQuestions(ctx: PittuContext, answers: PittuAnswers): PittuQuestion[] {
  const owner = ctx.buyers.length ? ctx.buyers.join(' and ') : null;
  const match = matchBuyerName(ctx.account_name, ctx.buyers);
  const relation = match === 'match' ? 'owner' : answers.relation;
  const w = whose(relation, ctx.buyers[0] ?? null);
  const land = ctx.property_type === 'land';
  const living = answers.occupancy === 'self';
  const q: PittuQuestion[] = [];

  if (match !== 'match' && owner) {
    q.push({
      id: 'relation',
      title: `This deed is in ${owner}’s name. How are you related to this property?`,
      why: 'So we know who to keep updated about it.',
      options: [
        {
          value: 'owner',
          label: 'I’m the owner',
          reply: 'Lovely. I’ll keep you posted on everything about it.',
        },
        {
          value: 'joint',
          label: 'Joint owner',
          reply: 'Got it — we can keep all the owners updated.',
        },
        {
          value: 'family',
          label: 'It’s my family’s',
          reply: 'Thanks — we can share visit reports with your family too.',
        },
        {
          value: 'manage',
          label: 'I manage it for someone',
          reply: 'Kind of you. Regular updates will make that much easier.',
        },
      ],
    });
  }
  if (land) {
    q.push({
      id: 'plot_built',
      title: `Is it still a vacant plot, or ${w.built}?`,
      why: 'A lot can change since a deed was signed.',
      options: [
        {
          value: 'vacant',
          label: 'Still vacant',
          reply: 'Vacant plots need a watchful eye — I’ll suggest a regular site check.',
        },
        {
          value: 'house',
          label: 'We built a house',
          reply: 'Wonderful! We can help look after the house too.',
        },
        {
          value: 'building',
          label: 'Under construction',
          reply: 'Exciting! We can visit and report on progress for you.',
        },
        { value: 'unsure', label: 'Not sure', reply: 'No problem — we can go and check for you.' },
      ],
    });
  } else {
    q.push({
      id: 'occupancy',
      title: 'Who uses it today?',
      why: 'So we know what kind of care it needs.',
      options: [
        {
          value: 'self',
          label: 'I live there',
          reply: 'Lovely. We’ll keep its records and reminders in order.',
        },
        {
          value: 'rented',
          label: 'It’s rented out',
          reply: 'Got it — periodic checks are useful when it’s rented.',
        },
        {
          value: 'empty',
          label: 'It’s empty',
          reply: 'Empty homes need a watchful eye — we can visit regularly.',
        },
        {
          value: 'family',
          label: 'Family uses it',
          reply: 'Thanks — we can keep them in the loop too.',
        },
      ],
    });
  }
  if (!living) {
    q.push({
      id: 'last_visit',
      title: 'When did someone last see it in person?',
      why: 'Properties left unseen can quietly need attention.',
      options: [
        {
          value: 'recent',
          label: 'This year',
          reply: 'Good to hear. We can keep that going with regular visits.',
        },
        {
          value: 'years',
          label: '1–3 years ago',
          reply: 'It’s been a while — we can visit and send you photos.',
        },
        {
          value: 'long',
          label: 'Longer / can’t remember',
          reply: 'That’s alright — this is exactly what we’re here for.',
        },
      ],
    });
  }
  if (isKarnataka(ctx.state)) {
    q.push({
      id: 'khata_name',
      title: `Is the Khata${ctx.khata_number ? ` (${ctx.khata_number})` : ''} ${w.khata} yet?`,
      why: 'A Khata in the right name makes tax, loans and selling easier.',
      glossary: {
        label: 'What’s a Khata?',
        text: 'A Khata is your property’s record with the city or local body. You need it to pay property tax, take a loan or sell the property.',
        source: 'Karnataka',
      },
      options: [
        {
          value: 'yes',
          label: 'Yes, it is',
          reply: 'Perfect. Add the Khata copy to Documents any time.',
        },
        { value: 'no', label: 'Not yet', reply: `We can help get it transferred to ${w.name}.` },
        {
          value: 'unsure',
          label: 'Not sure',
          reply: 'No worries — we can check the records for you.',
        },
      ],
    });
  }
  if (isTelangana(ctx.state)) {
    q.push({
      id: 'ptin',
      title: 'Do you have the property tax number (PTIN)?',
      why: 'It’s how the city keeps track of the property’s tax.',
      glossary: {
        label: 'What’s a PTIN?',
        text: 'PTIN is the Property Tax Identification Number your city body (for example GHMC) gives the property. It’s on every tax bill and receipt.',
        source: 'Telangana',
      },
      options: [
        {
          value: 'yes',
          label: 'Yes, I have it',
          reply: 'Great — it’s on your tax receipt; add one below.',
        },
        { value: 'no', label: 'No', reply: 'We can find it or get one for you.' },
        { value: 'unsure', label: 'Not sure', reply: 'No worries — we can check for you.' },
      ],
    });
  }
  q.push({
    id: 'tax_paid',
    title: w.tax,
    why: 'We’ll keep track of it so you never miss a due date.',
    options: [
      { value: 'paid', label: 'Yes, it’s paid', reply: 'Lovely — you’re on top of it!' },
      {
        value: 'not_paid',
        label: 'Not yet',
        reply: 'No problem — Propittu can pay it for you on time.',
      },
      { value: 'unsure', label: 'Not sure', reply: 'We’ll check what’s due and let you know.' },
    ],
  });
  return q;
}

/** Is this a valid answer to a question for this property? (API validation) */
export function isValidAnswer(
  ctx: PittuContext,
  answers: PittuAnswers,
  id: string,
  value: string,
): boolean {
  if (value === 'skipped') return pittuQuestions(ctx, answers).some((q) => q.id === id);
  return pittuQuestions(ctx, answers).some(
    (q) => q.id === id && q.options.some((o) => o.value === value),
  );
}

/* ------------------------------------------------------------------ *
 * Documents checklist and care plan
 * ------------------------------------------------------------------ */

export interface ChecklistItem {
  document_type: string;
  label: string;
  have: boolean;
  hint: string;
}

export function documentChecklist(ctx: PittuContext): ChecklistItem[] {
  const has = (t: string) => ctx.documents.includes(t);
  const items: ChecklistItem[] = [
    {
      document_type: 'sale_deed',
      label: 'Sale Deed',
      have: has('sale_deed'),
      hint: has('sale_deed') ? 'Read by Pittu' : 'The key document',
    },
    {
      document_type: 'property_tax',
      label: 'Property tax receipt',
      have: has('property_tax'),
      hint: has('property_tax') ? 'Uploaded' : 'The latest one',
    },
  ];
  if (isKarnataka(ctx.state)) {
    items.push({
      document_type: 'khata',
      label: 'Khata certificate',
      have: has('khata'),
      hint: has('khata') ? 'Uploaded' : 'Or the e-Khata',
    });
  }
  return items;
}

export interface CareItem {
  /** Catalogue service code it books. */
  service_code: string;
  title: string;
  reason: string;
  because: string;
  /** Lawyer review may be needed (shown up front). */
  legal: boolean;
}

/** Up to three services, most important first, each with its reason. */
export function carePlan(ctx: PittuContext, answers: PittuAnswers): CareItem[] {
  const w = whose(
    matchBuyerName(ctx.account_name, ctx.buyers) === 'match' ? 'owner' : answers.relation,
    ctx.buyers[0] ?? null,
  );
  const items: CareItem[] = [];
  if (answers.khata_name === 'no' || answers.khata_name === 'unsure') {
    items.push({
      service_code: 'khata_mutation_assistance',
      title: 'Khata transfer help',
      reason: `We guide you and handle the paperwork to get the Khata in ${w.name}.`,
      because:
        answers.khata_name === 'no'
          ? `Because the Khata isn’t in ${w.name} yet`
          : 'Because you weren’t sure whose name it’s in',
      legal: true,
    });
  }
  if (answers.tax_paid === 'not_paid' || answers.tax_paid === 'unsure' || answers.ptin === 'no') {
    items.push({
      service_code: 'property_tax_assistance',
      title: 'Property tax, handled',
      reason: 'We check what’s due, pay it on time and save the receipt to Documents.',
      because:
        answers.tax_paid === 'not_paid'
          ? 'Because this year’s tax isn’t paid yet'
          : 'Because the tax details need checking',
      legal: false,
    });
  }
  const vacant = answers.plot_built === 'vacant' || answers.plot_built === 'unsure';
  const unseen = answers.last_visit === 'years' || answers.last_visit === 'long';
  if (vacant) {
    items.push({
      service_code: 'site_inspection',
      title: 'Site check',
      reason:
        'We visit, take photos and report anything unusual — encroachment, dumping or damage.',
      because:
        answers.plot_built === 'vacant'
          ? 'Because it’s a vacant plot'
          : 'Because you weren’t sure what’s on the plot',
      legal: false,
    });
  } else if (answers.plot_built === 'building') {
    items.push({
      service_code: 'site_inspection',
      title: 'Construction progress visit',
      reason: 'We visit the site and send photos and a short progress report.',
      because: 'Because it’s under construction',
      legal: false,
    });
  } else if (unseen || answers.occupancy === 'empty' || answers.occupancy === 'rented') {
    items.push({
      service_code: 'property_visit',
      title: 'Property visit',
      reason: 'We visit, take photos and tell you how it looks.',
      because: unseen
        ? 'Because nobody has seen it for a while'
        : answers.occupancy === 'empty'
          ? 'Because it’s empty'
          : 'Because it’s rented out',
      legal: false,
    });
  }
  if (answers.plot_built === 'house') {
    items.push({
      service_code: 'maintenance',
      title: 'Maintenance check',
      reason: 'We look for leaks, cracks and wear, and arrange repairs if you want.',
      because: 'Because it’s a house now',
      legal: false,
    });
  }
  if (answers.plot_built === 'vacant') {
    items.push({
      service_code: 'property_cleaning',
      title: 'Plot cleaning',
      reason: 'Keeping it clear avoids overgrowth and complaints from neighbours.',
      because: 'Because empty plots get overgrown',
      legal: false,
    });
  }
  return items.slice(0, 3);
}

/** GET /properties/:id/pittu */
export interface PittuState {
  context: PittuContext;
  answers: PittuAnswers;
}

/* ------------------------------------------------------------------ *
 * Staff review (Backoffice → Pittu → Review list)
 *
 * A property lands on the Review list when something about it deserves
 * a human look. Fixed rules, re-checked whenever the customer finishes
 * setup or answers a question; a reviewed property reopens only when a
 * NEW reason appears.
 * ------------------------------------------------------------------ */

export const REVIEW_REASONS = [
  'name_mismatch',
  'not_owner',
  'type_changed',
  'low_confidence',
] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

export const REVIEW_REASON_LABELS: Record<ReviewReason, string> = {
  name_mismatch: 'Name differs from the deed',
  not_owner: 'Not the owner (family / manages it)',
  type_changed: 'Property type changed',
  low_confidence: 'Unsure values accepted',
};

/** One deed fact as the review rule needs it. */
export interface ReviewFact {
  key: string;
  status: string;
  confidence: string | null;
}

export function reviewReasons(
  ctx: PittuContext,
  answers: PittuAnswers,
  facts: ReviewFact[],
): ReviewReason[] {
  const reasons: ReviewReason[] = [];
  const match = matchBuyerName(ctx.account_name, ctx.buyers);
  // Answered "owner" despite a different name → still worth a look.
  if (match === 'no_match') reasons.push('name_mismatch');
  if (match !== 'match' && (answers.relation === 'family' || answers.relation === 'manage')) {
    reasons.push('not_owner');
  }
  if (facts.some((f) => f.key === 'property_kind' && f.status === 'edited')) {
    reasons.push('type_changed');
  }
  if (facts.some((f) => f.confidence === 'low' && f.status === 'confirmed')) {
    reasons.push('low_confidence');
  }
  return reasons;
}

/** Short question names for staff screens. */
export const PITTU_QUESTION_LABELS: Record<PittuQuestionId, string> = {
  relation: 'Relation to property',
  plot_built: 'Plot built?',
  occupancy: 'Who lives there',
  last_visit: 'Last seen',
  khata_name: 'Khata in owner’s name',
  ptin: 'PTIN',
  tax_paid: 'Tax paid this year',
};

export type PropertyReviewStatus = 'open' | 'done';

export interface PropertyReview {
  property_id: string;
  account_id: string;
  reasons: ReviewReason[];
  status: PropertyReviewStatus;
  note: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** GET /backoffice/ai/reviews */
export interface ReviewListItem extends PropertyReview {
  property_name: string;
  customer_phone: string | null;
}

/** Pittu section of GET /backoffice/properties/:id */
export interface BackofficePittu {
  review: PropertyReview | null;
  answers: PittuAnswers;
  facts: {
    key: string;
    value: unknown;
    final_value: unknown;
    status: string;
    confidence: string | null;
    pages: number[];
  }[];
}
