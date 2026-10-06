import { useRef } from 'react';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  PROPERTY_TYPE_LABELS,
  SERVICE_REQUEST_STATUS_LABELS,
  type CompletionItem,
  type PropertyDetail,
} from '@propittu/shared';
import { PullRefresh } from '@/components/PullRefresh';
import { useProperty, useServiceRequests } from '@/api/queries';
import { CompletionCard } from '@/components/CompletionCard';
import { DocumentSlots } from '@/components/DocumentSlots';
import { Icon, type IconName } from '@/components/Icon';
import { PhotoSection, type PhotoSectionHandle } from '@/components/PhotoSection';
import { PropertyMapCard } from '@/components/PropertyMapCard';
import { ErrorState, LoadingState } from '@/components/States';
import { VideoSection } from '@/components/VideoSection';
import { Badge, Card, IconButton, IconTile, LinkButton, SectionTitle } from '@/components/ui';
import { formatArea, formatDate, formatLocation } from '@/lib/format';
import { goToCompletionStep } from '@/lib/propertySteps';
import { PROPERTY_TYPE_ICONS, STATUS_TONES, serviceVisual } from '@/lib/icons';
import { accents, colors, radius, shadow, space, typography, type Accent } from '@/theme';

/** Property details (§18, M2/M3): map first, everything one tap away. */
export default function PropertyDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: property, isPending, error, refetch } = useProperty(id);
  const photosRef = useRef<PhotoSectionHandle>(null);

  if (isPending) return <LoadingState />;
  if (error) {
    return (
      <>
        <Stack.Screen options={{ title: 'Property' }} />
        <ErrorState error={error} onRetry={() => void refetch()} />
      </>
    );
  }

  const edit = () => router.push(`/properties/${property.id}/edit`);

  // Next actions from the completion card (photos open the picker right here).
  const onAction = (item: CompletionItem) =>
    item.key === 'photo' ? photosRef.current?.add() : goToCompletionStep(property.id, item.key);

  const location = formatLocation(property);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<PullRefresh onRefresh={() => refetch()} />}
    >
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <IconButton icon="edit" label="Edit property" onPress={edit} size={36} />
          ),
        }}
      />

      {/* Name, type and place — compact */}
      <View style={styles.header}>
        <Text style={typography.display} numberOfLines={2}>
          {property.name}
        </Text>
        <View style={styles.meta}>
          <Badge
            label={PROPERTY_TYPE_LABELS[property.property_type].split(' / ')[0] ?? ''}
            icon={PROPERTY_TYPE_ICONS[property.property_type]}
            tone="brand"
          />
          {location ? (
            <View style={styles.place}>
              <Icon name="pin" size={14} color={colors.textMuted} />
              <Text style={typography.small} numberOfLines={1}>
                {location}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <PropertyMapCard property={property} />

      {/* Quick actions. Edit lives in the header; location in the map card. */}
      <View style={styles.quick}>
        <Quick
          icon="document"
          label="Documents"
          accent="amber"
          onPress={() => router.push(`/properties/${property.id}/documents`)}
        />
        <Quick
          icon="services"
          label="Book service"
          accent="teal"
          onPress={() =>
            router.push({ pathname: '/services/request', params: { propertyId: property.id } })
          }
        />
        <Quick
          icon="camera"
          label="Add photos"
          accent="sky"
          onPress={() => photosRef.current?.add()}
        />
      </View>

      <CompletionCard completion={property.completion} onAction={onAction} />

      <Facts property={property} />

      <View>
        <SectionTitle
          title="Documents"
          action={
            <LinkButton
              title="See all"
              onPress={() => router.push(`/properties/${property.id}/documents`)}
            />
          }
        />
        <DocumentSlots propertyId={property.id} />
      </View>

      <View>
        <SectionTitle title="Photos" subtitle={`${property.photos.length} added`} />
        <PhotoSection ref={photosRef} propertyId={property.id} photos={property.photos} />
      </View>

      <View>
        <SectionTitle title="Videos" subtitle="Up to 60 seconds each" />
        <VideoSection propertyId={property.id} videos={property.videos} />
      </View>

      <RecentRequests property={property} />
    </ScrollView>
  );
}

