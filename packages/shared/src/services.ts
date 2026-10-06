import { z } from 'zod';
import {
  ACCOUNT_STATUSES,
  ALLOWED_PHOTO_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
  DOCUMENT_STATUSES,
  MAX_PHOTO_BYTES,
  MAX_VIDEO_BYTES,
  SERVICE_CATEGORIES,
  SERVICE_REQUEST_STATUSES,
  type AccountStatus,
  type ServiceRequestStatus,
  type StaffRole,
} from './constants';
import type { Order } from './billing';
import type { AccountPlanState } from './plans';
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

export const SERVICE_REQUEST_TRANSITIONS: Record<ServiceRequestStatus, ServiceRequestStatus[]> = {
  requested: ['confirmed', 'cancelled'],
  confirmed: ['scheduled', 'in_progress', 'completed', 'cancelled'],
  scheduled: ['scheduled', 'in_progress', 'completed', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export const OPEN_REQUEST_STATUSES: ServiceRequestStatus[] = [
  'requested',
  'confirmed',
  'scheduled',
  'in_progress',
];

/** Staff-facing verbs for each target status. */
export const SERVICE_REQUEST_ACTION_LABELS: Record<ServiceRequestStatus, string> = {
  requested: 'Requested',
  confirmed: 'Confirm',
  scheduled: 'Schedule',
  in_progress: 'Start',
  completed: 'Complete',
  cancelled: 'Cancel request',
};

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

export const SERVICE_COVERAGE_LABELS: Record<ServiceRequest['coverage'], string> = {
  included: 'Included in your plan',
  extra: 'Extra service',
};

/** Shown in the catalogue for the signed-in Account (GET /services). */
export interface CatalogueService extends Service {
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

export interface ServiceRequestDetail extends ServiceRequest {
  report: VisitReport | null;
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

export interface BackofficeProperty {
  property: Property;
  account_id: string;
  photos: PropertyPhoto[];
  documents: PropertyDocument[];
}

export interface StaffService extends Service {
  is_active: boolean;
}

/* ------------------------------------------------------------------ *
 * Backoffice inputs
 * ------------------------------------------------------------------ */

export const staffRequestUpdateSchema = z
  .object({
    status: z.enum(SERVICE_REQUEST_STATUSES),
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

const serviceFields = {
  name: z.string().trim().min(1, 'Enter a name').max(80),
  description: z.string().trim().min(1, 'Enter a description').max(500),
  category: z.enum(SERVICE_CATEGORIES),
  price_paise: z.number().int().min(0).max(100_000_000).nullable(),
  is_active: z.boolean(),
  is_extra_available: z.boolean(),
  sort_order: z.number().int().min(0).max(10_000),
};

export const createServiceSchema = z.object({
  code: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, 'Lowercase letters, digits and _ only')
    .max(50),
  ...serviceFields,
});
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
