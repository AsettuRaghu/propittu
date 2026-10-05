import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { PROPERTY_TYPE_LABELS, type CompletionItem } from '@propittu/shared';
import { useProperty } from '@/api/queries';
import { CompletionCard } from '@/components/CompletionCard';
import { PhotoSection } from '@/components/PhotoSection';
import { ErrorState, LoadingState } from '@/components/States';
import { VideoSection } from '@/components/VideoSection';
import { Button, Card, KeyValue, SectionTitle } from '@/components/ui';
import { formatArea, formatLocation, plural } from '@/lib/format';
import { colors, radius, space, typography } from '@/theme';

/** Property details (§18, M2/M3) — kept deliberately uncluttered. */
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
  const hasPin = property.latitude !== null && property.longitude !== null;
  const openLocation = () => router.push(`/properties/${property.id}/location`);

  // Next actions from the completion card.
  const onAction = (item: CompletionItem) => {
    switch (item.key) {
      case 'location':
        return openLocation();
      case 'sale_deed':
      case 'property_tax':
        return router.push({
          pathname: '/properties/[id]/add-document',
          params: { id: property.id, type: item.key },
        });
      case 'photo':
        return; // The Photos section below has the Add button.
      default:
        return router.push(`/properties/${property.id}/edit`);
    }
  };

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

      <CompletionCard completion={property.completion} onAction={onAction} />

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
        <SectionTitle title="Location" />
        {hasPin ? (
          <Pressable
            onPress={openLocation}
            accessibilityRole="button"
            accessibilityLabel="Change location"
          >
            <MapView
              style={styles.map}
              pointerEvents="none"
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
              initialRegion={{
                latitude: property.latitude as number,
                longitude: property.longitude as number,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
            >
              <Marker
                coordinate={{
                  latitude: property.latitude as number,
                  longitude: property.longitude as number,
                }}
                pinColor={colors.primary}
              />
            </MapView>
            <Text style={[typography.caption, styles.mapCaption]}>
              Confirmed by you · tap to change
            </Text>
          </Pressable>
        ) : (
          <Card style={styles.linkCard}>
            <Text style={typography.small}>
              Mark exactly where the property is. It helps with visits and inspections.
            </Text>
            <Button title="Set location on map" icon="map-outline" onPress={openLocation} />
          </Card>
        )}
      </View>

      <View style={styles.section}>
        <SectionTitle title="Photos" />
        <PhotoSection propertyId={property.id} photos={property.photos} />
      </View>

      <View style={styles.section}>
        <SectionTitle title="Videos" />
        <VideoSection propertyId={property.id} videos={property.videos} />
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
  map: { height: 160, borderRadius: radius.lg, overflow: 'hidden' },
  mapCaption: { marginTop: space.xs },
});
