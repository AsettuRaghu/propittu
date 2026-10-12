import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { everyLabel } from '@propittu/shared';
import { useCareMutations, useCareSchedules, useServices } from '@/api/queries';
import { DateField } from '@/components/DateField';
import { dialog } from '@/components/Dialog';
import { PropertyContext } from '@/components/PropertyContext';
import { Select } from '@/components/Select';
import { Banner, Button, ListGroup, ListRow, Segmented } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { colors, space, typography } from '@/theme';

/** Services that make sense on a schedule. */
const REPEATABLE = new Set([
  'property_visit',
  'site_inspection',
  'property_cleaning',
  'maintenance',
  'security_site_check',
  'video_documentation',
  'property_photography',
]);
const EVERY = [
  { value: '1', label: '1 mo' },
  { value: '3', label: '3 mo' },
  { value: '6', label: '6 mo' },
  { value: '12', label: '1 yr' },
] as const;

/**
 * Care schedule: a visit every 3 months, cleaning before the monsoon… About
 * a week before each date it books itself when your plan includes it;
 * otherwise you get a reminder to book — nothing is charged without you.
 */
export default function CareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const schedules = useCareSchedules(id);
  const services = useServices();
  const care = useCareMutations(id);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [every, setEvery] = useState<'1' | '3' | '6' | '12'>('3');
  const [start, setStart] = useState<Date | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [today] = useState(() => new Date());

  const options = (services.data ?? [])
    .filter((s) => REPEATABLE.has(s.code))
    .map((s) => ({ value: s.id, label: s.name }));

  const add = () => {
    setProblem(null);
    if (!serviceId || !start) return;
    care.add.mutate(
      {
        service_id: serviceId,
        every_months: Number(every),
        next_on: start.toISOString().slice(0, 10),
      },
      {
        onSuccess: () => {
          setServiceId(null);
          setStart(null);
        },
        onError: (err) => setProblem(errorMessage(err)),
      },
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <PropertyContext propertyId={id} />
      <Text style={typography.small}>
        About a week before each date we book it for you when your plan includes it. If it would be
        an extra, you get a reminder to book — nothing is charged without you.
      </Text>

      {(schedules.data ?? []).length ? (
        <ListGroup title="On the schedule" plain>
          {schedules.data!.map((s) => (
            <ListRow
              key={s.id}
              icon="calendar"
              accent={s.active ? 'teal' : 'slate'}
              title={`${s.service_name} · ${everyLabel(s.every_months).toLowerCase()}`}
              subtitle={s.active ? `Next: ${formatDate(s.next_on)}` : 'Paused'}
              right={
                <Switch
                  value={s.active}
                  onValueChange={(v) => care.update.mutate({ id: s.id, active: v })}
                  trackColor={{ true: colors.primary }}
                />
              }
              onPress={() =>
                void dialog
                  .confirm({
                    title: `Remove ${s.service_name} from the schedule?`,
                    message: 'Anything already booked stays booked.',
                    confirmLabel: 'Remove',
                    tone: 'danger',
                  })
                  .then((ok) => (ok ? care.remove.mutate(s.id) : undefined))
              }
            />
          ))}
        </ListGroup>
      ) : null}

      <ListGroup title="Add to the schedule" plain>
        <View style={[styles.inner, styles.form]}>
          <Select
            variant="flat"
            label="Service"
            placeholder="Choose a service"
            value={serviceId}
            options={options}
            onChange={setServiceId}
          />
          <Text style={typography.caption}>How often</Text>
          <Segmented options={EVERY} value={every} onChange={setEvery} />
          <DateField label="First date" value={start} onChange={setStart} minimumDate={today} />
          {problem ? <Banner message={problem} /> : null}
          <Button
            title="Add to the schedule"
            icon="calendar"
            onPress={add}
            loading={care.add.isPending}
            disabled={!serviceId || !start}
          />
        </View>
      </ListGroup>
      <Button
        title="Book something now instead"
        variant="ghost"
        onPress={() => router.push({ pathname: '/services/request', params: { propertyId: id } })}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.xs, gap: space.xl, paddingBottom: space.xxl },
  inner: { paddingHorizontal: 14, paddingVertical: space.xs },
  form: { gap: space.md },
});
