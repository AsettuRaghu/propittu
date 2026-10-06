/**
 * Plans, Benefits and Usage (M5/M6) — shared vocabulary.
 *
 *   Account → Plan → Benefits → Usage
 *
 * Benefit CODES are fixed by the code (the API enforces them); their
 * VALUES (which Plan has what, limits, quantities) are data.
 */

export const FEATURE_CODES = [
  'property_profile',
  'document_upload',
  'photo_upload',
  'video_upload',
] as const;
export type FeatureCode = (typeof FEATURE_CODES)[number];

export const FEATURE_LABELS: Record<FeatureCode, string> = {
  property_profile: 'Property profiles',
  document_upload: 'Document storage',
  photo_upload: 'Property photos',
  video_upload: 'Property videos',
};

export const LIMIT_CODES = [
  'max_properties',
  'max_documents_per_property',
  'max_photos_per_property',
  'max_videos_per_property',
  'max_storage_mb',
] as const;
export type LimitCode = (typeof LIMIT_CODES)[number];

export const LIMIT_LABELS: Record<LimitCode, string> = {
  max_properties: 'Properties',
  max_documents_per_property: 'Documents per property',
  max_photos_per_property: 'Photos per property',
  max_videos_per_property: 'Videos per property',
  max_storage_mb: 'Storage',
};

/** Included Service codes match service codes in the catalogue (M4). */
export const INCLUDED_SERVICE_LABELS: Record<string, string> = {
  property_visit: 'Property visits',
};

/**
 * full     — an active Trial or Plan; Benefits apply.
 * limited  — no active Plan: Limited Access (M6, strict). The user can
 *            see account, Plan/Trial status, available Plans, the payment
 *            journey and support — nothing else. Data is never deleted.
 */
export const PLAN_ACCESS = ['full', 'limited'] as const;
export type PlanAccess = (typeof PLAN_ACCESS)[number];

export const PLAN_STATUSES = ['trialing', 'active', 'cancelling', 'expired'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  trialing: 'Free Trial',
  active: 'Active',
  cancelling: 'Cancelled — active until period end',
  expired: 'Expired',
};

export const BILLING_PERIOD_LABELS: Record<'none' | 'month' | 'year', string> = {
  none: '',
  month: 'per month',
  year: 'per year',
};

/** 149900 → "₹1,499". Prices are stored in paise. */
export function formatPrice(paise: number): string {
  const rupees = paise / 100;
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: rupees % 1 ? 2 : 0 }).format(rupees)}`;
}

export function formatStorageMb(mb: number): string {
  return mb >= 1024 ? `${+(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

/* ------------------------------------------------------------------ *
 * Response shapes
 * ------------------------------------------------------------------ */

export interface PlanBenefits {
  features: FeatureCode[];
  limits: Partial<Record<LimitCode, number>>;
  included: { code: string; quantity: number; period: 'year' | 'term' }[];
}

/** A purchasable Plan (current version) — "available Plans". */
export interface PublicPlan {
  code: string;
  name: string;
  description: string;
  version: number;
  plan_version_id: string;
  price_paise: number;
  currency: 'INR';
  billing_period: 'none' | 'month' | 'year';
  term_days: number;
  benefits: PlanBenefits;
}

/** GET /account/plan */
export interface AccountPlanState {
  access: PlanAccess;
  status: PlanStatus;
  plan: Omit<PublicPlan, 'plan_version_id'> | null;
  current: {
    id: string;
    source: 'trial' | 'payment' | 'staff';
    starts_at: string;
    ends_at: string;
    cancel_at_period_end: boolean;
    days_left: number;
  } | null;
  usage: {
    properties: number;
    storage_bytes: number;
    included: { code: string; used: number; quantity: number }[];
    /** Totals across all properties, plus the fullest single property (per-property limits). */
    documents: number;
    photos: number;
    videos: number;
    max_documents_on_a_property: number;
    max_photos_on_a_property: number;
    max_videos_on_a_property: number;
    /**
     * Property slots this term: every property that existed or was added
     * this term uses one until the term ends (deleting does not free it).
     */
    property_slots_used: number;
    /** Deleted this term but still counted (until the term ends). */
    deleted_still_counted: { name: string; deleted_at: string }[];
  };
  /** What the customer has already received from Propittu. */
  received: {
    services_completed: number;
    visit_reports: number;
    paid_orders: number;
  };
  /** Limits currently exceeded (e.g. after a downgrade): data kept, additions blocked. */
  over_limit: LimitCode[];
}

/** Compact summary on GET /me, used to gate the app. */
export interface PlanSummary {
  access: PlanAccess;
  status: PlanStatus;
  plan_name: string | null;
  ends_at: string | null;
  /** Whole days until ends_at, computed by the API. */
  days_left: number | null;
}
