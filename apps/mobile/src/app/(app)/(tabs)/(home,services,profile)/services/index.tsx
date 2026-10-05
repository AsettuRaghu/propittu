import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import {
  formatPrice,
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
  type CatalogueService,
} from '@propittu/shared';
import { useMe, useServices } from '@/api/queries';
import { LimitedAccessState } from '@/components/PlanGate';
import { ServiceRequestList } from '@/components/ServiceRequestList';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Badge, Card } from '@/components/ui';
import { SERVICE_CATEGORY_ICONS } from '@/lib/icons';
import { colors, radius, space, typography } from '@/theme';

type Segment = 'browse' | 'requests';

/**
 * Services tab: browse the catalogue (§22) or see your requests (§8.4).
 * One tab with two segments keeps the navigation to three tabs.
 */
export default function ServicesScreen() {
  const [segment, setSegment] = useState<Segment>('browse');
  const me = useMe();

  if (me.data?.plan.access === 'limited')
    return <LimitedAccessState status={me.data.plan.status} />;

  return (
    <View style={styles.flex}>
      <View style={styles.segments} accessibilityRole="tablist">
        <SegmentButton
          label="Browse services"
          active={segment === 'browse'}
          onPress={() => setSegment('browse')}
        />
        <SegmentButton
          label="My requests"
          active={segment === 'requests'}
          onPress={() => setSegment('requests')}
        />
      </View>
      {segment === 'browse' ? <Catalogue /> : <ServiceRequestList />}
    </View>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.segment, active && styles.segmentActive]}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Catalogue() {
  const { data, isPending, error, refetch } = useServices();

  const sections = useMemo(
    () =>
      SERVICE_CATEGORIES.map((category) => ({
        category,
        title: SERVICE_CATEGORY_LABELS[category],
        data: (data ?? []).filter((s) => s.category === category),
      })).filter((s) => s.data.length > 0),
    [data],
  );

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (sections.length === 0) {
    return <EmptyState icon="construct-outline" title="No services available right now" />;
  }

  const request = (service: CatalogueService) =>
    router.push({ pathname: '/services/request', params: { serviceId: service.id } });

  return (
    <SectionList
      sections={sections}
      keyExtractor={(s) => s.id}
      contentContainerStyle={styles.list}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <Ionicons
            name={SERVICE_CATEGORY_ICONS[section.category]}
            size={18}
            color={colors.primary}
          />
          <Text style={typography.overline}>{section.title}</Text>
        </View>
      )}
      ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
      renderItem={({ item }) => (
        <Card onPress={() => request(item)} style={styles.service}>
          <View style={styles.serviceBody}>
            <Text style={typography.bodyStrong}>{item.name}</Text>
            <Text style={typography.small}>{item.description}</Text>
            <CoverageTag service={item} />
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
        </Card>
      )}
      ListFooterComponent={
        // §5 / §22: no legal advice, no promised government outcomes.
        <Text style={[typography.caption, styles.disclaimer]}>
          Propittu helps you request assistance with your property. We do not provide legal advice
          or guarantee outcomes with government departments.
        </Text>
      }
    />
  );
}

/** Included in the Plan, or an Extra Service with its price (M4). */
export function CoverageTag({ service }: { service: CatalogueService }) {
  if (service.coverage === 'included') {
    return (
      <Badge tone="success" label={`Included in your plan · ${service.included_remaining} left`} />
    );
  }
  if (service.coverage === 'unavailable') {
    return <Badge tone="neutral" label="Not available on your plan" />;
  }
  return (
    <Badge
      tone="info"
      label={
        service.price_paise !== null
          ? `Extra · ${formatPrice(service.price_paise)}`
          : 'Extra · price confirmed after review'
      }
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  segments: {
    flexDirection: 'row',
    margin: space.lg,
    marginBottom: 0,
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  segment: { flex: 1, paddingVertical: space.sm, borderRadius: radius.sm, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
  segmentTextActive: { color: colors.text, fontWeight: '600' },
  list: { padding: space.lg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  service: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  serviceBody: { flex: 1, gap: space.xs },
  disclaimer: { marginTop: space.xl, textAlign: 'center' },
});
