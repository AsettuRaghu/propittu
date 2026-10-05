import { useLocalSearchParams } from 'expo-router';
import { ServiceRequestList } from '@/components/ServiceRequestList';

/** A property's service requests — "View Services" on Property Details (§18). */
export default function PropertyRequestsScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId?: string }>();
  return <ServiceRequestList propertyId={propertyId} />;
}
