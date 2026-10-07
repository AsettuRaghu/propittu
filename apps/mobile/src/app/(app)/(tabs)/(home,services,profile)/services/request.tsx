import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  PREFERRED_SLOT_HOURS,
  PREFERRED_SLOT_LABELS,
  PREFERRED_SLOTS,
  REACH_PROBLEM_LABELS,
  REACH_PROBLEM_TEXT,
  reachProblem,
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
  CANCEL_POLICY_LABELS,
  requestPayment,
  SERVICE_FULFILMENT_LABELS,
  type CatalogueService,
  type PaymentTiming,
  type PreferredSlot,
} from '@propittu/shared';
import { payForServiceRequest } from '@/api/billing';
import { useCreateServiceRequest, useProperties, useServices } from '@/api/queries';
import { toIsoDate } from '@/components/DateField';
import { dialog } from '@/components/Dialog';
import { TextField } from '@/components/Field';
import { Footer } from '@/components/Footer';
import { PageHeader } from '@/components/PageHeader';
import { Select } from '@/components/Select';
import { servicePrice, ServiceRow } from '@/components/ServiceRow';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Banner, Button, IconButton, ListGroup, ListRow } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { isOnSiteService, serviceVisual } from '@/lib/icons';
import { space } from '@/theme';

const ANY = 'any';

/** "Any day" plus the next 14 days, starting tomorrow (a visit needs a little notice). */
function dayOptions() {
  const start = new Date();
  return [
    { value: ANY, label: 'Any day' },
    ...Array.from({ length: 14 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i + 1);
      return {
        value: toIsoDate(d),
        label: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
      };
    }),
  ];
}

const SLOT_OPTIONS = [
  { value: ANY, label: 'Any time' },
  ...PREFERRED_SLOTS.map((s) => ({
    value: s,
    label: PREFERRED_SLOT_LABELS[s],
    description: PREFERRED_SLOT_HOURS[s],
  })),
];

/** What this service costs on the customer's plan, and how payment works. */
function costOf(s: CatalogueService): { title: string; text: string } {
  if (s.coverage === 'included') {
    return {
      title: `Included in your plan · ${s.included_remaining} left`,
      text: 'Counted only once we confirm your request.',
    };
  }
  if (s.coverage === 'unavailable') {
    return { title: 'Not on your plan', text: 'Upgrade your plan to request this service.' };
  }
  if (s.price_paise === null) {
    return {
      title: 'Price on quote',
      text: 'We share the price here before any work starts; you pay it in the app.',
    };
  }
  const when: Record<PaymentTiming, string> = {
    upfront: 'Paid when you book — by UPI or card, in the app.',
    on_confirmation: 'Pay once we confirm — by UPI or card, in the app.',
    on_completion: 'Pay after the work is done — by UPI or card, in the app.',
  };
  return { title: servicePrice(s), text: when[s.payment_timing] };
}

/** "About this service": what it includes, what it costs, how long it takes. */
function showAbout(s: CatalogueService) {
  const v = serviceVisual(s.code, s.category);
  void dialog.alert({
    title: s.name,
    message: s.description,
    icon: v.icon,
    accent: v.accent,
    highlights: s.includes.length ? s.includes : undefined,
    summary: [
      { label: 'Cost', value: costOf(s).title },
      ...(s.turnaround ? [{ label: 'Usually takes', value: s.turnaround }] : []),
      { label: 'How', value: SERVICE_FULFILMENT_LABELS[s.fulfilment] },
      { label: 'Cancelling', value: CANCEL_POLICY_LABELS[s.cancel_policy] },
    ],
    buttonLabel: 'Got it',
  });
}

/**
 * Request a service, flat like Profile: which property first, when (visits
 * only), optional notes, then cost and timing. The ⓘ next to the title
 * explains the service before anyone commits.
 */
