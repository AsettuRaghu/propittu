import type {
  DocumentType,
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

export const PROPERTY_TYPE_ACCENTS: Record<PropertyType, Accent> = {
  land: 'teal',
  apartment: 'indigo',
  independent_house: 'violet',
  commercial: 'amber',
  industrial: 'slate',
  other: 'sky',
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

export const SERVICE_CATEGORY_ICONS: Record<ServiceCategory, IconName> = {
  property_government: 'government',
  property_care: 'shield-check',
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
  other: { icon: 'chat', accent: 'slate' },
};

export function serviceVisual(
  code: string,
  category: ServiceCategory,
): { icon: IconName; accent: Accent } {
  return (
    SERVICE_ICONS[code] ?? {
      icon: SERVICE_CATEGORY_ICONS[category],
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
  registration: { icon: 'verified', accent: 'indigo' },
  property_tax: { icon: 'receipt', accent: 'teal' },
  khata: { icon: 'government', accent: 'sky' },
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

export const STATUS_ICONS: Record<ServiceRequestStatus, IconName> = {
  requested: 'clock',
  confirmed: 'check',
  scheduled: 'calendar',
  in_progress: 'bolt',
  awaiting_customer: 'chat',
  completed: 'success',
  cancelled: 'cancelled',
};

export const TICKET_TONES: Record<TicketStatus, Tone> = {
  open: 'info',
  in_progress: 'brand',
  waiting_on_customer: 'warning',
  resolved: 'success',
  closed: 'neutral',
};
