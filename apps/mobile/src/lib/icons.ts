import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { PropertyType, ServiceCategory, ServiceRequestStatus } from '@propittu/shared';
import type { Tone } from '@/components/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

export const PROPERTY_TYPE_ICONS: Record<PropertyType, IconName> = {
  land: 'map-outline',
  apartment: 'business-outline',
  independent_house: 'home-outline',
  commercial: 'storefront-outline',
  industrial: 'construct-outline',
  other: 'location-outline',
};

export const SERVICE_CATEGORY_ICONS: Record<ServiceCategory, IconName> = {
  property_government: 'document-text-outline',
  property_care: 'shield-checkmark-outline',
  other: 'chatbubble-ellipses-outline',
};

/** §38 "Clear status indicators". */
export const STATUS_TONES: Record<ServiceRequestStatus, Tone> = {
  submitted: 'info',
  in_review: 'warning',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'neutral',
};
