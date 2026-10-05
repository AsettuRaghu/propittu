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

export const DOCUMENT_TYPES = [
  'sale_deed',
  'registration',
  'tax_receipt',
  'khata_certificate',
  'encumbrance_certificate',
  'building_approval',
  'electricity',
  'rental_agreement',
  'other',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  sale_deed: 'Sale Deed',
  registration: 'Registration Document',
  tax_receipt: 'Property Tax Receipt',
  khata_certificate: 'Khata Certificate',
  encumbrance_certificate: 'Encumbrance Certificate',
  building_approval: 'Building Approval',
  electricity: 'Electricity Document',
  rental_agreement: 'Rental Agreement',
  other: 'Other',
};

/* ------------------------------------------------------------------ *
 * Service catalogue (§22) — categories only; the services themselves
 * live in the `services` table so GET /services can serve them.
 * ------------------------------------------------------------------ */

export const SERVICE_CATEGORIES = ['property_government', 'property_care', 'other'] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  property_government: 'Property & Government',
  property_care: 'Property Care',
  other: 'Other',
};

/* ------------------------------------------------------------------ *
 * Service request status (§24)
 * ------------------------------------------------------------------ */

export const SERVICE_REQUEST_STATUSES = [
  'submitted',
  'in_review',
  'in_progress',
  'completed',
  'cancelled',
] as const;

export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];

export const SERVICE_REQUEST_STATUS_LABELS: Record<ServiceRequestStatus, string> = {
  submitted: 'Submitted',
  in_review: 'In Review',
  in_progress: 'In Progress',
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
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

export const ALLOWED_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png'] as const;

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
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
