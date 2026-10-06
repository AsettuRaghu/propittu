import { router } from 'expo-router';
import type { CompletionKey } from '@propittu/shared';

/**
 * Where each profile-completion step is done (Home tile and the property
 * screen share this, so a step always opens the same place).
 */
export function goToCompletionStep(propertyId: string, key: CompletionKey): void {
  switch (key) {
    case 'location':
      router.push(`/properties/${propertyId}/location`);
      return;
    case 'sale_deed':
    case 'property_tax':
      router.push({
        pathname: '/properties/[id]/add-document',
        params: { id: propertyId, type: key },
      });
      return;
    case 'photo':
      // The property screen's Photos section has the picker.
      router.push(`/properties/${propertyId}`);
      return;
    default:
      router.push(`/properties/${propertyId}/edit`);
  }
}
