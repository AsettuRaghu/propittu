import { Stack, router, useLocalSearchParams } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PROPERTY_TYPE_LABELS } from '@propittu/shared';
import { useProperty } from '@/api/queries';
import { PhotoSection } from '@/components/PhotoSection';
import { ErrorState, LoadingState } from '@/components/States';
import { Button, Card, KeyValue, SectionTitle } from '@/components/ui';
import { formatArea, formatLocation, plural } from '@/lib/format';
import { colors, space, typography } from '@/theme';

/** Property details (PRODUCT_SPEC.md §18) — kept deliberately uncluttered. */
export default function PropertyDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: property, isPending, error, refetch, isRefetching } = useProperty(id);

  if (isPending) return <LoadingState />;
  if (error) {
    return (
      <>
        <Stack.Screen options={{ title: 'Property' }} />
        <ErrorState error={error} onRetry={() => void refetch()} />
      </>
    );
  }

  const location = formatLocation(property);
  const address = [property.address_line, property.pincode].filter(Boolean).join(' – ');

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          tintColor={colors.primary}
        />
      }
    >
      <Stack.Screen options={{ title: property.name }} />

      <View style={styles.header}>
        <Text style={typography.title}>{property.name}</Text>
        {location ? <Text style={typography.small}>{location}</Text> : null}
      </View>

      <Card style={styles.facts}>
        <KeyValue label="Property" value={PROPERTY_TYPE_LABELS[property.property_type]} />
        <KeyValue label="Area" value={formatArea(property.area_value, property.area_unit)} />
        <KeyValue label="Khata / Property ID" value={property.khata_number} />
        <KeyValue label="Survey Number" value={property.survey_number} />
        <KeyValue label="Plot / Property Number" value={property.property_number} />
        <KeyValue label="Address" value={address || null} />
        <KeyValue label="Notes" value={property.notes} />
      </Card>

      <View style={styles.section}>
        <SectionTitle title="Photos" />
        <PhotoSection propertyId={property.id} photos={property.photos} />
      </View>

      <View style={styles.section}>
        <SectionTitle title="Documents" />
        <Card style={styles.linkCard}>
          <Text style={typography.bodyStrong}>{plural(property.document_count, 'Document')}</Text>
          <Button
            title="View Documents"
            variant="secondary"
            icon="folder-open-outline"
            onPress={() => router.push(`/properties/${property.id}/documents`)}
          />
        </Card>
      </View>

      <View style={styles.section}>
        <SectionTitle title="Services" />
        <Card style={styles.linkCard}>
          <Text style={typography.bodyStrong}>
            {plural(property.service_request_count, 'Request')}
          </Text>
          {property.service_request_count > 0 ? (
            <Button
              title="View Services"
              variant="secondary"
              icon="list-outline"
              onPress={() =>
                router.push({ pathname: '/requests', params: { propertyId: property.id } })
              }
            />
          ) : null}
          <Button
            title="Request a Service"
            variant="ghost"
            icon="add-circle-outline"
            onPress={() =>
              router.push({ pathname: '/services/request', params: { propertyId: property.id } })
            }
          />
        </Card>
      </View>

      <Button
        title="Edit Property"
        variant="secondary"
        icon="create-outline"
        onPress={() => router.push(`/properties/${property.id}/edit`)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl },
  header: { gap: space.xs },
  facts: { gap: space.lg },
  section: { gap: 0 },
  linkCard: { gap: space.md },
});