export default function RequestServiceScreen() {
  const params = useLocalSearchParams<{ serviceId?: string; propertyId?: string }>();
  const properties = useProperties();
  const services = useServices();
  const create = useCreateServiceRequest();

  const [serviceId, setServiceId] = useState<string | null>(params.serviceId ?? null);
  const [propertyId, setPropertyId] = useState<string | null>(params.propertyId ?? null);
  const [day, setDay] = useState<string>(ANY);
  const [slot, setSlot] = useState<string>(ANY);
  const [notes, setNotes] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [days] = useState(dayOptions);

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
  if (!service)
    return <ServicePicker services={services.data} onPick={(s) => setServiceId(s.id)} />;

  const property =
    properties.data.find((p) => p.id === propertyId) ??
    (properties.data.length === 1 ? properties.data[0] : null) ??
    null;
  const onSite = isOnSiteService(service);
  // Location rule (PIN code / state): the server enforces it too.
  const blocked = property ? reachProblem(service, property.reach) : null;
  const cost = costOf(service);

  const submit = () => {
    setProblem(null);
    if (!property) return setProblem('Choose the property this is for.');
    if (blocked) return setProblem(REACH_PROBLEM_TEXT[blocked]);
    create.mutate(
      {
        property_id: property.id,
        service_id: service.id,
        description: notes,
        preferred_date: onSite && day !== ANY ? day : null,
        preferred_slot: onSite && slot !== ANY ? (slot as PreferredSlot) : null,
      },
      {
        onSuccess: async (request) => {
          // Pay-when-booking services go straight to payment.
          let paid: boolean | null = null;
          if (requestPayment(request).state === 'due') {
            try {
              paid = (await payForServiceRequest(request.id)).checkout_state === 'paid';
            } catch {
              paid = false;
            }
          }
          await dialog.alert({
            title: paid === false ? 'Request registered — payment pending' : 'Request registered',
            message:
              paid === false
                ? 'Complete the payment from My requests on the Services tab so we can start.'
                : 'We’ll confirm it with you. Follow it any time in My requests on the Services tab.',
            icon: paid === false ? 'wallet' : 'success',
            tone: paid === false ? 'warning' : 'success',
          });
          if (router.canGoBack()) router.back();
          else router.replace('/services');
        },
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
        <PageHeader
          title={service.name}
          subtitle={SERVICE_FULFILMENT_LABELS[service.fulfilment]}
          action={
            <IconButton icon="info" label="About this service" onPress={() => showAbout(service)} />
          }
        />

        <ListGroup title="Which property?" plain>
          <View style={styles.inner}>
            <Select
              variant="flat"
              label="Property"
              placeholder="Choose a property"
              value={property?.id ?? null}
              options={properties.data.map((p) => {
                const r = reachProblem(service, p.reach);
                return {
                  value: p.id,
                  label: p.name,
                  description: r ? REACH_PROBLEM_LABELS[r] : (p.city ?? undefined),
                };
              })}
              onChange={setPropertyId}
            />
          </View>
        </ListGroup>
        {blocked && property ? (
          <View style={styles.gap}>
            <Banner tone="info" message={REACH_PROBLEM_TEXT[blocked]} />
            {blocked === 'no_pincode' ? (
              <Button
                title="Add PIN code"
                variant="secondary"
                onPress={() => router.push(`/properties/${property.id}/edit`)}
              />
            ) : null}
          </View>
        ) : null}

        {onSite && !blocked ? (
          <ListGroup title="When suits you?" plain>
            <View style={[styles.inner, styles.gap]}>
              <Select
                variant="flat"
                label="Preferred day"
                value={day}
                options={days}
                onChange={(v) => setDay(v ?? ANY)}
              />
              <Select
                variant="flat"
                label="Time of day"
                value={slot}
                options={SLOT_OPTIONS}
                onChange={(v) => setSlot(v ?? ANY)}
              />
            </View>
          </ListGroup>
        ) : null}

        <ListGroup title="Anything we should know? (optional)" plain>
          <View style={styles.inner}>
            <TextField
              variant="flat"
              hideLabel
              label="Notes for our team"
              multiline
              maxLength={2000}
              placeholder={
                onSite
                  ? 'e.g. The gate key is with the neighbour'
                  : 'e.g. Property tax for 2025–26 is pending'
              }
              value={notes}
              onChangeText={setNotes}
            />
          </View>
        </ListGroup>

        <ListGroup title="Cost and timing" plain>
          <ListRow icon="rupee" accent="teal" title={cost.title} subtitle={cost.text} />
          {service.turnaround ? (
            <ListRow icon="clock" accent="sky" title={service.turnaround} subtitle="Usually" />
          ) : null}
        </ListGroup>

        {problem ? <Banner message={problem} /> : null}
      </ScrollView>

      <Footer>
        <Button
          title={
            service.coverage === 'extra' &&
            service.payment_timing === 'upfront' &&
            service.price_paise !== null
              ? `Request and pay ${servicePrice(service)}`
              : 'Request this service'
          }
          icon="arrow"
          onPress={submit}
          loading={create.isPending}
          disabled={!property || service.coverage === 'unavailable' || !!blocked}
        />
      </Footer>
    </View>
  );
}

/** No service chosen yet (e.g. "Book service" on a property): the catalogue as rows. */
function ServicePicker({
  services,
  onPick,
}: {
  services: CatalogueService[];
  onPick: (s: CatalogueService) => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <PageHeader title="What do you need?" />
      {SERVICE_CATEGORIES.map((category) => {
        const items = services.filter((s) => s.category === category);
        if (items.length === 0) return null;
        return (
          <ListGroup key={category} title={SERVICE_CATEGORY_LABELS[category]} plain>
            {items.map((s) => (
              <ServiceRow key={s.id} service={s} onPress={() => onPick(s)} />
            ))}
          </ListGroup>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, paddingTop: space.md, gap: space.xl, paddingBottom: space.xxl },
  // Same 14 pt inset as list rows, so content lines up under each heading.
  inner: { paddingHorizontal: 14, paddingVertical: space.xs },
  gap: { gap: space.lg },
});
