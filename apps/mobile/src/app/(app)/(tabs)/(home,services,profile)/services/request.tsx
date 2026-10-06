import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  formatPrice,
  PREFERRED_SLOT_HOURS,
  PREFERRED_SLOT_LABELS,
  PREFERRED_SLOTS,
  type CatalogueService,
  type PreferredSlot,
  type PropertySummary,
} from '@propittu/shared';
import { useCreateServiceRequest, useProperties, useServices } from '@/api/queries';
import { toIsoDate } from '@/components/DateField';
import { TextField } from '@/components/Field';
import { Footer } from '@/components/Footer';
import { Icon, type IconName } from '@/components/Icon';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Banner, Button, Card, IconTile, LinkButton, SectionTitle } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import {
  isOnSiteService,
  PROPERTY_TYPE_GRADIENTS,
  PROPERTY_TYPE_ICONS,
  serviceVisual,
} from '@/lib/icons';
import { signedImage } from '@/lib/image';
import { accents, colors, radius, shadow, space, typography } from '@/theme';

const SLOT_ICONS: Record<PreferredSlot, IconName> = {
  morning: 'morning',
  afternoon: 'afternoon',
  evening: 'evening',
};

/** The next 14 days, starting tomorrow (a visit needs a little notice). */
function upcomingDays(): Date[] {
  const start = new Date();
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i + 1);
    return d;
  });
}

/**
 * Request a Service (PRODUCT_SPEC.md §23), top to bottom in the order
 * people think: what → for which property → when → anything else → cost.
 */
