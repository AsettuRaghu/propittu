import type { AnalysisStatus, DeedGap } from './ai';
import type { CompletionItem, PropertyCompletion } from './completion';
import type { PropertyHealth } from './health';
import type { PlanSummary } from './plans';
import type { PropertyReach, ServiceReach } from './reach';
import type { CancelPolicy, PaymentTiming, ServiceFulfilment } from './services';
import type {
  AccountRole,
  AccountStatus,
  ApiErrorCode,
  AreaUnit,
  Facing,
  KhataType,
  LandUse,
  DocumentStatus,
  ValueSource,
  StaffRole,
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
  /** The Account this user belongs to (M1). V1: exactly one. */
  account: {
    id: string;
    status: AccountStatus;
    role: AccountRole;
  };
  /** Non-null when this user is Backoffice staff (M9). */
  staff_role: StaffRole | null;
  /** Plan/Trial status (M5/M6); access = limited means Limited Access. */
  plan: PlanSummary;
  /**
   * Optional features switched on for this account. When a feature is off
   * the app simply shows the normal flow — it never mentions the feature.
   */
  features: {
    /** Pittu reads uploaded sale deeds (AI). */
    document_reading: boolean;
  };
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
  purchase_price_inr: number | null;
  /** YYYY-MM-DD */
  purchase_date: string | null;
  sellers: string | null;
  land_use: LandUse | null;
  khata_type: KhataType | null;
  approving_authority: string | null;
  rera_number: string | null;
  plot_dimensions: string | null;
  facing: Facing | null;
  corner_plot: boolean | null;
  road_width_ft: number | null;
  loan_on_property: boolean | null;
  boundary_north: string | null;
  boundary_south: string | null;
  boundary_east: string | null;
  boundary_west: string | null;
  /** Who set the coordinates (M2 provenance); null until a pin is confirmed. */
  location_source: ValueSource | null;
  location_confirmed_at: string | null;
  /** Per-field provenance, e.g. { area_value: 'user' } (future AI must not overwrite). */
  field_sources: Partial<Record<string, ValueSource>>;
  /** True while being set up from a sale deed (hidden from Home and limits). */
  is_draft: boolean;
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
  photo_count: number;
  video_count: number;
  created_at: string;
  /** Profile completion (M2) and the most useful next step, for Home. */
  completion_percent: number;
  next_step: CompletionItem | null;
  /** How many service requests are open on this property. */
  open_request_count: number;
  /** The most recent open service request on this property, if any. */
  active_request: {
    id: string;
    reference: string;
    status: ServiceRequestStatus;
    fulfilment: ServiceFulfilment;
    service_name: string;
    scheduled_for: string | null;
    preferred_date: string | null;
  } | null;
  /** Which kinds of service reach this property (by PIN code / state). */
  reach: PropertyReach | null;
  /** The map pin, if set (Home shows the site's weather). */
  latitude: number | null;
  longitude: number | null;
  /** True while the pin is only approximate (placed from the deed's village). */
  location_approximate: boolean;
  /** Up to five photos, for the swipeable cover. */
  photo_urls: string[];
  /** Property health, 0–100. */
  health_score: number;
  location_issue: LocationIssue | null;
}

/**
 * The map pin disagrees with what else we know about where the property is
 * — the PIN code typed in, or the place its sale deed names (as Pittu read
 * it). Both places are given in words, so the customer can tell which is
 * right. It stays until the customer resolves it.
 */
export interface LocationIssue {
  kind: 'pincode' | 'deed';
  /** "Manikonda, Ranga Reddy (500089)" */
  pin_place: string;
  /** The other side: the PIN code's area, or the deed's village / taluk. */
  other_place: string;
  /** kind 'pincode': the PIN code that disagrees. */
  pincode: string | null;
  distance_km: number;
  /** Where "Move the pin" should start (the PIN code's area / the deed's village). */
  near: { latitude: number; longitude: number } | null;
  /**
   * kind 'deed': the customer said the pin is right anyway. No longer an
   * alert, but still a gap from the deed — shown calmly for as long as it lasts.
   */
  confirmed: boolean;
}

