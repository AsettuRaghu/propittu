/**
 * Enumerations and limits shared by the API and the mobile app.
 *
 * These mirror the CHECK constraints in supabase/migrations/0001_init.sql.
 * When a list changes here, widen the matching CHECK constraint in a new migration.
 */

/* ------------------------------------------------------------------ *
 * India / phone (PRODUCT_SPEC.md §5, §13)
 * ------------------------------------------------------------------ */

export const COUNTRY_CALLING_CODE = '+91';

/** Indian mobile numbers are 10 digits beginning 6-9. Landlines are rejected. */
export const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;

/** Indian PIN codes are 6 digits and never start with 0. */
export const INDIAN_PINCODE_REGEX = /^[1-9][0-9]{5}$/;

export const OTP_LENGTH = 6;

/** Client-side courtesy timer; the real limit is the Supabase Auth rate limit. */
export const OTP_RESEND_COOLDOWN_SECONDS = 30;

/**
 * Must match Supabase Dashboard → Auth → Providers → Phone → "SMS OTP Expiry".
 *
 * Supabase returns the same error for a wrong code and an expired one, so
 * the app uses elapsed time to tell the user which it was (§11 requires
 * distinct "Invalid OTP" and "Expired OTP" handling).
 */
export const OTP_EXPIRY_SECONDS = 600;

/** Formats a 10-digit local number into the E.164 form Supabase Auth requires. */
export function toE164(localNumber: string): string {
  return `${COUNTRY_CALLING_CODE}${localNumber.replace(/\D/g, '')}`;
}

