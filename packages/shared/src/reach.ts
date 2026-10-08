import { z } from 'zod';
import { INDIAN_PINCODE_REGEX } from './constants';

/**
 * Where we can serve (migration 21). A property can be added anywhere;
 * what depends on its location is which services reach it:
 *
 *   area        our team visits → PIN code in an active service area
 *   state       paperwork help  → property in an active service state
 *   everywhere  no location needed
 *
 * The database decides (property_reach / create_service_request); this
 * file only shares the shapes and wording so the app explains it.
 */

export const SERVICE_REACHES = ['area', 'state', 'everywhere'] as const;
export type ServiceReach = (typeof SERVICE_REACHES)[number];
export const SERVICE_REACH_LABELS: Record<ServiceReach, string> = {
  area: 'Service areas (PIN codes)',
  state: 'Service states',
  everywhere: 'Everywhere',
};

/** What reaches one property (GET /properties, /properties/:id). */
export interface PropertyReach {
  /** Our team can visit (PIN in an active area, or a staff exception). */
  visits: boolean;
  /** Paperwork help is offered in this property's state. */
  paperwork: boolean;
  area_name: string | null;
  /** State as worked out from the PIN prefix (or the typed state). */
  state: string | null;
  has_pincode: boolean;
  /** Staff chose to serve this property although it is outside our areas. */
  exception: boolean;
  /** The customer asked to hear when we arrive. */
  interested: boolean;
  /** Services that reach this property (coverage by PIN code, or a staff exception). */
  service_ids?: string[];
}

export type ReachProblem = 'not_in_area' | 'no_pincode' | 'not_in_state';

/** Why a service cannot be delivered at this property (null = it can). */
export function reachProblem(
  service: { id?: string; reach: ServiceReach; fulfilment?: 'visit' | 'assistance' },
  reach: PropertyReach | null | undefined,
): ReachProblem | null {
  if (!reach) return null;
  // Coverage by PIN code: the server lists the services that reach the property.
  if (reach.service_ids && service.id) {
    if (reach.service_ids.includes(service.id)) return null;
    if (!reach.has_pincode) return 'no_pincode';
    return service.fulfilment === 'assistance' ? 'not_in_state' : 'not_in_area';
  }
  if (service.reach === 'everywhere') return null;
  if (service.reach === 'area' && !reach.visits) {
    return reach.has_pincode ? 'not_in_area' : 'no_pincode';
  }
  if (service.reach === 'state' && !reach.paperwork) return 'not_in_state';
  return null;
}

export const REACH_PROBLEM_LABELS: Record<ReachProblem, string> = {
  not_in_area: 'Not in your area yet',
  no_pincode: 'Add the PIN code to check',
  not_in_state: 'Not in this state yet',
};

export const REACH_PROBLEM_TEXT: Record<ReachProblem, string> = {
  not_in_area:
    'Our team doesn’t visit this area yet. Everything else in the app works as usual — we’ll tell you when we arrive.',
  no_pincode: 'Add this property’s PIN code so we can check which services reach it.',
  not_in_state: 'We don’t offer paperwork help in this state yet.',
};

/* ------------------------------------------------------------------ *
 * Backoffice: areas, states, demand, exceptions
 * ------------------------------------------------------------------ */

/** Properties our team cannot visit yet, by PIN code. */
export interface ReachDemand {
  pincode: string | null;
  place: string | null;
  properties: number;
  interested: number;
}

/** Staff property screen. */
export interface StaffPropertyReach extends PropertyReach {
  exception_reason: string | null;
}

const pincode = z.string().trim().regex(INDIAN_PINCODE_REGEX, 'Enter valid 6-digit PIN codes');

/** Accepts "560001, 560002 560003" or a list; de-duplicated. */
const pincodeList = z.preprocess(
  (v) => (typeof v === 'string' ? v.split(/[\s,;]+/).filter(Boolean) : v),
  z.array(pincode).min(1, 'Enter at least one PIN code').max(2000),
);

/* ------------------------------------------------------------------ *
 * Coverage by PIN code (Backoffice portal)
 * ------------------------------------------------------------------ */

/** One PIN from India's directory (GET /pincodes/:pin). */
export interface PincodeInfo {
  pincode: string;
  place: string;
  district: string;
  state: string;
  localities: string[];
}

/** GET /backoffice/pincodes */
export interface PincodeRow extends PincodeInfo {
  /** Live zones that include it. */
  zones: string[];
  properties: number;
}
export interface PincodePage {
  rows: PincodeRow[];
  total: number;
}

/** GET /backoffice/coverage/summary — per state and district. */
export interface CoverageSummaryRow {
  state: string;
  district: string;
  pins: number;
  /** PINs inside at least one live zone. */
  covered: number;
  properties: number;
}

export const ZONE_RULE_KINDS = ['state', 'district', 'pincode', 'exclude'] as const;
export type ZoneRuleKind = (typeof ZONE_RULE_KINDS)[number];

/** GET /backoffice/zones */
export interface CoverageZone {
  id: string;
  name: string;
  is_active: boolean;
  /** state: "Karnataka"; district: "Bangalore|Karnataka"; pincode / exclude: "560038". */
  rules: { id: string; kind: ZoneRuleKind; value: string }[];
  pin_count: number;
  properties: number;
  services: { id: string; name: string }[];
}

export const SERVICE_COVERAGE_KINDS = [
  'everywhere',
  'zone',
  'state',
  'district',
  'pincode',
] as const;
export type ServiceCoverageKind = (typeof SERVICE_COVERAGE_KINDS)[number];

/** GET /backoffice/services/:id/coverage */
export interface ServiceCoverage {
  rules: { kind: ServiceCoverageKind; value: string }[];
  everywhere: boolean;
  pins: number;
  properties: number;
}

const ruleValue = z.string().trim().min(1).max(120);
export const zoneCreateSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(60),
});
export const zoneUpdateSchema = z
  .object({ name: z.string().trim().min(1).max(60), is_active: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
/** POST /backoffice/zones/:id/rules — add states, districts, PINs or exclusions. */
export const zoneRulesSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.enum(['state', 'district']), values: z.array(ruleValue).min(1).max(100) }),
  z.object({ kind: z.enum(['pincode', 'exclude']), values: pincodeList }),
]);
/** PUT /backoffice/services/:id/coverage — the full list replaces what was there. */
export const serviceCoverageSchema = z.object({
  rules: z
    .array(z.object({ kind: z.enum(SERVICE_COVERAGE_KINDS), value: z.string().trim().max(120) }))
    .max(2000),
});

export const reachExceptionSchema = z.object({
  reason: z.string().trim().min(3, 'Say why this property is served').max(500),
});