function Quick({
  icon,
  label,
  accent,
  onPress,
}: {
  icon: IconName;
  label: string;
  accent: Accent;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.quickItem, shadow, pressed && { opacity: 0.8 }]}
    >
      <IconTile icon={icon} accent={accent} size={38} />
      <Text style={styles.quickLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Key facts as a compact two-column grid; empty facts are simply hidden. */
function Facts({ property }: { property: PropertyDetail }) {
  const all: { icon: IconName; label: string; value: string | null }[] = [
    { icon: 'area', label: 'Area', value: formatArea(property.area_value, property.area_unit) },
    { icon: 'tag', label: 'Survey no.', value: property.survey_number },
    { icon: 'deed', label: 'Khata / Property ID', value: property.khata_number },
    { icon: 'home', label: 'Plot / Property no.', value: property.property_number },
  ];
  const facts = all.filter((f) => f.value);
  const address = [property.address_line, property.city, property.state, property.pincode]
    .filter(Boolean)
    .join(', ');

  if (facts.length === 0 && !address && !property.notes) return null;
  return (
    <Card style={styles.facts}>
      {facts.length > 0 ? (
        <View style={styles.factGrid}>
          {facts.map((f) => (
            <View key={f.label} style={styles.fact}>
              <Text style={typography.caption}>{f.label}</Text>
              <Text style={typography.bodyStrong} numberOfLines={1}>
                {f.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {address ? (
        <View style={styles.factRow}>
          <Icon name="pin" size={16} color={accents.teal.fg} />
          <Text style={[typography.body, styles.flex]}>{address}</Text>
        </View>
      ) : null}
      {property.notes ? (
        <View style={styles.factRow}>
          <Icon name="document" size={16} color={accents.amber.fg} />
          <Text style={[typography.small, styles.flex]}>{property.notes}</Text>
        </View>
      ) : null}
    </Card>
  );
}

function RecentRequests({ property }: { property: PropertyDetail }) {
  const { data } = useServiceRequests(property.id);
  const recent = (data ?? []).slice(0, 3);
  return (
    <View>
      <SectionTitle
        title="Services"
        action={
          recent.length > 0 ? (
            <LinkButton
              title="See all"
              onPress={() =>
                router.push({ pathname: '/requests', params: { propertyId: property.id } })
              }
            />
          ) : undefined
        }
      />
      <Card style={styles.requests}>
        {recent.map((r) => {
          const v = serviceVisual(r.service.code, r.service.category);
          return (
            <Pressable
              key={r.id}
              onPress={() => router.push(`/requests/${r.id}`)}
              style={({ pressed }) => [styles.requestRow, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
            >
              <IconTile icon={v.icon} accent={v.accent} size={36} />
              <View style={styles.flex}>
                <Text style={typography.bodyStrong} numberOfLines={1}>
                  {r.service.name}
                </Text>
                <Text style={typography.caption}>{formatDate(r.created_at)}</Text>
              </View>
              <Badge
                label={SERVICE_REQUEST_STATUS_LABELS[r.status]}
                tone={STATUS_TONES[r.status]}
              />
            </Pressable>
          );
        })}
        <Pressable
          onPress={() =>
            router.push({ pathname: '/services/request', params: { propertyId: property.id } })
          }
          style={({ pressed }) => [styles.bookRow, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          <View style={styles.bookIcon}>
            <Icon name="add" size={18} color={colors.primary} strokeWidth={2.5} />
          </View>
          <Text style={styles.bookText}>Book a service for this property</Text>
        </Pressable>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  content: { padding: space.lg, paddingTop: space.xs, gap: space.xl, paddingBottom: space.xxl },
  header: { gap: space.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  place: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  quick: { flexDirection: 'row', gap: space.sm },
  quickItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  quickLabel: { fontSize: 12, fontWeight: '700', color: colors.text },
  facts: { gap: space.md },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md },
  fact: { width: '50%', gap: 2, paddingRight: space.sm },
  factRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  requests: { gap: space.xs, paddingVertical: space.sm },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
  },
  bookRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  bookIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookText: { fontSize: 14, fontWeight: '700', color: colors.primary },
});