/** Renders +919876543210 or 9876543210 as "+91 98765 43210" for display. */
export function formatIndianMobile(value: string): string {
  const digits = value.replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return value;
  return `${COUNTRY_CALLING_CODE} ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

/* ------------------------------------------------------------------ *
 * Property types (§16 Step 1)
 * ------------------------------------------------------------------ */

export const PROPERTY_TYPES = [
  'land',
  'apartment',
  'independent_house',
  'commercial',
  'industrial',
  'other',
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  land: 'Land / Plot',
  apartment: 'Apartment / Flat',
  independent_house: 'Independent House',
  commercial: 'Commercial',
  industrial: 'Industrial',
  other: 'Other',
};

/* ------------------------------------------------------------------ *
 * More property details (7 Oct 2026)
 * ------------------------------------------------------------------ */

export const LAND_USES = [
  'residential',
  'commercial',
  'agricultural',
  'converted',
  'industrial',
  'mixed',
] as const;
export type LandUse = (typeof LAND_USES)[number];
export const LAND_USE_LABELS: Record<LandUse, string> = {
  residential: 'Residential',
  commercial: 'Commercial',
  agricultural: 'Agricultural',
  converted: 'Converted (agricultural to residential / DC conversion)',
  industrial: 'Industrial',
  mixed: 'Mixed use',
};

/** Karnataka's Khata kinds — B-Khata is a known pain point in Bengaluru. */
export const KHATA_TYPES = ['a_khata', 'b_khata', 'e_khata', 'not_sure'] as const;
export type KhataType = (typeof KHATA_TYPES)[number];
export const KHATA_TYPE_LABELS: Record<KhataType, string> = {
  a_khata: 'A-Khata',
  b_khata: 'B-Khata',
  e_khata: 'e-Khata',
  not_sure: 'Not sure',
};

export const FACINGS = [
  'north',
  'east',
  'south',
  'west',
  'north_east',
  'north_west',
  'south_east',
  'south_west',
] as const;
export type Facing = (typeof FACINGS)[number];
export const FACING_LABELS: Record<Facing, string> = {
  north: 'North',
  east: 'East',
  south: 'South',
  west: 'West',
  north_east: 'North-east',
  north_west: 'North-west',
  south_east: 'South-east',
  south_west: 'South-west',
};

/** Who approved the layout / building — the usual ones in Bengaluru and Hyderabad. */
export const APPROVING_AUTHORITIES = [
  'BDA',
  'BBMP',
  'BMRDA',
  'BIAAPA',
  'HMDA',
  'GHMC',
  'DTCP',
  'Gram panchayat',
  'Other',
] as const;

/* ------------------------------------------------------------------ *
 * Area units (§16 Step 2) — Indian units included deliberately
 * ------------------------------------------------------------------ */

export const AREA_UNITS = ['sqft', 'sqyd', 'sqm', 'acre', 'guntha', 'cent', 'bigha'] as const;

export type AreaUnit = (typeof AREA_UNITS)[number];

export const AREA_UNIT_LABELS: Record<AreaUnit, string> = {
  sqft: 'sq.ft',
  sqyd: 'sq.yd',
  sqm: 'sq.m',
  acre: 'acre',
  guntha: 'guntha',
  cent: 'cent',
  bigha: 'bigha',
};

/* ------------------------------------------------------------------ *
 * Document types (§20) — "The list should remain extensible."
 * ------------------------------------------------------------------ */

/** M3 V1 categories. Sale Deed is first-class (future M12 extraction source). */
export const DOCUMENT_TYPES = [
  'sale_deed',
  'registration',
  'property_tax',
  'khata',
  'encumbrance_certificate',
  'other',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  sale_deed: 'Sale Deed',
  registration: 'Registration',
  property_tax: 'Property Tax',
  khata: 'Khata',
  encumbrance_certificate: 'Encumbrance Certificate (EC)',
  other: 'Other',
};

/** Review status — only staff (later, AI under staff oversight) move it past "uploaded". */
export const DOCUMENT_STATUSES = ['uploaded', 'under_review', 'verified', 'rejected'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  uploaded: 'Uploaded',
  under_review: 'Under review',
  verified: 'Verified',
  rejected: 'Rejected',
};

/* ------------------------------------------------------------------ *
 * Provenance (M2/M11): who supplied a value. AI-derived or external
 * values must never silently overwrite user-confirmed ones.
 * ------------------------------------------------------------------ */

export const VALUE_SOURCES = ['user', 'sale_deed', 'ai', 'external', 'system'] as const;
export type ValueSource = (typeof VALUE_SOURCES)[number];

/* ------------------------------------------------------------------ *
 * Service catalogue (§22) — categories only; the services themselves
 * live in the `services` table so GET /services can serve them.
 * ------------------------------------------------------------------ */

/** A category code; categories are data (service_categories), managed in Backoffice. */
export type ServiceCategory = string;

/** Names of the first categories, a fallback when a name is not at hand. */
export const SERVICE_CATEGORY_LABELS: Record<string, string> = {
  property_government: 'Property & Government',
  property_care: 'Property Care',
  other: 'Other',
};

/* ------------------------------------------------------------------ *
 * Service request status (§24)
 * ------------------------------------------------------------------ */

export const SERVICE_REQUEST_STATUSES = [
  'requested',
  'confirmed',
  'scheduled',
  'in_progress',
  'awaiting_customer',
  'completed',
  'cancelled',
] as const;

export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];

export const SERVICE_REQUEST_STATUS_LABELS: Record<ServiceRequestStatus, string> = {
  requested: 'Requested',
  confirmed: 'Confirmed',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  awaiting_customer: 'Need info from you',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/* ------------------------------------------------------------------ *
 * Upload status — a row exists before its bytes arrive, so lists
 * must filter to 'ready' (see docs/ARCHITECTURE.md, uploads).
 * ------------------------------------------------------------------ */

export const UPLOAD_STATUSES = ['pending', 'ready'] as const;

export type UploadStatus = (typeof UPLOAD_STATUSES)[number];

/* ------------------------------------------------------------------ *
 * File limits (§21 "reasonable file-size limits")
 *
 * Enforced in three places: the mobile picker, the API intent
 * endpoint, and the Supabase bucket configuration itself.
 * ------------------------------------------------------------------ */

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB
/** Sale deeds and registration documents can be long scans (real deeds reach ~55 MB). */
export const MAX_LONG_DOCUMENT_BYTES = 50 * 1024 * 1024; // 50 MB (Supabase Free per-file maximum)
export const LONG_DOCUMENT_TYPES = [
  'sale_deed',
  'registration',
  'encumbrance_certificate',
] as const;
export const maxDocumentBytes = (type: string): number =>
  (LONG_DOCUMENT_TYPES as readonly string[]).includes(type)
    ? MAX_LONG_DOCUMENT_BYTES
    : MAX_DOCUMENT_BYTES;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

export const ALLOWED_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png'] as const;

/** Videos: the Supabase free plan caps a single file at 50 MB. */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 60;
export const MAX_VIDEOS_PER_PROPERTY = 10;
export const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime'] as const;
export type VideoMimeType = (typeof ALLOWED_VIDEO_MIME_TYPES)[number];

export type DocumentMimeType = (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];
export type PhotoMimeType = (typeof ALLOWED_PHOTO_MIME_TYPES)[number];

/** Longest-edge target for uploaded photos; a raw 12 MP shot is pointless on a list card. */
export const PHOTO_MAX_DIMENSION = 1600;

/** §16 Step 4: "Up to 5 photos during property creation". */
export const MAX_PHOTOS_AT_CREATION = 5;

/** §16: "Users can add additional photos later" — capped so storage stays bounded. */
export const MAX_PHOTOS_PER_PROPERTY = 20;

export const STORAGE_BUCKETS = {
  photos: 'property-photos',
  documents: 'property-documents',
  videos: 'property-videos',
  /** Staff-only reference documents (e.g. government rate tables). */
  reference: 'reference-documents',
} as const;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ *
 * API error codes — the mobile app maps these to user-facing copy,
 * so error strings live in exactly one place on the client (§40).
 * ------------------------------------------------------------------ */

export const API_ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'UNSUPPORTED_FILE_TYPE',
  'FILE_TOO_LARGE',
  'UPLOAD_NOT_COMPLETED',
  'CONFLICT',
  'INTERNAL',
  // Plans, Benefits and Usage (M5/M6)
  'LIMITED_ACCESS', // no active Plan or Trial
  'FEATURE_NOT_INCLUDED', // the Plan lacks this Feature Benefit
  'LIMIT_REACHED', // a Usage Limit would be exceeded
  // Payments (M7)
  'PAYMENTS_UNAVAILABLE', // provider not configured yet
  // AI (document intelligence)
  'AI_UNAVAILABLE', // switched off, not in the pilot, or over budget
  'AI_LIMIT_REACHED', // daily readings per account used up
  // Where we serve
  'NOT_IN_SERVICE_AREA', // the service does not reach this property's location
] as const;

/* ------------------------------------------------------------------ *
 * Account (M1) and Backoffice staff (M9)
 * ------------------------------------------------------------------ */

export const ACCOUNT_STATUSES = ['active', 'suspended', 'closed'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ACCOUNT_ROLES = ['owner', 'member'] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export const STAFF_ROLES = [
  'super_admin',
  'operations',
  'support',
  'finance',
  'service_operations',
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
