import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import type { SaleReadyStep } from '@propittu/shared';
import { useSaleReady } from '@/api/family';
import { useServices } from '@/api/queries';
import { PropertyContext } from '@/components/PropertyContext';
import { ErrorState, LoadingState } from '@/components/States';
import { LinkButton, ListGroup, ListRow, ProgressBar } from '@/components/ui';
import { space, typography } from '@/theme';

/**
 * Get sale-ready: what a buyer's lawyer and bank will ask for — the deed,
 * a 30-year EC, the Khata in your name, this year's tax, the OC or
 * conversion order, the loan closure, names that match, no open dispute —
 * and a way to fix each gap. Weeks of chasing papers, as one list.
 */
export default function SaleReadyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending, error, refetch } = useSaleReady(id);
  const services = useServices();
  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const fix = (s: SaleReadyStep) => {
    if (s.service) {
      const service = (services.data ?? []).find((x) => x.code === s.service);
      router.push({
        pathname: '/services/request',
        params: { propertyId: id, ...(service ? { serviceId: service.id } : {}) },
      });
    } else if (s.document) {
      router.push({ pathname: '/properties/[id]/add-document', params: { id, type: s.document } });
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <PropertyContext propertyId={id} />
      <Text style={typography.title}>{`${data.done} of ${data.steps.length} ready`}</Text>
      <ProgressBar progress={data.done / data.steps.length} />
      <Text style={typography.small}>
        What a buyer’s lawyer and bank will ask for. Getting these in order early saves weeks when
        you sell — and helps for a loan too.
      </Text>
      <ListGroup title="What buyers will ask for" plain>
        {data.steps.map((s) => (
          <ListRow
            key={s.key}
            icon={s.done ? 'success' : 'warning'}
            accent={s.done ? 'teal' : 'amber'}
            title={s.title}
            subtitle={s.why}
            subtitleLines={3}
            onPress={!s.done && (s.service || s.document) ? () => fix(s) : undefined}
          />
        ))}
      </ListGroup>
      {data.note ? <Text style={typography.small}>{data.note}</Text> : null}
      <LinkButton
        title="Lost an original document?"
        onPress={() => router.push(`/properties/${id}/lost-document`)}
      />
      <Text style={typography.caption}>
        A checklist to help you prepare, not a title opinion. For a formal title opinion, ask us
        about our legal partner.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.xs, gap: space.lg, paddingBottom: space.xxl },
});
