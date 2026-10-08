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
}

export type ReachProblem = 'not_in_area' | 'no_pincode' | 'not_in_state';

/** Why a service cannot be delivered at this property (null = it can). */
export function reachProblem(
  service: { reach: ServiceReach },
  reach: PropertyReach | null | undefined,
): ReachProblem | null {
  if (service.reach === 'everywhere' || !reach) return null;
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

export interface ServiceArea {
  id: string;
  name: string;
  state: string;
  is_active: boolean;
  pincodes: string[];
}

export interface ServiceState {
  state: string;
  pincode_prefixes: string[];
  is_active: boolean;
}

/** Properties our team cannot visit yet, by PIN code. */
export interface ReachDemand {
  pincode: string | null;
  place: string | null;
  properties: number;
  interested: number;
}

/** GET /backoffice/coverage */
export interface BackofficeCoverage {
  /** properties: how many customer properties fall in the area / state. */
  areas: (ServiceArea & { properties: number })[];
  states: (ServiceState & { properties: number })[];
  demand: ReachDemand[];
}

/** Staff property screen. */
export interface StaffPropertyReach extends PropertyReach {
  exception_reason: string | null;
}

const pincode = z.string().trim().regex(INDIAN_PINCODE_REGEX, 'Enter valid 6-digit PIN codes');
const placeName = z.string().trim().min(1, 'Enter a name').max(60);

export const createAreaSchema = z.object({ name: placeName, state: placeName });
export const updateAreaSchema = z
  .object({ name: placeName, is_active: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

/** Accepts "560001, 560002 560003" or a list; de-duplicated. */
export const areaPincodesSchema = z.object({
  pincodes: z.preprocess(
    (v) => (typeof v === 'string' ? v.split(/[\s,;]+/).filter(Boolean) : v),
    z.array(pincode).min(1, 'Enter at least one PIN code').max(500),
  ),
});

const prefixes = z
  .array(z.string().regex(/^[1-9][0-9]{0,2}$/, 'PIN prefixes are 1–3 digits'))
  .max(20);
export const createStateSchema = z.object({ state: placeName, pincode_prefixes: prefixes });
export const updateStateSchema = z
  .object({ is_active: z.boolean(), pincode_prefixes: prefixes })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const reachExceptionSchema = z.object({
  reason: z.string().trim().min(3, 'Say why this property is served').max(500),
});
