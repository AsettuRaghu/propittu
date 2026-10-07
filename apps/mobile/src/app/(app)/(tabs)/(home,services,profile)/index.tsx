import { LinearGradient } from 'expo-linear-gradient';
import { openServicesTab } from '@/lib/nav';
import { router } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { DraftProperty } from '@propittu/shared';
import { useDraftProperties } from '@/api/ai';
import { DraftRow } from '@/components/DraftRow';
import { useMe, useProperties } from '@/api/queries';
import { Icon, type IconName } from '@/components/Icon';
import { PlanBanner } from '@/components/PlanBanner';
import { PropertyCard, PropertyCardSkeleton } from '@/components/PropertyCard';
import { PullRefresh } from '@/components/PullRefresh';
import { ErrorState, LimitedAccessState } from '@/components/States';
import { Button, IconButton, ListGroup, ListRow } from '@/components/ui';
import { greeting } from '@/lib/format';
import { accents, colors, font, gradients, radius, shadow, space, typography } from '@/theme';

function greetingIcon(now = new Date()): IconName {
  const h = now.getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 20) return 'evening';
  return 'night';
}

const addProperty = () => router.push('/properties/new');

/**
 * Home — the property locker. A clear greeting (wrapping for long names),
 * anything waiting for you, your properties (photo, place, live weather,
 * what needs attention) and quick ways onward. With no properties yet, a
 * bold welcome that says what Propittu does and starts the first one.
 */
export default function HomeScreen() {
  const me = useMe();
  // Strict Limited Access (M6): property data is not even fetched.
  const limited = me.data?.plan.access === 'limited';
  const { data, isPending, error, refetch } = useProperties(!limited);
  const drafts = useDraftProperties(!limited && !!me.data?.features.document_reading);
  const unfinished = waitingDrafts(drafts.data ?? []);
  const properties = data ?? [];
  const hasProperties = properties.length > 0;
  const firstName = me.data?.full_name?.split(' ')[0];

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <View style={[styles.flex, styles.greetRow]}>
          <View style={styles.greetIcon}>
            <Icon name={greetingIcon()} size={24} color={accents.amber.fg} />
          </View>
          <Text style={styles.greet} numberOfLines={2}>
            {firstName ? `${greeting()}, ${firstName}` : greeting()}
          </Text>
        </View>
        {!limited && hasProperties ? (
          <IconButton
            icon="add"
            label="Add property"
            variant="solid"
            size={44}
            onPress={addProperty}
          />
        ) : null}
      </View>

      {me.data && !limited ? <PlanBanner plan={me.data.plan} /> : null}

      {unfinished.length > 0 ? (
        <ListGroup title="Waiting for you" plain>
          {unfinished.map((d) => (
            <DraftRow key={d.id} draft={d} />
          ))}
        </ListGroup>
      ) : null}

      {hasProperties ? (
        <Text style={typography.heading}>
          Your properties <Text style={styles.count}>· {properties.length}</Text>
        </Text>
      ) : null}
    </View>
  );

  if (limited) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.pad}>{header}</View>
        <LimitedAccessState status={me.data?.plan.status} />
      </SafeAreaView>
    );
  }

  if (isPending || error) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={[styles.pad, styles.flex]}>
          {header}
          {isPending ? (
            <View style={styles.skeletons}>
              <PropertyCardSkeleton />
              <PropertyCardSkeleton />
            </View>
          ) : (
            <ErrorState error={error} onRetry={() => void refetch()} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={properties}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
        refreshControl={<PullRefresh onRefresh={() => Promise.all([refetch(), me.refetch()])} />}
        renderItem={({ item }) => (
          <PropertyCard property={item} onPress={() => router.push(`/properties/${item.id}`)} />
        )}
        ListFooterComponent={hasProperties ? <QuickActions /> : null}
        ListEmptyComponent={<Welcome />}
      />
    </SafeAreaView>
  );
}

/**
 * Deeds waiting to become properties: the ones Pittu is reading or has
 * read, and at most one that couldn't be read (older failures are cleared
 * away by the server, and never pile up here).
 */
function waitingDrafts(drafts: DraftProperty[]): DraftProperty[] {
  const withDeed = drafts.filter((d) => d.document_id);
  const failed = withDeed.find((d) => d.status === 'failed');
  return withDeed.filter((d) => d.status !== 'failed' || d === failed);
}

/** Onward from Home, using the pages that already exist. */
function QuickActions() {
  return (
    <View style={styles.footer}>
      <ListGroup title="Quick actions" plain>
        <ListRow
          icon="services"
          accent="teal"
          title="Book a service"
          subtitle="Visits, inspections, paperwork help"
          onPress={() => openServicesTab()}
        />
        <ListRow
          icon="requests"
          accent="indigo"
          title="My requests"
          onPress={() => openServicesTab('requests')}
        />
        <ListRow
          icon="support"
          accent="sky"
          title="Help & Support"
          onPress={() => router.push('/support')}
        />
      </ListGroup>
    </View>
  );
}

/* ---- No properties yet: the start of the Propittu experience ---- */

const PROMISES: { icon: IconName; accent: keyof typeof accents; title: string; text: string }[] = [
  {
    icon: 'document',
    accent: 'amber',
    title: 'Documents at your fingertips',
    text: 'Sale deed, tax receipts, Khata — safe, and always with you',
  },
  {
    icon: 'map',
    accent: 'teal',
    title: 'The exact location',
    text: 'See it on the map, navigate there, share it with anyone',
  },
  {
    icon: 'bell',
    accent: 'violet',
    title: 'Only what matters',
    text: 'Verified updates about your property — none of the noise',
  },
  {
    icon: 'services',
    accent: 'indigo',
    title: 'Trusted help on call',
    text: 'Visits, inspections and paperwork, done by our team',
  },
];

function Welcome() {
  return (
    <View style={styles.welcome}>
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, shadow]}
      >
        <View style={styles.heroBadge}>
          <Icon name="lock" size={26} color="#FFFFFF" />
        </View>
        <Text style={styles.heroTitle}>Your property locker</Text>
        <Text style={styles.heroText}>
          Everything about your property, verified and in one place. Add it once — we take it from
          there.
        </Text>
        <Button
          title="Add your first property"
          icon="add"
          variant="secondary"
          onPress={addProperty}
        />
      </LinearGradient>

      <ListGroup title="What you get" plain>
        {PROMISES.map((p) => (
          <ListRow
            key={p.title}
            icon={p.icon}
            accent={p.accent}
            title={p.title}
            subtitle={p.text}
            subtitleLines={2}
          />
        ))}
      </ListGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  pad: { paddingHorizontal: space.lg },
  header: { paddingTop: space.md, paddingBottom: space.md, gap: space.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  // A long name wraps to a second line at full size (never shrunk).
  greetRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  greetIcon: { height: font(32), justifyContent: 'center' },
  greet: {
    flex: 1,
    fontSize: font(26),
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
    lineHeight: font(32),
  },
  count: { color: colors.textSubtle, fontWeight: '700' },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, flexGrow: 1 },
  separator: { height: space.lg },
  skeletons: { gap: space.lg },
  footer: { marginTop: space.xl },
  welcome: { gap: space.xl },
  hero: { borderRadius: radius.lg, padding: space.xl, gap: space.md },
  heroBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: font(26), fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  heroText: { fontSize: font(15), lineHeight: font(21), color: 'rgba(255,255,255,0.9)' },
});
