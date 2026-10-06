import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import {
  SERVICE_FULFILMENT_LABELS,
  SERVICE_FULFILMENTS,
  SERVICE_REACH_LABELS,
  SERVICE_REACHES,
  staffCan,
  type ServiceFulfilment,
  type ServiceReach,
  type StaffService,
} from '@propittu/shared';
import { useBoServices, useBoUpdateService } from '@/api/backoffice';
import { useMe } from '@/api/queries';
import { TextField } from '@/components/Field';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Banner, Button, Card, Segmented } from '@/components/ui';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { colors, space, typography } from '@/theme';

/** Backoffice: edit a catalogue service — name, copy, price, availability (M4/M9). */
export default function BackofficeServiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending, error, refetch } = useBoServices();

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  const service = data.find((s) => s.id === id);
  if (!service) return <EmptyState icon="services" title="Service not found" />;
  return <ServiceForm service={service} />;
}

function ServiceForm({ service }: { service: StaffService }) {
  const update = useBoUpdateService(service.id);
  const me = useMe();
  const canEdit = staffCan(me.data?.staff_role, 'services.manage');

  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description);
  const [price, setPrice] = useState(
    service.price_paise !== null ? String(service.price_paise / 100) : '',
  );
  const [isActive, setIsActive] = useState(service.is_active);
  const [isExtra, setIsExtra] = useState(service.is_extra_available);
  const [fulfilment, setFulfilment] = useState<ServiceFulfilment>(service.fulfilment);
  const [reach, setReach] = useState<ServiceReach>(service.reach);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);

  const save = () => {
    const rupees = price.trim() === '' ? null : Number(price.replace(/[,₹\s]/g, ''));
    if (rupees !== null && (!Number.isFinite(rupees) || rupees < 0)) {
      setErrors({ price_paise: 'Enter a price in rupees, or leave empty for "price on review"' });
      return;
    }
    setErrors({});
    setProblem(null);
    update.mutate(
      {
        name,
        description,
        price_paise: rupees === null ? null : Math.round(rupees * 100),
        is_active: isActive,
        is_extra_available: isExtra,
        fulfilment,
        reach,
      },
      {
        onSuccess: () => router.back(),
        onError: (err) => {
          setErrors(fieldErrors(err));
          setProblem(errorMessage(err));
        },
      },
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      {problem ? <Banner message={problem} /> : null}
      {!canEdit ? (
        <Banner tone="info" message="Your staff role can view but not edit services." />
      ) : null}
      <Card style={styles.card}>
        <Text style={typography.caption}>Code: {service.code}</Text>
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          error={errors.name}
          editable={canEdit}
        />
        <TextField
          label="Description"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={500}
          error={errors.description}
          editable={canEdit}
        />
        <TextField
          label="Extra price (₹)"
          optional
          keyboardType="decimal-pad"
          value={price}
          onChangeText={setPrice}
          hint="Leave empty to confirm the price after review. Existing requests keep their price."
          error={errors.price_paise}
          editable={canEdit}
        />
        <View style={styles.type}>
          <Text style={typography.overline}>How it is delivered</Text>
          <Segmented
            options={SERVICE_FULFILMENTS.map((f) => ({
              value: f,
              label: SERVICE_FULFILMENT_LABELS[f],
            }))}
            value={fulfilment}
            onChange={(v) => canEdit && setFulfilment(v)}
          />
          <Text style={typography.caption}>
            {fulfilment === 'visit'
              ? 'Customer picks a date; staff schedule a visit and finish with a visit report and photos.'
              : 'No date or visit; staff can ask the customer for information and finish with an outcome and files saved to Documents.'}{' '}
            New requests use this; existing ones keep theirs.
          </Text>
        </View>
        <View style={styles.type}>
          <Text style={typography.overline}>Where we offer it</Text>
          <Segmented
            options={SERVICE_REACHES.map((r) => ({
              value: r,
              label: r === 'area' ? 'Areas' : r === 'state' ? 'States' : 'Everywhere',
            }))}
            value={reach}
            onChange={(v) => canEdit && setReach(v)}
          />
          <Text style={typography.caption}>
            {SERVICE_REACH_LABELS[reach]}:{' '}
            {reach === 'area'
              ? 'only properties whose PIN code is in an active service area.'
              : reach === 'state'
                ? 'only properties in an active service state.'
                : 'any property, wherever it is.'}{' '}
            Manage areas and states from the Services tab.
          </Text>
        </View>
        <Toggle
          label="Active (shown to customers)"
          value={isActive}
          onChange={setIsActive}
          disabled={!canEdit}
        />
        <Toggle
          label="Available as an Extra Service"
          value={isExtra}
          onChange={setIsExtra}
          disabled={!canEdit}
        />
      </Card>
      {canEdit ? <Button title="Save" onPress={save} loading={update.isPending} /> : null}
    </ScrollView>
  );
}

function Toggle({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.toggle}>
      <Text style={[typography.body, styles.flex]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: colors.border }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  type: { gap: space.sm },
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl },
  card: { gap: space.lg },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
});
