import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  formatPrice,
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
  type CatalogueService,
} from '@propittu/shared';
import { useMe, useServices } from '@/api/queries';
import { Icon } from '@/components/Icon';
import { LimitedAccessState } from '@/components/PlanGate';
import { ServiceRequestList } from '@/components/ServiceRequestList';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { GradientCard, IconTile, Segmented } from '@/components/ui';
import { serviceVisual } from '@/lib/icons';
import { accents, colors, gradients, radius, shadow, space, typography } from '@/theme';

type Segment = 'browse' | 'requests';

/** Services tab: browse the catalogue (§22) or follow your requests (§8.4). */
export default function ServicesScreen() {
  const [segment, setSegment] = useState<Segment>('browse');
  const me = useMe();
  const limited = me.data?.plan.access === 'limited';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={typography.display}>Services</Text>
        <Text style={typography.small}>Trusted help for your property, booked in a minute.</Text>
        {!limited ? (
          <Segmented
            options={[
              { value: 'browse', label: 'Browse' },
              { value: 'requests', label: 'My requests' },
            ]}
            value={segment}
            onChange={setSegment}
          />
        ) : null}
      </View>
      {limited ? (
        <LimitedAccessState status={me.data?.plan.status} />
      ) : segment === 'browse' ? (
        <Catalogue />
      ) : (
        <ServiceRequestList />
      )}
    </SafeAreaView>
  );
}

const book = (service: CatalogueService) =>
  router.push({ pathname: '/services/request', params: { serviceId: service.id } });

function priceLabel(s: CatalogueService): string {
  if (s.coverage === 'included') return 'Included';
  if (s.coverage === 'unavailable') return 'Not on your plan';
  return s.price_paise !== null ? formatPrice(s.price_paise) : 'On quote';
}

function Catalogue() {
  const { data, isPending, error, refetch, isRefetching } = useServices();

  const { featured, sections } = useMemo(() => {
    const all = data ?? [];
    const visit = all.find((s) => s.code === 'property_visit') ?? null;
    return {
      featured: visit,
      sections: SERVICE_CATEGORIES.map((category) => ({
        category,
        title: SERVICE_CATEGORY_LABELS[category],
        items: all.filter((s) => s.category === category && s.id !== visit?.id),
      })).filter((s) => s.items.length > 0),
    };
  }, [data]);

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!featured && sections.length === 0) {
    return <EmptyState icon="services" title="No services available right now" />;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          tintColor={colors.primary}
        />
      }
    >
      {featured ? <Featured service={featured} /> : null}

      {sections.map((section) => (
        <View key={section.category} style={styles.section}>
          <Text style={typography.heading}>{section.title}</Text>
          <View style={styles.grid}>
            {section.items.map((s) => (
              <ServiceTile key={s.id} service={s} />
            ))}
          </View>
        </View>
      ))}

      {/* §5 / §22: no legal advice, no promised government outcomes. */}
      <Text style={[typography.caption, styles.disclaimer]}>
        Propittu helps you request assistance with your property. We do not provide legal advice or
        guarantee outcomes with government departments.
      </Text>
    </ScrollView>
  );
}

function Featured({ service }: { service: CatalogueService }) {
  const included = service.coverage === 'included';
  return (
    <GradientCard colors={gradients.visit} onPress={() => book(service)} style={styles.featured}>
      <View style={styles.featuredTop}>
        <View style={styles.featuredIcon}>
          <Icon name="compass" size={24} color="#FFFFFF" />
        </View>
        <View style={styles.featuredPill}>
          <Text style={styles.featuredPillText}>
            {included
              ? `Included · ${service.included_remaining} left`
              : service.price_paise !== null
                ? formatPrice(service.price_paise)
                : 'On quote'}
          </Text>
        </View>
      </View>
      <Text style={styles.featuredTitle}>{service.name}</Text>
      <Text style={styles.featuredText} numberOfLines={2}>
        {service.description}
      </Text>
      <View style={styles.featuredCta}>
        <Text style={styles.featuredCtaText}>Book a visit</Text>
        <Icon name="arrow" size={16} color={accents.indigo.fg} strokeWidth={2.5} />
      </View>
    </GradientCard>
  );
}

function ServiceTile({ service }: { service: CatalogueService }) {
  const v = serviceVisual(service.code, service.category);
  const unavailable = service.coverage === 'unavailable';
  return (
    <Pressable
      onPress={() => book(service)}
      accessibilityRole="button"
      accessibilityLabel={service.name}
      style={({ pressed }) => [
        styles.tile,
        shadow,
        unavailable && styles.tileMuted,
        pressed && styles.pressed,
      ]}
    >
      <IconTile icon={v.icon} accent={v.accent} size={40} />
      <Text style={styles.tileName} numberOfLines={2}>
        {service.name}
      </Text>
      <View
        style={[
          styles.price,
          service.coverage === 'included' && { backgroundColor: accents.teal.bg },
        ]}
      >
        <Text
          style={[styles.priceText, service.coverage === 'included' && { color: accents.teal.fg }]}
        >
          {priceLabel(service)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
    gap: space.sm,
  },
  content: { padding: space.lg, paddingTop: space.sm, gap: space.xl, paddingBottom: space.xxl },
  section: { gap: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: {
    width: '47.5%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
    minHeight: 136,
  },
  tileMuted: { opacity: 0.6 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  tileName: { fontSize: 14, fontWeight: '700', color: colors.text, flex: 1 },
  price: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  priceText: { fontSize: 12, fontWeight: '800', color: colors.text },
  featured: { gap: space.sm, padding: space.xl },
  featuredTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  featuredIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredPill: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  featuredPillText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  featuredTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginTop: space.xs,
  },
  featuredText: { color: 'rgba(255,255,255,0.88)', fontSize: 13, lineHeight: 18 },
  featuredCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: 10,
    marginTop: space.sm,
  },
  featuredCtaText: { color: accents.indigo.fg, fontSize: 14, fontWeight: '800' },
  disclaimer: { textAlign: 'center' },
});