export default function RequestServiceScreen() {
  const params = useLocalSearchParams<{ serviceId?: string; propertyId?: string }>();
  const properties = useProperties();
  const services = useServices();
  const create = useCreateServiceRequest();

  const [serviceId, setServiceId] = useState<string | null>(params.serviceId ?? null);
  const [propertyId, setPropertyId] = useState<string | null>(params.propertyId ?? null);
  const [day, setDay] = useState<Date | null>(null);
  const [slot, setSlot] = useState<PreferredSlot | null>(null);
  const [notes, setNotes] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [days] = useState(upcomingDays);

  if (properties.isPending || services.isPending) return <LoadingState />;
  if (properties.error || services.error) {
    return (
      <ErrorState
        error={properties.error ?? services.error}
        onRetry={() => {
          void properties.refetch();
          void services.refetch();
        }}
      />
    );
  }

  if (properties.data.length === 0) {
    return (
      <EmptyState
        icon="home"
        title="Add a property first"
        message="Services are booked for a specific property."
        action={
          <Button
            title="Add property"
            icon="add"
            onPress={() => router.replace('/properties/new')}
          />
        }
      />
    );
  }

  const service = services.data.find((s) => s.id === serviceId) ?? null;
  const chosenProperty =
    properties.data.find((p) => p.id === propertyId) ??
    (properties.data.length === 1 ? properties.data[0] : null) ??
    null;

  if (!service) {
    return <ServicePicker services={services.data} onPick={(s) => setServiceId(s.id)} />;
  }

  const onSite = isOnSiteService(service.category);
  const v = serviceVisual(service.code, service.category);

  const submit = () => {
    setProblem(null);
    if (service.coverage === 'unavailable') {
      setProblem(`${service.name} is not available on your plan.`);
      return;
    }
    if (!chosenProperty) {
      setProblem('Choose the property this is for.');
      return;
    }
    create.mutate(
      {
        property_id: chosenProperty.id,
        service_id: service.id,
        description: notes,
        preferred_date: onSite && day ? toIsoDate(day) : null,
        preferred_slot: onSite ? slot : null,
      },
      {
        onSuccess: (request) =>
          router.replace({
            pathname: '/requests/[id]',
            params: { id: request.id, submitted: '1' },
          }),
        onError: (err) =>
          setProblem(errorMessage(err, "Couldn't send your request. Please try again.")),
      },
    );
  };

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        {/* 1. What */}
        <Card style={styles.serviceCard}>
          <IconTile icon={v.icon} accent={v.accent} size={52} />
          <View style={styles.flex}>
            <Text style={typography.title} numberOfLines={1}>
              {service.name}
            </Text>
            <Text style={typography.small} numberOfLines={3}>
              {service.description}
            </Text>
          </View>
        </Card>
        {!params.serviceId ? (
          <View style={styles.changeRow}>
            <LinkButton
              title="Choose a different service"
              icon="refresh"
              onPress={() => setServiceId(null)}
            />
          </View>
        ) : null}

        {/* 2. Which property */}
        <View>
          <SectionTitle title="For which property?" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.props}
          >
            {properties.data.map((p) => (
              <PropertyChoice
                key={p.id}
                property={p}
                selected={chosenProperty?.id === p.id}
                onPress={() => setPropertyId(p.id)}
              />
            ))}
          </ScrollView>
        </View>

        {/* 3. When (on-site services only) */}
        {onSite ? (
          <View style={styles.block}>
            <SectionTitle
              title="When suits you?"
              subtitle="We'll confirm the exact time with you."
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.days}
            >
              <DayPill
                label="Any"
                sub="Flexible"
                selected={day === null}
                onPress={() => setDay(null)}
              />
              {days.map((d) => (
                <DayPill
                  key={d.toISOString()}
                  label={d.toLocaleDateString('en-IN', { weekday: 'short' })}
                  sub={d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  selected={day?.getTime() === d.getTime()}
                  onPress={() => setDay(d)}
                />
              ))}
            </ScrollView>
            <View style={styles.slots}>
              {PREFERRED_SLOTS.map((s) => {
                const selected = slot === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setSlot(selected ? null : s)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={[styles.slot, selected && styles.slotSelected]}
                  >
                    <Icon
                      name={SLOT_ICONS[s]}
                      size={20}
                      color={selected ? accents.amber.fg : colors.textMuted}
                    />
                    <Text style={[styles.slotLabel, selected && { color: accents.amber.fg }]}>
                      {PREFERRED_SLOT_LABELS[s]}
                    </Text>
                    <Text style={styles.slotHours}>{PREFERRED_SLOT_HOURS[s]}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* 4. Anything else */}
        <TextField
          label={onSite ? 'Anything we should know?' : 'What do you need help with?'}
          optional={onSite}
          multiline
          maxLength={2000}
          placeholder={
            onSite
              ? 'e.g. Check the compound wall; gate key is with the neighbour'
              : 'e.g. Property tax for 2025–26 is pending'
          }
          value={notes}
          onChangeText={setNotes}
        />

        {/* 5. Cost */}
        <CostSummary service={service} />
        {problem ? <Banner message={problem} /> : null}
      </ScrollView>

      <Footer>
        <Button
          title={onSite ? 'Request this visit' : 'Send request'}
          icon="arrow"
          onPress={submit}
          loading={create.isPending}
          disabled={!chosenProperty || service.coverage === 'unavailable'}
        />
      </Footer>
    </View>
  );
}

function ServicePicker({
  services,
  onPick,
}: {
  services: CatalogueService[];
  onPick: (s: CatalogueService) => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={typography.title}>What do you need?</Text>
      <View style={styles.pickGrid}>
        {services.map((s) => {
          const v = serviceVisual(s.code, s.category);
          return (
            <Pressable
              key={s.id}
              onPress={() => onPick(s)}
              style={({ pressed }) => [styles.pickTile, shadow, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
            >
              <IconTile icon={v.icon} accent={v.accent} size={38} />
              <Text style={styles.pickName} numberOfLines={2}>
                {s.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

function PropertyChoice({
  property,
  selected,
  onPress,
}: {
  property: PropertySummary;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.prop, shadow, selected && styles.propSelected]}
    >
      <View style={styles.propMedia}>
        {property.cover_photo_url ? (
          <Image
            source={signedImage(property.cover_photo_url)}
            style={styles.fill}
            contentFit="cover"
          />
        ) : (
          <LinearGradient
            colors={PROPERTY_TYPE_GRADIENTS[property.property_type]}
            style={[styles.fill, styles.propIcon]}
          >
            <Icon
              name={PROPERTY_TYPE_ICONS[property.property_type]}
              size={26}
              color="rgba(255,255,255,0.85)"
            />
          </LinearGradient>
        )}
        {selected ? (
          <View style={styles.propCheck}>
            <Icon name="check" size={13} color="#FFFFFF" strokeWidth={3.5} />
          </View>
        ) : null}
      </View>
      <Text style={styles.propName} numberOfLines={1}>
        {property.name}
      </Text>
      {property.city ? (
        <Text style={typography.caption} numberOfLines={1}>
          {property.city}
        </Text>
      ) : null}
    </Pressable>
  );
}

function DayPill({
  label,
  sub,
  selected,
  onPress,
}: {
  label: string;
  sub: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.day, selected && styles.daySelected]}
    >
      <Text style={[styles.dayLabel, selected && styles.dayTextSelected]}>{label}</Text>
      <Text style={[styles.daySub, selected && styles.dayTextSelected]}>{sub}</Text>
    </Pressable>
  );
}

/** "Show whether Included or Extra; show price if Extra" (M4) — and how payment works. */
function CostSummary({ service }: { service: CatalogueService }) {
  let icon: IconName = 'rupee';
  let title: string;
  let text: string;
  let tone: 'teal' | 'sky' | 'slate' = 'sky';
  if (service.coverage === 'included') {
    icon = 'success';
    tone = 'teal';
    title = 'Included in your plan';
    text = `${service.included_remaining} left. It's counted only once we confirm your request.`;
  } else if (service.coverage === 'unavailable') {
    icon = 'blocked';
    tone = 'slate';
    title = 'Not available on your plan';
    text = 'Upgrade your plan to request this service.';
  } else if (service.price_paise !== null) {
    title = `${formatPrice(service.price_paise)} · pay after we confirm`;
    text = "No payment now. Once we confirm, you'll pay securely by UPI or card from the request.";
  } else {
    title = 'Price on quote';
    text = "We'll review your request and share the price before any work starts.";
  }
  const a = accents[tone];
  return (
    <View style={[styles.cost, { backgroundColor: a.bg }]}>
      <Icon name={icon} size={20} color={a.fg} />
      <View style={styles.flex}>
        <Text style={[styles.costTitle, { color: a.fg }]}>{title}</Text>
        <Text style={typography.small}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  fill: { width: '100%', height: '100%' },
  content: { padding: space.lg, paddingTop: space.xs, gap: space.xl, paddingBottom: space.xxl },
  block: { gap: space.md },
  serviceCard: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  changeRow: { marginTop: -space.md, alignItems: 'flex-start' },
  props: { gap: space.md, paddingVertical: space.xs, paddingRight: space.lg },
  prop: {
    width: 148,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.sm,
    gap: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  propSelected: { borderColor: colors.primary },
  propMedia: { height: 84, borderRadius: radius.md, overflow: 'hidden', marginBottom: 4 },
  propIcon: { alignItems: 'center', justifyContent: 'center' },
  propCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  propName: { fontSize: 14, fontWeight: '700', color: colors.text, paddingHorizontal: 2 },
  days: { gap: space.sm },
  day: {
    width: 64,
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    gap: 2,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  daySelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayLabel: { fontSize: 13, fontWeight: '800', color: colors.text },
  daySub: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  dayTextSelected: { color: '#FFFFFF' },
  slots: { flexDirection: 'row', gap: space.sm },
  slot: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  slotSelected: { borderColor: accents.amber.fg, backgroundColor: accents.amber.bg },
  slotLabel: { fontSize: 13, fontWeight: '800', color: colors.text },
  slotHours: { fontSize: 11, color: colors.textSubtle },
  cost: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    alignItems: 'flex-start',
  },
  costTitle: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  pickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  pickTile: {
    width: '47.5%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  pickName: { fontSize: 14, fontWeight: '700', color: colors.text },
});
