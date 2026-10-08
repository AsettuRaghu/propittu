import { z } from 'zod';
import {
  ACCOUNT_STATUSES,
  ALLOWED_PHOTO_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
  DOCUMENT_STATUSES,
  ALLOWED_DOCUMENT_MIME_TYPES,
  DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  MAX_PHOTO_BYTES,
  MAX_VIDEO_BYTES,
  SERVICE_REQUEST_STATUS_LABELS,
  SERVICE_REQUEST_STATUSES,
  type AccountStatus,
  type DocumentType,
  type ServiceRequestStatus,
  type StaffRole,
} from './constants';
import type { Order } from './billing';
import type { AccountPlanState } from './plans';
import type { BackofficePittu } from './pittu';
import { SERVICE_REACHES, type StaffPropertyReach } from './reach';
import type {
  Property,
  PropertyDocument,
  PropertyPhoto,
  PropertySummary,
  Service,
  ServiceRequest,
} from './types';

/**
 * Property Care & Services (M4) and Backoffice (M9) — shared vocabulary.
 *
 *   Service Catalogue → Included Services (Plan Benefit) → Service Request
 *
 * The database is the final authority on lifecycle and usage
 * (staff_update_service_request); these mirrors let the API answer with
 * clear errors and the app show only valid actions.
 */

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

/**
 * How a service is delivered (2026-10-06):
 *   visit       on-site: Requested → Confirmed → Scheduled → In progress →
 *               Completed, with a visit report.
 *   assistance  paperwork help: Requested → Accepted → Working on it ⇄
 *               Need info from you → Completed, with an outcome summary and
 *               result files saved to the property's Documents.
 */
export const SERVICE_FULFILMENTS = ['visit', 'assistance'] as const;
export type ServiceFulfilment = (typeof SERVICE_FULFILMENTS)[number];
export const SERVICE_FULFILMENT_LABELS: Record<ServiceFulfilment, string> = {
  visit: 'On-site visit',
  assistance: 'Paperwork help',
};

