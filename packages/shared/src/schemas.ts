import { z } from 'zod';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  ALLOWED_PHOTO_MIME_TYPES,
  AREA_UNITS,
  DOCUMENT_TYPES,
  INDIAN_MOBILE_REGEX,
  INDIAN_PINCODE_REGEX,
  MAX_DOCUMENT_BYTES,
  MAX_PHOTO_BYTES,
  OTP_LENGTH,
  PROPERTY_TYPES,
} from './constants';

/**
 * Validation schemas used by BOTH the API (authoritative) and the mobile
 * forms (fast feedback). The API never trusts that the client ran these.
 */

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/**
 * Optional free-text field: trims, and treats "" / undefined as null so
 * that clearing a field in an edit form actually clears it in the DB.
 */
const optionalText = (max: number) =>
  z.preprocess(
    (v) => ((typeof v === 'string' && v.trim() === '') || v === undefined ? null : v),
    z.string().trim().max(max).nullable(),
  );

const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess((v) => (v === '' || v === undefined ? null : v), schema.nullable());

/**
 * Any well-formed UUID, matching what Postgres' uuid type accepts.
 * (z.uuid() is RFC-9562 strict and rejects ids Postgres considers valid.)
 */
export const uuidSchema = z.guid();

/* ------------------------------------------------------------------ *
 * Auth (§10, §11, §13)
 * ------------------------------------------------------------------ */

export const phoneLocalSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .pipe(
    z
      .string()
      .length(10, 'Enter a 10-digit mobile number')
      .regex(INDIAN_MOBILE_REGEX, 'Enter a valid Indian mobile number'),
  );

export const otpSchema = z
  .string()
  .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `Enter the ${OTP_LENGTH}-digit code`);

/* ------------------------------------------------------------------ *
 * Properties (§16, §17)
 *
 * Mandatory: property_type and name. Everything else is optional,
 * per "Only essential information should be mandatory" and
 * "Do not force users to provide these" (§16 Step 3).
 * ------------------------------------------------------------------ */

const propertyFields = {
  property_type: z.enum(PROPERTY_TYPES, { message: 'Choose a property type' }),
  name: z
    .string({ message: 'Give your property a name' })
    .trim()
    .min(1, 'Give your property a name')
    .max(120, 'Keep the name under 120 characters'),
  address_line: optionalText(300),
  city: optionalText(100),
  state: optionalText(100),
  pincode: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.string().trim().regex(INDIAN_PINCODE_REGEX, 'Enter a valid 6-digit PIN code').nullable(),
  ),
  latitude: optionalNumber(z.number().min(-90).max(90)),
  longitude: optionalNumber(z.number().min(-180).max(180)),
  area_value: optionalNumber(
    z
      .number({ message: 'Area must be a number' })
      .positive('Area must be greater than zero')
      .max(1_000_000_000, 'Area is too large'),
  ),
  area_unit: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.enum(AREA_UNITS).nullable(),
  ),
  survey_number: optionalText(100),
  property_number: optionalText(100),
  khata_number: optionalText(100),
  notes: optionalText(2000),
};

export const createPropertySchema = z
  .object(propertyFields)
  .refine((p) => p.area_value === null || p.area_unit !== null, {
    message: 'Choose a unit for the area',
    path: ['area_unit'],
  });

/** PATCH semantics: every field optional; an omitted field is left untouched. */
export const updatePropertySchema = z
  .object(propertyFields)
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: 'Nothing to update' });

export type CreatePropertyInput = z.input<typeof createPropertySchema>;
export type CreatePropertyData = z.output<typeof createPropertySchema>;
export type UpdatePropertyInput = z.input<typeof updatePropertySchema>;
export type UpdatePropertyData = z.output<typeof updatePropertySchema>;

/* ------------------------------------------------------------------ *
 * Uploads — signed-URL intent/confirm (§19, §21, §37)
 *
 * The client describes the file; the API decides the storage path.
 * Clients never supply a path (§37).
 * ------------------------------------------------------------------ */

export const photoIntentSchema = z.object({
  mime_type: z.enum(ALLOWED_PHOTO_MIME_TYPES, {
    message: 'Photos must be JPG or PNG',
  }),
  file_size: z
    .number()
    .int()
    .positive()
    .max(MAX_PHOTO_BYTES, `Photos must be under ${MAX_PHOTO_BYTES / (1024 * 1024)} MB`),
  caption: optionalText(200),
});

export const documentIntentSchema = z.object({
  document_type: z.enum(DOCUMENT_TYPES, { message: 'Choose a document type' }),
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.enum(ALLOWED_DOCUMENT_MIME_TYPES, {
    message: 'Documents must be PDF, JPG or PNG',
  }),
  file_size: z
    .number()
    .int()
    .positive()
    .max(MAX_DOCUMENT_BYTES, `Documents must be under ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB`),
});

export type PhotoIntentInput = z.input<typeof photoIntentSchema>;
export type DocumentIntentInput = z.input<typeof documentIntentSchema>;

/* ------------------------------------------------------------------ *
 * Service requests (§23, §24)
 * Request photos were dropped from V1 — see docs/DECISIONS.md.
 * ------------------------------------------------------------------ */

export const createServiceRequestSchema = z.object({
  property_id: uuidSchema,
  service_id: uuidSchema,
  description: z
    .string({ message: 'Tell us what you need' })
    .trim()
    .min(1, 'Tell us what you need')
    .max(2000, 'Keep the description under 2000 characters'),
});

export type CreateServiceRequestInput = z.input<typeof createServiceRequestSchema>;

/* ------------------------------------------------------------------ *
 * Route params
 * ------------------------------------------------------------------ */

export const idParamSchema = z.object({ id: uuidSchema });

/* ------------------------------------------------------------------ *
 * Turning a ZodError into a flat field → message map for forms.
 * ------------------------------------------------------------------ */

export type FieldErrors = Record<string, string>;

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_form';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
