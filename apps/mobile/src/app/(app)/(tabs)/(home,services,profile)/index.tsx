import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMe, useProperties } from '@/api/queries';
import { Icon, type IconName } from '@/components/Icon';
import { LimitedAccessState, PlanBanner } from '@/components/PlanGate';
import { PropertyCard, PropertyCardSkeleton } from '@/components/PropertyCard';
import { PullRefresh } from '@/components/PullRefresh';
import { ErrorState } from '@/components/States';
import { Button, IconButton, IconTile } from '@/components/ui';
import { greeting } from '@/lib/format';
import {
  accents,
  colors,
  gradients,
  radius,
  shadow,
  space,
  typography,
  type Accent,
} from '@/theme';

function greetingIcon(now = new Date()): IconName {
  const h = now.getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 20) return 'evening';
  return 'night';
}

/**
 * Home (§15) answers three things: what properties do I have, what needs my
 * attention (on each tile), and what can I do next (the actions below).
 */
export default function HomeScreen() {
  const me = useMe();
  // Strict Limited Access (M6): property data is not even fetched.
  const limited = me.data?.plan.access === 'limited';
  const { data, isPending, error, refetch } = useProperties(!limited);
  const addProperty = () => router.push('/properties/new');
  const name = me.data?.full_name?.split(' ')[0];
  const hasProperties = !!data && data.length > 0;

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <View style={styles.greetRow}>
            <Icon name={greetingIcon()} size={14} color={accents.amber.fg} />
            <Text style={styles.greet}>{greeting()},</Text>
          </View>
          <Text style={typography.display} numberOfLines={1}>
            {name ?? 'Welcome'}
          </Text>
        </View>
        {!limited && hasProperties ? (
          <IconButton
            icon="add"
            label="Add property"
            variant="solid"
            size={40}
            onPress={addProperty}
          />
        ) : null}
      </View>
      {me.data && !limited ? <PlanBanner plan={me.data.plan} /> : null}
      {hasProperties ? (
        <Text style={styles.section}>
          My properties <Text style={styles.count}>· {data.length}</Text>
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
        data={data}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
        showsVerticalScrollIndicator={false}
        refreshControl={<PullRefresh onRefresh={() => Promise.all([refetch(), me.refetch()])} />}
        renderItem={({ item }) => (
          <PropertyCard property={item} onPress={() => router.push(`/properties/${item.id}`)} />
        )}
        ListFooterComponent={hasProperties ? <NextActions /> : null}
        ListEmptyComponent={<Welcome onAdd={addProperty} />}
      />
    </SafeAreaView>
  );
}

/* ---- What can I do next ---- */

function NextActions() {
  return (
    <View style={styles.next}>
      <Text style={styles.section}>Do more</Text>
      <View style={styles.actions}>
        <Action
          icon="services"
          accent="teal"
          label="Book a service"
          onPress={() => router.push('/services')}
        />
        <Action
          icon="requests"
          accent="indigo"
          label="My requests"
          onPress={() => router.push('/requests')}
        />
        <Action
          icon="support"
          accent="sky"
          label="Get help"
          onPress={() => router.push('/support')}
        />
      </View>
    </View>
  );
}

function Action({
  icon,
  accent,
  label,
  onPress,
}: {
  icon: IconName;
  accent: Accent;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.action, shadow, pressed && { opacity: 0.85 }]}
    >
      <IconTile icon={icon} accent={accent} size={30} />
      <Text style={styles.actionLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ---- No properties yet: the start of the Propittu experience ---- */

const BENEFITS: { icon: IconName; accent: Accent; title: string; text: string }[] = [
  { icon: 'document', accent: 'amber', title: 'Documents', text: 'Sale deed, tax, Khata — safe' },
  { icon: 'images', accent: 'sky', title: 'Photos & videos', text: 'See it from anywhere' },
  { icon: 'services', accent: 'teal', title: 'Services', text: 'Visits, cleaning, repairs' },
];

function Welcome({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={styles.welcome}>
      <View style={[styles.hero, shadow]}>
        <LinearGradient
          colors={[accents.indigo.bg, colors.surface]}
          style={styles.heroArt}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        >
          <View style={[styles.float, styles.floatLeft]}>
            <Icon name="document" size={16} color={accents.amber.fg} />
          </View>
          <LinearGradient colors={gradients.brand} style={styles.houseTile}>
            <Icon name="home" size={38} color="#FFFFFF" strokeWidth={1.8} />
          </LinearGradient>
          <View style={[styles.float, styles.floatRight]}>
            <Icon name="image" size={16} color={accents.sky.fg} />
          </View>
        </LinearGradient>
        <View style={styles.heroBody}>
          <Text style={[typography.title, styles.center]}>Let&apos;s add your first property</Text>
          <Text style={[typography.small, styles.center]}>
            Keep its documents, photos, location and services together — so you always know
            it&apos;s in good hands.
          </Text>
          <Button title="Add property" icon="add" onPress={onAdd} />
        </View>
      </View>

      <Text style={styles.section}>What you&apos;ll get</Text>
      <View style={styles.benefits}>
        {BENEFITS.map((b) => (
          <View key={b.title} style={[styles.benefit, shadow]}>
            <IconTile icon={b.icon} accent={b.accent} size={32} />
            <Text style={styles.benefitTitle}>{b.title}</Text>
            <Text style={styles.benefitText}>{b.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  pad: { paddingHorizontal: space.lg },
  header: { paddingTop: space.md, paddingBottom: space.md, gap: space.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  greetRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  greet: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  section: { ...typography.heading, marginTop: space.xs },
  count: { color: colors.textSubtle, fontWeight: '700' },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, flexGrow: 1 },
  skeletons: { gap: space.md },
  next: { marginTop: space.xl, gap: space.md },
  actions: { flexDirection: 'row', gap: space.sm },
  action: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
  actionLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
  welcome: { gap: space.md },
  hero: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  heroArt: {
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.lg,
  },
  houseTile: {
    width: 76,
    height: 76,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  float: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  floatLeft: { marginTop: 36 },
  floatRight: { marginBottom: 36 },
  heroBody: { padding: space.lg, paddingTop: space.sm, gap: space.md },
  center: { textAlign: 'center' },
  benefits: { flexDirection: 'row', gap: space.sm },
  benefit: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    gap: 6,
  },
  benefitTitle: { fontSize: 13, fontWeight: '800', color: colors.text },
  benefitText: { fontSize: 11.5, color: colors.textMuted, lineHeight: 15 },
});