type Transitions = Record<ServiceRequestStatus, ServiceRequestStatus[]>;
const VISIT_TRANSITIONS: Transitions = {
  requested: ['confirmed', 'cancelled'],
  confirmed: ['scheduled', 'in_progress', 'completed', 'cancelled'],
  scheduled: ['scheduled', 'in_progress', 'completed', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  awaiting_customer: [],
  completed: [],
  cancelled: [],
};
const ASSISTANCE_TRANSITIONS: Transitions = {
  requested: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'awaiting_customer', 'completed', 'cancelled'],
  scheduled: [],
  in_progress: ['awaiting_customer', 'completed', 'cancelled'],
  awaiting_customer: ['in_progress', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/** Mirrors request_transitions() in the database (the authority). */
export function requestTransitions(
  fulfilment: ServiceFulfilment,
  status: ServiceRequestStatus,
): ServiceRequestStatus[] {
  return (fulfilment === 'assistance' ? ASSISTANCE_TRANSITIONS : VISIT_TRANSITIONS)[status];
}

/** Status wording that fits the kind of work (no "visit" talk for paperwork). */
export function requestStatusLabel(
  status: ServiceRequestStatus,
  fulfilment: ServiceFulfilment = 'visit',
): string {
  if (fulfilment === 'assistance') {
    if (status === 'confirmed') return 'Accepted';
    if (status === 'in_progress') return 'Working on it';
  }
  return SERVICE_REQUEST_STATUS_LABELS[status];
}

/* ------------------------------------------------------------------ *
 * Per-service payment and cancellation rules (migration 20261007000005)
 * ------------------------------------------------------------------ */

export const PAYMENT_TIMINGS = ['upfront', 'on_confirmation', 'on_completion'] as const;
export type PaymentTiming = (typeof PAYMENT_TIMINGS)[number];
export const PAYMENT_TIMING_LABELS: Record<PaymentTiming, string> = {
  upfront: 'Pay when booking',
  on_confirmation: 'Pay once we confirm',
  on_completion: 'Pay after the work is done',
};

export const CANCEL_POLICIES = ['until_confirmed', 'never'] as const;
export type CancelPolicy = (typeof CANCEL_POLICIES)[number];
export const CANCEL_POLICY_LABELS: Record<CancelPolicy, string> = {
  until_confirmed: 'Can be cancelled until we confirm',
  never: 'Cannot be cancelled once requested',
};

/** Where a request's payment stands, for the customer. */
export type RequestPayment =
  | { state: 'included' }
  | { state: 'quote_pending' }
  | { state: 'due'; amount: number }
  | { state: 'later'; amount: number; timing: PaymentTiming }
  | { state: 'paid'; amount: number; orderId: string }
  | { state: 'none' };

export function requestPayment(r: {
  coverage: 'included' | 'extra';
  price_paise: number | null;
  status: ServiceRequestStatus;
  payment_timing: PaymentTiming;
  order?: { id: string; status: string } | null;
}): RequestPayment {
  if (r.coverage === 'included') return { state: 'included' };
  if (r.order?.status === 'paid')
    return { state: 'paid', amount: r.price_paise ?? 0, orderId: r.order.id };
  if (r.status === 'cancelled') return { state: 'none' };
  if (r.price_paise === null) return { state: 'quote_pending' };
  const open =
    r.payment_timing === 'upfront' ||
    (r.payment_timing === 'on_confirmation' && r.status !== 'requested') ||
    (r.payment_timing === 'on_completion' && r.status === 'completed');
  return open
    ? { state: 'due', amount: r.price_paise }
    : { state: 'later', amount: r.price_paise, timing: r.payment_timing };
}

/** When the work should be done: the visit date once scheduled, else start + usual days. */
export function requestExpectedBy(r: {
  scheduled_for: string | null;
  confirmed_at: string | null;
  created_at: string;
  service: { expected_days: number | null };
}): string | null {
  if (r.scheduled_for) return r.scheduled_for;
  const days = r.service.expected_days;
  if (!days) return null;
  return new Date(
    new Date(r.confirmed_at ?? r.created_at).getTime() + days * 86_400_000,
  ).toISOString();
}

/** The customer may cancel only while Requested, if the request allows it, and never plan-included ones. */
export const canCustomerCancel = (r: {
  status: ServiceRequestStatus;
  coverage: 'included' | 'extra';
  cancel_policy: CancelPolicy;
}) =>
  r.status === 'requested' && r.coverage !== 'included' && r.cancel_policy === 'until_confirmed';

export const OPEN_REQUEST_STATUSES: ServiceRequestStatus[] = [
  'requested',
  'confirmed',
  'scheduled',
  'in_progress',
  'awaiting_customer',
];

export const PREFERRED_SLOTS = ['morning', 'afternoon', 'evening'] as const;
export type PreferredSlot = (typeof PREFERRED_SLOTS)[number];
export const PREFERRED_SLOT_LABELS: Record<PreferredSlot, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};
export const PREFERRED_SLOT_HOURS: Record<PreferredSlot, string> = {
  morning: '9 am – 12 pm',
  afternoon: '12 – 4 pm',
  evening: '4 – 7 pm',
};

/** Shown in the catalogue for the signed-in Account (GET /services). */
export interface CatalogueService extends Service {
  /** The category's name and position, so the app can group services without a list in code. */
  category_name: string;
  category_order: number;
  coverage: 'included' | 'extra' | 'unavailable';
  /** Included allowance left (null when the Plan does not include it). */
  included_remaining: number | null;
}

/* ------------------------------------------------------------------ *
 * Property Visit report
 * ------------------------------------------------------------------ */

export const VISIT_CONDITIONS = ['good', 'fair', 'needs_attention'] as const;
export type VisitCondition = (typeof VISIT_CONDITIONS)[number];
export const VISIT_CONDITION_LABELS: Record<VisitCondition, string> = {
  good: 'Good',
  fair: 'Fair',
  needs_attention: 'Needs attention',
};

export interface VisitMedia {
  id: string;
  kind: 'photo' | 'video';
  mime_type: string;
  /** Short-lived signed URL. */
  url: string | null;
  created_at: string;
}

export interface VisitReport {
  id: string;
  visited_at: string;
  condition: VisitCondition;
  observations: string;
  issues: string;
  recommendations: string;
  updated_at: string;
  media: VisitMedia[];
}

/* ------------------------------------------------------------------ *
 * Paperwork help: outcome summary + result files
 * ------------------------------------------------------------------ */

export interface OutcomeFile {
  id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  /** Saved into the property's Documents as this type on completion. */
  document_type: DocumentType | null;
  /** True once it has been saved into Documents. */
  saved_to_documents: boolean;
  /** Short-lived signed URL. */
  url: string | null;
}

export interface ServiceOutcome {
  id: string;
  summary: string;
  findings: string;
  reference_number: string | null;
  next_due_date: string | null;
  updated_at: string;
  files: OutcomeFile[];
}

/** The support ticket where staff asked the customer for information. */
export interface RequestInfoThread {
  id: string;
  reference: string;
}

export interface ServiceRequestDetail extends ServiceRequest {
  report: VisitReport | null;
  outcome: ServiceOutcome | null;
  info_ticket: RequestInfoThread | null;
  /** Latest payment order for an Extra Service (null when none). */
  order: Order | null;
}

/* ------------------------------------------------------------------ *
 * Backoffice permissions (M9). super_admin can do everything.
 * ------------------------------------------------------------------ */

export const STAFF_PERMISSIONS = {
  'accounts.status': ['operations', 'support'],
  'plans.manage': ['operations', 'finance'],
  'requests.manage': ['operations', 'service_operations'],
  'services.manage': ['operations'],
  'documents.review': ['operations', 'support'],
  'support.manage': ['operations', 'support'],
} as const satisfies Record<string, readonly StaffRole[]>;

export type StaffPermission = keyof typeof STAFF_PERMISSIONS;

export function staffCan(role: StaffRole | null | undefined, permission: StaffPermission): boolean {
  if (!role) return false;
  return (
    role === 'super_admin' || (STAFF_PERMISSIONS[permission] as readonly StaffRole[]).includes(role)
  );
}

/* ------------------------------------------------------------------ *
 * Backoffice shapes
 * ------------------------------------------------------------------ */

export interface BackofficeAccount {
  id: string;
  status: AccountStatus;
  created_at: string;
  phone: string | null;
  full_name: string | null;
  property_count: number;
  open_request_count: number;
  plan_code: string | null;
  plan_name: string | null;
  plan_source: 'trial' | 'payment' | 'staff' | null;
  plan_ends_at: string | null;
}

export interface BackofficeRequest extends ServiceRequest {
  account_id: string;
  customer_phone: string | null;
  customer_name: string | null;
}

export interface BackofficeRequestDetail extends BackofficeRequest {
  report: VisitReport | null;
  outcome: ServiceOutcome | null;
  info_ticket: RequestInfoThread | null;
  property_address: string | null;
  order: Order | null;
}

export interface BackofficeAccountDetail {
  account: BackofficeAccount;
  plan: AccountPlanState;
  /** Plain-language reason the customer is blocked, if any (M9 "why"). */
  blocked_reason: string | null;
  properties: Pick<
    PropertySummary,
    'id' | 'name' | 'property_type' | 'city' | 'document_count' | 'photo_count' | 'video_count'
  >[];
  requests: BackofficeRequest[];
  orders: Order[];
}

/** One property slot this term (Backoffice). */
export interface PropertySlot {
  id: string;
  property_id: string | null;
  property_name: string;
  claimed_at: string;
  property_deleted_at: string | null;
  released_at: string | null;
  release_reason: string | null;
}

export const releaseSlotSchema = z.object({
  reason: z.string().trim().min(3, 'Say why the slot is freed').max(500),
});

/** Staff: price an "On quote" request (POST /backoffice/requests/:id/price). */
export const requestPriceSchema = z.object({
  price_paise: z.number().int().min(100, 'Enter a price').max(100_000_000),
});

/** Staff decision on a Pittu review (POST /backoffice/properties/:id/review). */
export const reviewDecisionSchema = z.object({
  status: z.enum(['open', 'done']),
  note: z.string().trim().max(500).optional(),
});

/** One audit entry for the Backoffice activity list (M11). */
export interface AuditEntry {
  id: string;
  created_at: string;
  actor_type: 'user' | 'staff' | 'system' | 'provider';
  actor_name: string | null;
  /** Business event ("service_request.created") or row change ("db.orders.update"). */
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  /** For row changes: the columns that changed, old → new. */
  changes: Record<string, [unknown, unknown]> | null;
  request_id: string | null;
}

export interface BackofficeProperty {
  property: Property;
  account_id: string;
  photos: PropertyPhoto[];
  documents: PropertyDocument[];
  /** Present when the property was added from a deed or answered Pittu's questions. */
  pittu: BackofficePittu | null;
  reach: StaffPropertyReach | null;
}

export interface StaffService extends Service {
  is_active: boolean;
}

/* ------------------------------------------------------------------ *
 * Backoffice inputs
 * ------------------------------------------------------------------ */

export const staffRequestUpdateSchema = z
  .object({
    // "Need info from you" goes through requestInfoSchema (it opens a thread).
    status: z.enum(SERVICE_REQUEST_STATUSES).exclude(['awaiting_customer']),
    scheduled_for: z.iso.datetime({ offset: true }).nullable().optional(),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((v) => v.status !== 'scheduled' || !!v.scheduled_for, {
    message: 'Choose the visit date',
    path: ['scheduled_for'],
  });
export type StaffRequestUpdateInput = z.input<typeof staffRequestUpdateSchema>;

export const visitReportSchema = z.object({
  visited_at: z.iso.date({ message: 'Choose the visit date' }),
  condition: z.enum(VISIT_CONDITIONS, { message: 'Choose the property condition' }),
  observations: z.string().trim().max(4000).default(''),
  issues: z.string().trim().max(4000).default(''),
  recommendations: z.string().trim().max(4000).default(''),
});
export type VisitReportInput = z.input<typeof visitReportSchema>;

export const visitMediaIntentSchema = z
  .object({
    kind: z.enum(['photo', 'video']),
    mime_type: z.enum([...ALLOWED_PHOTO_MIME_TYPES, ...ALLOWED_VIDEO_MIME_TYPES]),
    file_size: z.number().int().positive().max(MAX_VIDEO_BYTES, 'Files must be under 50 MB'),
  })
  .refine((v) => (v.kind === 'photo') === v.mime_type.startsWith('image/'), {
    message: 'File type does not match',
    path: ['mime_type'],
  })
  .refine((v) => v.kind === 'video' || v.file_size <= MAX_PHOTO_BYTES, {
    message: 'Photos must be under 5 MB',
    path: ['file_size'],
  });
export type VisitMediaIntentInput = z.input<typeof visitMediaIntentSchema>;

export const requestInfoSchema = z.object({
  message: z.string().trim().min(3, 'Say what you need from the customer').max(4000),
});

export const requestFulfilmentSchema = z.object({ fulfilment: z.enum(SERVICE_FULFILMENTS) });

export const outcomeSchema = z.object({
  summary: z.string().trim().min(1, 'Say what was done').max(4000),
  findings: z.string().trim().max(4000).default(''),
  reference_number: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(120).nullable().default(null),
  ),
  next_due_date: z.iso.date().nullable().default(null),
});
export type OutcomeInput = z.input<typeof outcomeSchema>;

export const outcomeFileIntentSchema = z.object({
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.enum(ALLOWED_DOCUMENT_MIME_TYPES, { message: 'Use a PDF, JPG or PNG file' }),
  file_size: z.number().int().positive().max(MAX_DOCUMENT_BYTES, 'Files must be under 10 MB'),
  document_type: z.enum(DOCUMENT_TYPES).nullable().default(null),
});
export type OutcomeFileIntentInput = z.input<typeof outcomeFileIntentSchema>;

const serviceFields = {
  name: z.string().trim().min(1, 'Enter a name').max(80),
  description: z.string().trim().min(1, 'Enter a description').max(500),
  category: z.string().regex(/^[a-z][a-z0-9_]*$/, 'Choose a category'),
  price_paise: z.number().int().min(0).max(100_000_000).nullable(),
  is_active: z.boolean(),
  is_extra_available: z.boolean(),
  fulfilment: z.enum(SERVICE_FULFILMENTS),
  reach: z.enum(SERVICE_REACHES),
  includes: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(120)
        .regex(/^[^<>]*$/),
    )
    .max(10),
  turnaround: z.string().trim().max(80).nullable(),
  payment_timing: z.enum(PAYMENT_TIMINGS),
  cancel_policy: z.enum(CANCEL_POLICIES),
  expected_days: z.number().int().min(1).max(365).nullable(),
  sort_order: z.number().int().min(0).max(10_000),
};

export const createServiceSchema = z.object({
  code: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, 'Lowercase letters, digits and _ only')
    .max(50),
  ...serviceFields,
  includes: serviceFields.includes.default([]),
  turnaround: serviceFields.turnaround.default(null),
  payment_timing: serviceFields.payment_timing.default('on_confirmation'),
  cancel_policy: serviceFields.cancel_policy.default('until_confirmed'),
  expected_days: serviceFields.expected_days.default(null),
});
/** No defaults here: a partial update must change only the fields it sends. */
export const updateServiceSchema = z.object(serviceFields).partial();
export type CreateServiceInput = z.input<typeof createServiceSchema>;
export type UpdateServiceInput = z.input<typeof updateServiceSchema>;

