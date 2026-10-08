import { Stack, useLocalSearchParams } from 'expo-router';
import { useProperty } from '@/api/queries';
import { ServiceRequestList } from '@/components/ServiceRequestList';

/**
 * One property's service requests — in progress first, then past ones.
 * Reached from the Home card's requests icon (when more than one is open,
 * or none) and from "All requests" on the property page.
 */
export default function PropertyRequestsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: property } = useProperty(id);
  return (
    <>
      <Stack.Screen options={{ title: property?.name ?? 'Service requests' }} />
      <ServiceRequestList propertyId={id} />
    </>
  );
}
