import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { staffCan, type StaffService } from '@propittu/shared';
import { useBoServices, useBoUpdateService } from '@/api/backoffice';
import { useMe } from '@/api/queries';
import { TextField } from '@/components/Field';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Banner, Button, Card } from '@/components/ui';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { colors, space, typography } from '@/theme';

/** Backoffice: edit a catalogue service — name, copy, price, availability (M4/M9). */
export default function BackofficeServiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending, error, refetch } = useBoServices();

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  const service = data.find((s) => s.id === id);
  if (!service) return <EmptyState icon="construct-outline" title="Service not found" />;
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
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl },
  card: { gap: space.lg },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
});