export const accountStatusSchema = z.object({
  status: z.enum(ACCOUNT_STATUSES).exclude(['closed']),
});

export const documentStatusSchema = z.object({ status: z.enum(DOCUMENT_STATUSES) });

export const grantPlanSchema = z.object({
  plan_code: z.string().regex(/^[a-z][a-z0-9_]*$/),
  days: z.number().int().min(1).max(3660).optional(),
});

/** POST /backoffice/accounts/:id/plan/extend — add days to what is in force. */
export const extendPlanSchema = z.object({
  days: z.number().int().min(1).max(365),
});

/* ------------------------------------------------------------------ *
 * Catalogue set-up (Backoffice portal)
 * ------------------------------------------------------------------ */

/** GET /backoffice/service-categories */
export interface StaffServiceCategory {
  code: string;
  name: string;
  sort_order: number;
  service_count: number;
}

export const categoryCreateSchema = z.object({
  code: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, 'Lowercase letters, digits and _ only')
    .max(40),
  name: z.string().trim().min(1, 'Enter a name').max(60),
});
export const categoryUpdateSchema = z.object({ name: z.string().trim().min(1).max(60) });

/** POST …/order — the new order, first to last. */
export const reorderSchema = z.object({ ids: z.array(z.string().min(1).max(100)).min(1).max(500) });
