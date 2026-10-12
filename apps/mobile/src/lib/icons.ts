import type {
  DocumentType,
  TicketCategory,
  TicketStatus,
  PropertyType,
  ServiceCategory,
  ServiceFulfilment,
  ServiceRequestStatus,
} from '@propittu/shared';
import type { IconName } from '@/components/Icon';
import type { Tone } from '@/components/ui';
import type { Accent } from '@/theme';

/** Property type → icon + accent (Home cards, forms, pickers). */
export const PROPERTY_TYPE_ICONS: Record<PropertyType, IconName> = {
  land: 'land',
  apartment: 'apartment',
  independent_house: 'home',
  commercial: 'store',
  industrial: 'factory',
  other: 'pin',
};

/** Placeholder artwork when a property has no photo yet. */
export const PROPERTY_TYPE_GRADIENTS: Record<PropertyType, readonly [string, string]> = {
  land: ['#0F9488', '#0284C7'],
  apartment: ['#4338CA', '#6D3FE0'],
  independent_house: ['#6D3FE0', '#C2378F'],
  commercial: ['#C2730A', '#E5533D'],
  industrial: ['#5A6079', '#3B3F58'],
  other: ['#0284C7', '#4338CA'],
};

const SERVICE_CATEGORY_ICONS: Record<string, IconName> = {
  property_government: 'government',
  property_care: 'shield-check',
  rentals: 'key',
  other: 'chat',
};

/** Per-service icon + accent, by catalogue code (falls back to the category). */
const SERVICE_ICONS: Record<string, { icon: IconName; accent: Accent }> = {
  property_visit: { icon: 'compass', accent: 'teal' },
  site_inspection: { icon: 'search', accent: 'indigo' },
  property_photography: { icon: 'camera', accent: 'sky' },
  video_documentation: { icon: 'video', accent: 'rose' },
  property_cleaning: { icon: 'cleaning', accent: 'teal' },
  maintenance: { icon: 'wrench', accent: 'amber' },
  repair: { icon: 'hammer', accent: 'coral' },
  security_site_check: { icon: 'shield-check', accent: 'violet' },
  property_tax_assistance: { icon: 'receipt', accent: 'amber' },
  document_verification: { icon: 'document-check', accent: 'indigo' },
  khata_mutation_assistance: { icon: 'deed', accent: 'violet' },
  compliance_alert_assistance: { icon: 'bell', accent: 'coral' },
  name_correction: { icon: 'user', accent: 'amber' },
  certified_copy: { icon: 'document-check', accent: 'indigo' },
  lost_document_recovery: { icon: 'search', accent: 'coral' },
  ec_request: { icon: 'document-check', accent: 'violet' },
  will_succession: { icon: 'users', accent: 'violet' },
  tenant_search: { icon: 'users', accent: 'sky' },
  rental_agreement: { icon: 'document', accent: 'indigo' },
  tenant_verification: { icon: 'verified', accent: 'teal' },
  rental_management: { icon: 'key', accent: 'violet' },
  other: { icon: 'chat', accent: 'slate' },
};

export function serviceVisual(
  code: string,
  category: ServiceCategory,
): { icon: IconName; accent: Accent } {
  return (
    SERVICE_ICONS[code] ?? {
      icon: SERVICE_CATEGORY_ICONS[category] ?? 'services',
      accent: category === 'property_government' ? 'amber' : 'teal',
    }
  );
}

/** On-site services get a preferred date + time of day; paperwork does not. */
/** On-site work gets a date and a visit; paperwork help does not. */
export function isOnSiteService(service: { fulfilment: ServiceFulfilment }): boolean {
  return service.fulfilment === 'visit';
}

export const DOCUMENT_TYPE_VISUALS: Record<DocumentType, { icon: IconName; accent: Accent }> = {
  sale_deed: { icon: 'deed', accent: 'amber' },
  link_deed: { icon: 'deed', accent: 'slate' },
  gift_partition: { icon: 'deed', accent: 'rose' },
  will_succession: { icon: 'users', accent: 'violet' },
  power_of_attorney: { icon: 'user', accent: 'indigo' },
  court_order: { icon: 'government', accent: 'coral' },
  registration: { icon: 'verified', accent: 'indigo' },
  encumbrance_certificate: { icon: 'document-check', accent: 'violet' },
  land_record: { icon: 'land', accent: 'teal' },
  mutation: { icon: 'refresh', accent: 'teal' },
  survey_sketch: { icon: 'map', accent: 'sky' },
  conversion_order: { icon: 'government', accent: 'amber' },
  khata: { icon: 'government', accent: 'sky' },
  property_tax: { icon: 'receipt', accent: 'teal' },
  building_plan: { icon: 'building', accent: 'indigo' },
  occupancy_certificate: { icon: 'verified', accent: 'teal' },
  layout_approval: { icon: 'grid', accent: 'sky' },
  sale_agreement: { icon: 'document', accent: 'amber' },
  possession_letter: { icon: 'key', accent: 'violet' },
  rera: { icon: 'shield', accent: 'indigo' },
  association: { icon: 'users', accent: 'sky' },
  loan_papers: { icon: 'wallet', accent: 'amber' },
  loan_closure: { icon: 'success', accent: 'teal' },
  rental_agreement: { icon: 'key', accent: 'rose' },
  utility_bill: { icon: 'bolt', accent: 'amber' },
  insurance: { icon: 'shield', accent: 'teal' },
  owner_id: { icon: 'user', accent: 'slate' },
  other: { icon: 'document', accent: 'slate' },
};

/** §38 "Clear status indicators". */
export const STATUS_TONES: Record<ServiceRequestStatus, Tone> = {
  requested: 'info',
  confirmed: 'brand',
  scheduled: 'warning',
  in_progress: 'warning',
  awaiting_customer: 'danger',
  completed: 'success',
  cancelled: 'neutral',
};

export const TICKET_TONES: Record<TicketStatus, Tone> = {
  open: 'info',
  in_progress: 'brand',
  waiting_on_customer: 'warning',
  resolved: 'success',
  closed: 'neutral',
};

/** Support ticket categories. */
export const TICKET_CATEGORY_ICONS: Record<TicketCategory, IconName> = {
  account: 'user',
  plan_billing: 'card',
  property: 'home',
  documents: 'document',
  service_request: 'requests',
  app_issue: 'mobile',
  other: 'chat',
};
