import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import type { SuccessionStep } from '@propittu/shared';
import { useSuccession } from '@/api/family';
import { useServices } from '@/api/queries';
import { PropertyContext } from '@/components/PropertyContext';
import { ErrorState, LoadingState } from '@/components/States';
import { ListGroup, ListRow, ProgressBar } from '@/components/ui';
import { space, typography } from '@/theme';

/**
 * Ready for your family: what heirs would need to take this property over
 * smoothly — a nominee, family who can see it, a Will, the key documents —
 * what's in place, and how it works in this state (general guidance).
 */
export default function SuccessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending, error, refetch } = useSuccession(id);
  const services = useServices();
  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const act = (s: SuccessionStep) => {
    const a = s.action;
    if (!a) return;
    if (a.kind === 'family' || a.kind === 'nominee') router.push('/family');
    else if (a.kind === 'document')
      router.push(
        s.done
          ? `/properties/${id}/documents`
          : { pathname: '/properties/[id]/add-document', params: { id, type: a.type } },
      );
    else {
      const service = (services.data ?? []).find((x) => x.code === a.code);
      router.push({
        pathname: '/services/request',
        params: { propertyId: id, ...(service ? { serviceId: service.id } : {}) },
      });
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <PropertyContext propertyId={id} />
      <Text style={typography.title}>{`${data.done} of ${data.steps.length} in place`}</Text>
      <ProgressBar progress={data.done / data.steps.length} />
      <ListGroup title="What your family would need" plain>
        {data.steps.map((s) => (
          <ListRow
            key={s.key}
            icon={s.done ? 'success' : 'warning'}
            accent={s.done ? 'teal' : 'amber'}
            title={s.title}
            subtitle={s.why}
            subtitleLines={3}
            onPress={s.action ? () => act(s) : undefined}
          />
        ))}
      </ListGroup>
      <ListGroup title="How it works" plain>
        <Text style={[typography.small, styles.inner]}>{data.process}</Text>
      </ListGroup>
      <Text style={typography.caption}>
        General guidance, not legal advice. Our Will & Succession help includes a lawyer.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.xs, gap: space.lg, paddingBottom: space.xxl },
  inner: { paddingHorizontal: 14, paddingVertical: space.xs },
});
