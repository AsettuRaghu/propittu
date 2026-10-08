import { Stack, router, useLocalSearchParams } from 'expo-router';
import { PropertyContext } from '@/components/PropertyContext';
import { ServiceRequestList } from '@/components/ServiceRequestList';
import { IconButton } from '@/components/ui';

/**
 * One property's service requests — same pattern as Documents: the header
 * names the page, + books a service for this property, and a quiet line
 * says whose requests these are. In progress first, then past ones.
 */
export default function PropertyRequestsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              icon="add"
              label="Book a service for this property"
              size={36}
              onPress={() =>
                router.push({ pathname: '/services/request', params: { propertyId: id } })
              }
            />
          ),
        }}
      />
      <ServiceRequestList propertyId={id} header={<PropertyContext propertyId={id} />} />
    </>
  );
}