/** The issue in one plain sentence. */
export function locationIssueText(i: LocationIssue): string {
  return i.kind === 'pincode'
    ? `The pin is in ${i.pin_place}, but PIN code ${i.pincode} is in ${i.other_place} — about ${i.distance_km} km apart.`
    : `The pin is in ${i.pin_place}, but your sale deed places the property in ${i.other_place} — about ${i.distance_km} km away.`;
}

/** Property details screen (§18). */
export interface PropertyDetail extends Property {
  photos: PropertyPhoto[];
  videos: PropertyVideo[];
  document_count: number;
  service_request_count: number;
  /** Profile completion and next actions (M2). */
  completion: PropertyCompletion;
  reach: PropertyReach | null;
  location_issue: LocationIssue | null;
  /** Where the saved details differ from the sale deed (as Pittu read it). */
  deed_gaps: DeedGap[];
  /**
   * The property's sale deed and where Pittu's reading of it stands — null
   * status: never read (e.g. uploaded as a plain document). Null: no deed.
   */
  deed_reading: { document_id: string; status: AnalysisStatus | null } | null;
  health: PropertyHealth;
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

export interface PropertyVideo {
  id: string;
  property_id: string;
  caption: string | null;
  duration_seconds: number | null;
  file_size: number;
  /** Short-lived signed URL; never persist it. */
  url: string | null;
  created_at: string;
}

export interface PropertyDocument {
  id: string;
  property_id: string;
  document_type: DocumentType;
  file_name: string;
  description: string | null;
  /** Review status (staff-controlled). */
  status: DocumentStatus;
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
  /** Extra Service price in paise; null = priced after review. */
  price_paise: number | null;
  /** Can be requested as a paid Extra when not Included in the Plan. */
  is_extra_available: boolean;
  /** How it is delivered: an on-site visit, or paperwork help. */
  fulfilment: ServiceFulfilment;
  /** Where it can be delivered: service areas, service states, or anywhere. */
  reach: ServiceReach;
  /** What the service includes (short lines), shown before booking. */
  includes: string[];
  /** How long it usually takes, e.g. "Within 3–5 days of confirming". */
  turnaround: string | null;
  /** When an extra is paid: right after booking, once confirmed, or after the work. */
  payment_timing: PaymentTiming;
  /** Whether the customer may cancel it (only ever while Requested). */
  cancel_policy: CancelPolicy;
  /** Usual working days, for "Expected by" (null = we confirm a date). */
  expected_days: number | null;
}

export interface ServiceRequest {
  id: string;
  /** Human-facing reference, e.g. "PR-000123" (§23). */
  reference: string;
  status: ServiceRequestStatus;
  /** Copied from the service when opened; decides the steps and the result. */
  fulfilment: ServiceFulfilment;
  description: string;
  created_at: string;
  updated_at: string;
  service: Pick<
    Service,
    'id' | 'code' | 'name' | 'category' | 'includes' | 'turnaround' | 'expected_days'
  >;
  /** The service's rules when the request was made (later edits don't change them). */
  payment_timing: PaymentTiming;
  cancel_policy: CancelPolicy;
  /** Decided by the server when the request is opened (M4). */
  coverage: 'included' | 'extra';
  /** Extra price snapshot in paise; null when Included or priced after review. */
  price_paise: number | null;
  /** Customer's preferred date (YYYY-MM-DD), optional. */
  preferred_date: string | null;
  /** Customer's preferred time of day. */
  preferred_slot: 'morning' | 'afternoon' | 'evening' | null;
  scheduled_for: string | null;
  /** Latest customer-visible note from staff. */
  status_note: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: 'customer' | 'staff' | null;
  /** Null when the property was deleted after the request was made. */
  property: Pick<Property, 'id' | 'name' | 'city'> | null;
}
