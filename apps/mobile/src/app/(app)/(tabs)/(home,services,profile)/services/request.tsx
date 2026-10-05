import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { createServiceRequestSchema, formatPrice, toFieldErrors } from '@propittu/shared';
import { useCreateServiceRequest, useProperties, useServices } from '@/api/queries';
import { DateField, toIsoDate } from '@/components/DateField';
import { TextField } from '@/components/Field';
import { Footer } from '@/components/Footer';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Banner, Button, Card, OptionList, SectionTitle } from '@/components/ui';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { propertySubtitle } from '@/lib/format';
import { PROPERTY_TYPE_ICONS } from '@/lib/icons';
import { colors, space, typography } from '@/theme';

/**
 * Request a Service (PRODUCT_SPEC.md §23). Either the service or the
 * property may arrive pre-selected from the screen that opened this one.
 * Optional photos were dropped from V1 (docs/DECISIONS.md).
 */
export default function RequestServiceScreen() {
  const params = useLocalSearchParams<{ serviceId?: string; propertyId?: string }>();
  const properties = useProperties();
  const services = useServices();
  const create = useCreateServiceRequest();

  const [propertyId, setPropertyId] = useState<string | null>(params.propertyId ?? null);
  const [serviceId, setServiceId] = useState<string | null>(params.serviceId ?? null);
  const [description, setDescription] = useState('');
  const [preferredDate, setPreferredDate] = useState<Date | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

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
        icon="home-outline"
        title="Add a property first"
        message="Service requests are made for a specific property."
        action={
          <Button
            title="Add Property"
            icon="add"
            onPress={() => router.replace('/properties/new')}
          />
        }
      />
    );
  }

  const selected = services.data.find((s) => s.id === serviceId) ?? null;

  const submit = () => {
    if (selected?.coverage === 'unavailable') {
      setFormError(`${selected.name} is not available on your plan.`);
      return;
    }
    const parsed = createServiceRequestSchema.safeParse({
      property_id: propertyId ?? '',
      service_id: serviceId ?? '',
      description,
      preferred_date: preferredDate ? toIsoDate(preferredDate) : null,
    });
    if (!parsed.success) {
      const e = toFieldErrors(parsed.error);
      setErrors({
        ...e,
        ...(propertyId ? {} : { property_id: 'Choose a property' }),
        ...(serviceId ? {} : { service_id: 'Choose a service' }),
      });
      return;
    }
    setErrors({});
    setFormError(null);
    create.mutate(parsed.data, {
      onSuccess: (request) =>
        router.replace({ pathname: '/requests/[id]', params: { id: request.id, submitted: '1' } }),
      onError: (err) => {
        setErrors(fieldErrors(err));
        setFormError(errorMessage(err, "Couldn't submit your request. Please try again."));
      },
    });
  };

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {formError ? <Banner message={formError} /> : null}

        <View style={styles.section}>
          <SectionTitle title="Property" />
          <OptionList
            options={properties.data.map((p) => ({
              value: p.id,
              label: p.name,
              description: propertySubtitle(p),
              icon: PROPERTY_TYPE_ICONS[p.property_type],
            }))}
            value={propertyId}
            onChange={(v) => {
              setPropertyId(v);
              setErrors(({ property_id: _, ...rest }) => rest);
            }}
          />
          {errors.property_id ? <Text style={styles.error}>{errors.property_id}</Text> : null}
        </View>

        <View style={styles.section}>
          <SectionTitle title="Service" />
          <OptionList
            options={services.data.map((s) => ({
              value: s.id,
              label: s.name,
              description:
                s.coverage === 'included'
                  ? 'Included in your plan'
                  : s.coverage === 'unavailable'
                    ? 'Not available on your plan'
                    : s.price_paise !== null
                      ? `Extra · ${formatPrice(s.price_paise)}`
                      : 'Extra · price confirmed after review',
            }))}
            value={serviceId}
            onChange={(v) => {
              setServiceId(v);
              setErrors(({ service_id: _, ...rest }) => rest);
            }}
          />
          {errors.service_id ? <Text style={styles.error}>{errors.service_id}</Text> : null}
          {selected ? <CoverageSummary service={selected} /> : null}
        </View>

        <DateField
          label="Preferred date (optional)"
          value={preferredDate}
          onChange={setPreferredDate}
          minimumDate={new Date()}
          clearable
          hint="We'll confirm the exact date and time with you."
        />
        {errors.preferred_date ? <Text style={styles.error}>{errors.preferred_date}</Text> : null}

        <View style={styles.section}>
          <TextField
            label="What do you need?"
            multiline
            maxLength={2000}
            placeholder="Describe what you need help with"
            value={description}
            onChangeText={(t) => {
              setDescription(t);
              if (errors.description) setErrors(({ description: _, ...rest }) => rest);
            }}
            error={errors.description}
          />
        </View>
      </ScrollView>

      <Footer>
        <Button title="Submit Request" onPress={submit} loading={create.isPending} />
      </Footer>
    </View>
  );
}

/** "Show whether Included or Extra; show price if Extra" (M4). */
function CoverageSummary({
  service,
}: {
  service: {
    coverage: 'included' | 'extra' | 'unavailable';
    included_remaining: number | null;
    price_paise: number | null;
  };
}) {
  const text =
    service.coverage === 'included'
      ? `Included in your plan — ${service.included_remaining} left. It is counted once we confirm the request.`
      : service.coverage === 'unavailable'
        ? 'This service is not available on your plan.'
        : service.price_paise !== null
          ? `Extra service — ${formatPrice(service.price_paise)}. We confirm with you before any work starts.`
          : 'Extra service — we will confirm the price with you before any work starts.';
  return (
    <Card style={styles.coverage}>
      <Text style={typography.small}>{text}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  coverage: {
    padding: space.md,
    backgroundColor: colors.primarySoft,
    borderColor: colors.primarySoft,
  },
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl },
  section: { gap: space.md },
  error: { fontSize: 13, color: colors.danger },
});
