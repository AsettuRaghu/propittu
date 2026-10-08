import type { EcEntry, EcReading, LegalFinding } from '@propittu/shared';

/**
 * Pittu Legal — EC check rules (application layer, no AI, no database).
 * Compares Pittu Read's EC reading with the sale deed and lists findings
 * (green / amber / red) for staff to review. Wording reports what the
 * records show; it never certifies a title.
 *
 * Bump RULES_VERSION whenever a rule or its wording changes.
 */
export const RULES_VERSION = 'ec-rules-v1';

/** What we know from the sale deed (Pittu Read, as confirmed by the customer). */
export interface DeedFacts {
  buyers: string[];
  sellers: string[];
  registration_number: string | null;
  registration_date: string | null; // YYYY-MM-DD
  survey_numbers: string[];
  village: string | null;
}

const YEARS_RECOMMENDED = 30;
const TITLES = /\b(sri|smt|shri|kum|mr|mrs|ms|dr|m\/s|late)\b\.?/g;

/** "Sri. RAVI  Kumar" → "ravi kumar" */
const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(TITLES, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Same person or company? Tolerant of order, initials and spelling of extra words. */
export function sameName(a: string, b: string): boolean {
  const x = clean(a);
  const y = clean(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const tx = x.split(' ').filter((t) => t.length > 1);
  const ty = new Set(y.split(' ').filter((t) => t.length > 1));
  if (!tx.length || !ty.size) return false;
  const common = tx.filter((t) => ty.has(t)).length;
  return common / Math.min(tx.length, ty.size) >= 0.6 && common >= Math.min(2, tx.length, ty.size);
}
const anyMatch = (as: string[], bs: string[]) => as.some((a) => bs.some((b) => sameName(a, b)));

/** "ANK-1-06832-2005-06" vs "06832/2005-06": compare the digits that identify it. */
function sameDocument(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const digits = (s: string) => (s.match(/\d+/g) ?? []).filter((d) => d.length >= 3);
  const da = digits(a);
  const db = new Set(digits(b));
  return da.length > 0 && da.filter((d) => db.has(d)).length >= Math.min(2, da.length);
}

const normSurvey = (s: string) => s.toLowerCase().replace(/[^a-z0-9/]/g, '');
const ev = (e: EcEntry) => ({
  document_number: e.document_number,
  registration_date: e.registration_date,
  pages: e.pages,
});
const finding = (f: Omit<LegalFinding, 'review' | 'staff_note'>): LegalFinding => ({
  ...f,
  review: 'open',
  staff_note: null,
});
const fmtDate = (d: string | null) => d ?? 'an unknown date';
const who = (names: string[]) => (names.length ? names.join(', ') : 'someone not named');

const TRANSFERS = new Set(['gift', 'partition', 'settlement', 'agreement', 'power_of_attorney']);

export function checkEc(ec: EcReading, deed: DeedFacts, today = new Date()): LegalFinding[] {
  const out: LegalFinding[] = [];
  const entries = [...ec.entries].sort((a, b) =>
    (a.registration_date ?? '').localeCompare(b.registration_date ?? ''),
  );

  // 1. Does the EC cover enough years?
  if (!ec.period_from || !ec.period_to) {
    out.push(
      finding({
        code: 'ec_period_unknown',
        level: 'amber',
        title: 'The period the EC covers is not clear',
        detail: 'We could not read the start or end of the search period. Check it on the EC.',
        evidence: [],
      }),
    );
  } else {
    const from = Date.parse(ec.period_from);
    const years = (today.getTime() - from) / (365.25 * 86_400_000);
    if (years < YEARS_RECOMMENDED - 0.5) {
      out.push(
        finding({
          code: 'ec_period_short',
          level: 'amber',
          title: `The EC covers about ${Math.max(1, Math.round(years))} years; ${YEARS_RECOMMENDED} are recommended`,
          detail: `Transactions before ${ec.period_from} are not checked. A ${YEARS_RECOMMENDED}-year EC gives a fuller history.`,
          evidence: [],
        }),
      );
    }
  }

  // 2. Is it the same property as the deed?
  if (deed.survey_numbers.length && ec.survey_numbers.length) {
    const want = deed.survey_numbers.map(normSurvey);
    const got = ec.survey_numbers.map(normSurvey);
    const overlap = want.some((w) =>
      got.some((g) => g === w || g.startsWith(w) || w.startsWith(g)),
    );
    const villageOk =
      !deed.village ||
      !ec.village ||
      sameName(deed.village, ec.village) ||
      clean(ec.village).includes(clean(deed.village));
    if (!overlap || !villageOk) {
      out.push(
        finding({
          code: 'property_mismatch',
          level: 'amber',
          title: 'The EC may be for a different survey number or village',
          detail: `The deed names survey no. ${deed.survey_numbers.join(', ')}${deed.village ? ` in ${deed.village}` : ''}; the EC was searched for ${ec.survey_numbers.join(', ')}${ec.village ? ` in ${ec.village}` : ''}. Check that the EC is for this property.`,
          evidence: [],
        }),
      );
    }
  }

  // 3. Is the customer's purchase on the EC?
  const deedDate = deed.registration_date;
  const inPeriod =
    !!deedDate &&
    (!ec.period_from || deedDate >= ec.period_from) &&
    (!ec.period_to || deedDate <= ec.period_to);
  const sales = entries.filter((e) => e.kind === 'sale');
  const purchase =
    sales.find((e) => sameDocument(e.document_number, deed.registration_number)) ??
    sales.find(
      (e) =>
        anyMatch(e.to_parties, deed.buyers) &&
        (!deedDate || !e.registration_date || e.registration_date === deedDate),
    );
  if (ec.nil_encumbrance && inPeriod) {
    out.push(
      finding({
        code: 'nil_but_purchase_expected',
        level: 'red',
        title: 'The EC shows no transactions, but your purchase should appear on it',
        detail: `Your deed was registered on ${deedDate}, inside the period searched. The EC may be for the wrong survey number or office — or the registration needs checking.`,
        evidence: [],
      }),
    );
  } else if (purchase) {
    out.push(
      finding({
        code: 'purchase_found',
        level: 'green',
        title: 'Your purchase is recorded on the EC',
        detail: `A sale to ${who(purchase.to_parties)} on ${fmtDate(purchase.registration_date)} (document ${purchase.document_number ?? 'number not read'}).`,
        evidence: [ev(purchase)],
      }),
    );
  } else if (deedDate && !inPeriod) {
    out.push(
      finding({
        code: 'purchase_outside_period',
        level: 'amber',
        title: 'Your purchase date is outside the period this EC covers',
        detail: `The deed was registered on ${deedDate}; the EC covers ${ec.period_from ?? '?'} to ${ec.period_to ?? '?'}. Get an EC that includes the purchase.`,
        evidence: [],
      }),
    );
  } else if (!ec.nil_encumbrance) {
    out.push(
      finding({
        code: 'purchase_missing',
        level: 'red',
        title: 'We could not find your purchase on the EC',
        detail: `No sale to ${who(deed.buyers)}${deed.registration_number ? ` (document ${deed.registration_number})` : ''} is listed. Check the EC entries and the registration.`,
        evidence: [],
      }),
    );
  }

  // 4. The chain before the purchase: did the seller buy it, and is each sale linked?
  const before = sales.filter(
    (e) => !purchase || (e.registration_date ?? '') < (purchase.registration_date ?? ''),
  );
  const previous = before.at(-1);
  if (purchase && previous) {
    const sellersOk = anyMatch(
      purchase.from_parties.length ? purchase.from_parties : deed.sellers,
      previous.to_parties,
    );
    out.push(
      sellersOk
        ? finding({
            code: 'seller_matches_chain',
            level: 'green',
            title: 'Your seller had bought the property before selling it to you',
            detail: `${who(previous.to_parties)} bought it on ${fmtDate(previous.registration_date)} and sold it to you.`,
            evidence: [ev(previous), ev(purchase)],
          })
        : finding({
            code: 'seller_not_previous_buyer',
            level: 'amber',
            title: 'Your seller is not the buyer of the previous sale on the EC',
            detail: `The previous sale (${fmtDate(previous.registration_date)}) was to ${who(previous.to_parties)}; your seller was ${who(purchase.from_parties.length ? purchase.from_parties : deed.sellers)}. There may be an inheritance, gift or partition in between, or a gap to check.`,
            evidence: [ev(previous), ev(purchase)],
          }),
    );
  }
  for (let i = 1; i < before.length; i++) {
    const a = before[i - 1]!;
    const b = before[i]!;
    if (!anyMatch(b.from_parties, a.to_parties)) {
      out.push(
        finding({
          code: 'chain_break',
          level: 'amber',
          title: 'A gap in the chain of owners',
          detail: `The sale on ${fmtDate(b.registration_date)} was by ${who(b.from_parties)}, but the sale before it (${fmtDate(a.registration_date)}) was to ${who(a.to_parties)}.`,
          evidence: [ev(a), ev(b)],
        }),
      );
    }
  }

  // 5. Mortgages: is each one released?
  const mortgages = entries.filter((e) => e.kind === 'mortgage');
  const releases = entries.filter((e) => e.kind === 'release');
  const released = (m: EcEntry) =>
    releases.some(
      (r) =>
        (r.registration_date ?? '') >= (m.registration_date ?? '') &&
        (anyMatch(r.from_parties, m.to_parties) || anyMatch(r.to_parties, m.from_parties)),
    );
  const afterPurchase = (e: EcEntry) =>
    !!deedDate && !!e.registration_date && e.registration_date > deedDate;
  for (const m of mortgages.filter((x) => !released(x))) {
    const own = anyMatch(m.from_parties, deed.buyers);
    if (
      afterPurchase(m) ||
      (purchase && (m.registration_date ?? '') > (purchase.registration_date ?? ''))
    ) {
      out.push(
        own
          ? finding({
              code: 'own_mortgage_open',
              level: 'amber',
              title: `Your loan with ${who(m.to_parties)} shows no release on the EC`,
              detail: `A mortgage by you on ${fmtDate(m.registration_date)}. If the loan is repaid, register the release so the EC shows the property as free.`,
              evidence: [ev(m)],
            })
          : finding({
              code: 'later_mortgage_open',
              level: 'red',
              title: `A mortgage after your purchase, by ${who(m.from_parties)}`,
              detail: `Registered on ${fmtDate(m.registration_date)} to ${who(m.to_parties)}, with no release. You did not make it — this needs checking now.`,
              evidence: [ev(m)],
            }),
      );
    } else {
      out.push(
        finding({
          code: 'mortgage_open_before_purchase',
          level: 'amber',
          title: `An earlier mortgage shows no release (${who(m.from_parties)} to ${who(m.to_parties)})`,
          detail: `Registered on ${fmtDate(m.registration_date)}. If it was repaid before your purchase, the release may simply be missing from the EC; otherwise it may still be a charge on the property.`,
          evidence: [ev(m)],
        }),
      );
    }
  }

  // 6. Anything else after the purchase.
  const later = entries.filter((e) => afterPurchase(e) && e !== purchase);
  for (const e of later) {
    const byCustomer = anyMatch(e.from_parties, deed.buyers);
    if (e.kind === 'sale') {
      out.push(
        finding({
          code: 'later_sale',
          level: 'red',
          title: byCustomer
            ? 'A later sale by you is recorded'
            : `A sale after your purchase, by ${who(e.from_parties)}`,
          detail: `Registered on ${fmtDate(e.registration_date)} to ${who(e.to_parties)} (document ${e.document_number ?? 'number not read'}).${byCustomer ? ' If you did not sell, this needs checking now.' : ' You are not the seller — this needs checking now.'}`,
          evidence: [ev(e)],
        }),
      );
    } else if (TRANSFERS.has(e.kind) && !byCustomer) {
      out.push(
        finding({
          code: 'later_transfer',
          level: 'red',
          title: `A ${e.kind_as_written ?? e.kind} after your purchase, by ${who(e.from_parties)}`,
          detail: `Registered on ${fmtDate(e.registration_date)}. You are not a party to it — this needs checking.`,
          evidence: [ev(e)],
        }),
      );
    }
  }
  if (purchase && !later.length && !mortgages.some((m) => afterPurchase(m) && !released(m))) {
    out.push(
      finding({
        code: 'clear_after_purchase',
        level: 'green',
        title: 'Nothing else registered on the property since your purchase',
        detail: `Up to ${ec.period_to ?? 'the end of the period searched'}.`,
        evidence: [],
      }),
    );
  }

  // 7. Court orders at any time.
  for (const e of entries.filter((x) => x.kind === 'court_order')) {
    out.push(
      finding({
        code: 'court_order',
        level: 'red',
        title: 'A court order or attachment is recorded on the property',
        detail: `On ${fmtDate(e.registration_date)}${e.kind_as_written ? ` (${e.kind_as_written})` : ''}. A lawyer should look at it.`,
        evidence: [ev(e)],
      }),
    );
  }

  // 8. Entries Pittu was unsure about.
  const unsure = entries.filter((e) => e.confidence === 'low');
  if (unsure.length) {
    out.push(
      finding({
        code: 'low_confidence_entries',
        level: 'amber',
        title: `${unsure.length} entr${unsure.length > 1 ? 'ies were' : 'y was'} hard to read`,
        detail: 'Check them against the EC before relying on this report.',
        evidence: unsure.map(ev),
      }),
    );
  }

  const order = { red: 0, amber: 1, green: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
