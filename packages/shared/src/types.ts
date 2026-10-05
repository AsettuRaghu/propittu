import type {
  ApiErrorCode,
  AreaUnit,
  DocumentType,
  PropertyType,
  ServiceCategory,
  ServiceRequestStatus,
} from './constants';

/**
 * Response shapes returned by the Propittu API.
 * Timestamps are ISO-8601 strings, as returned by PostgREST.
 */

/* ------------------------------------------------------------------ *
 * Envelope
 * ------------------------------------------------------------------ */

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  /** Field → message, present on VALIDATION_FAILED. */
  details?: Record<string, string>;
}

export type ApiSuccess<T> = { data: T };
export type ApiFailure = { error: ApiErrorBody };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/* ------------------------------------------------------------------ *
 * Profile (§25)
 * ------------------------------------------------------------------ */

export interface Me {
  id: string;
  phone: string;
  full_name: string | null;
  created_at: string;
  property_count: number;
  service_request_count: number;
}

/* ------------------------------------------------------------------ *
 * Properties (§17)
 * ------------------------------------------------------------------ */

export interface Property {
  id: string;
  property_type: PropertyType;
  name: string;
  address_line: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  area_value: number | null;
  area_unit: AreaUnit | null;
  survey_number: string | null;
  property_number: string | null;
  khata_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Home-screen card (§15). */
export interface PropertySummary {
  id: string;
  property_type: PropertyType;
  name: string;
  city: string | null;
  state: string | null;
  document_count: number;
  service_request_count: number;
  cover_photo_url: string | null;
  created_at: string;
}

/** Property details screen (§18). */
export interface PropertyDetail extends Property {
  photos: PropertyPhoto[];
  document_count: number;
  service_request_count: number;
}

/* ------------------------------------------------------------------ *
 * Photos (§19) and documents (§20)
 * ------------------------------------------------------------------ */

export interface PropertyPhoto {
  id: string;
  property_id: string;
  caption: string | null;
  /** Short-lived signed URL; never persist it. */
  url: string | null;
  created_at: string;
}

export interface PropertyDocument {
  id: string;
  property_id: string;
  document_type: DocumentType;
  file_name: string;
  mime_type: string;
  file_size: number;
  created_at: string;
}

/** Returned by the upload-intent endpoints. */
export interface UploadIntent {
  id: string;
  /** PUT the raw bytes to this URL with the declared Content-Type. */
  upload_url: string;
  expires_in: number;
}

export interface SignedDownload {
  url: string;
  file_name: string;
  mime_type: string;
  expires_in: number;
}

/* ------------------------------------------------------------------ *
 * Services (§22) and service requests (§24)
 * ------------------------------------------------------------------ */

export interface Service {
  id: string;
  code: string;
  name: string;
  category: ServiceCategory;
  description: string;
  sort_order: number;
}

export interface ServiceRequest {
  id: string;
  /** Human-facing reference, e.g. "PR-000123" (§23). */
  reference: string;
  status: ServiceRequestStatus;
  description: string;
  created_at: string;
  updated_at: string;
  service: Pick<Service, 'id' | 'code' | 'name' | 'category'>;
  /** Null when the property was deleted after the request was made. */
  property: Pick<Property, 'id' | 'name' | 'city'> | null;
}
