import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  formatPrice,
  SERVICE_COVERAGE_LABELS,
  SERVICE_REQUEST_STATUS_LABELS,
  type ServiceRequest,
} from '@propittu/shared';
import { useCancelServiceRequest, useServiceRequest } from '@/api/queries';
import { ErrorState, LoadingState } from '@/components/States';
import { Badge, Button, Card, KeyValue } from '@/components/ui';
import { VisitReportView } from '@/components/VisitReportView';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { STATUS_TONES } from '@/lib/icons';
import { colors, radius, space, typography } from '@/theme';

/**
 * Service request detail (M4): status, Included/Extra and price, the
 * schedule, staff notes and — once written — the visit report.
 * Arriving straight from submission (`submitted=1`) it shows a confirmation.
 */
export default function ServiceRequestScreen() {
  const { id, submitted } = useLocalSearchParams<{ id: string; submitted?: string }>();
  const { data: request, isPending, error, refetch, isRefetching } = useServiceRequest(id);
  const cancel = useCancelServiceRequest(id);

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const confirmCancel = () =>
    Alert.alert('Cancel this request?', undefined, [
      { text: 'Keep request', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: () =>
          cancel.mutate(undefined, {
            onError: (err) => Alert.alert("Couldn't cancel", errorMessage(err)),
          }),
      },
    ]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          tintColor={colors.primary}
        />
      }
    >
      {submitted === '1' ? (
        <View style={styles.confirmation}>
          <View style={styles.iconCircle}>
            <Ionicons name="checkmark" size={36} color={colors.success} />
          </View>
          <Text style={typography.title}>Service request submitted.</Text>
          <Text style={[typography.small, styles.center]}>
            We&apos;ll confirm it with you and update its status here.
          </Text>
        </View>
      ) : null}

      <Card style={styles.card}>
        <View style={styles.row}>
          <KeyValue label="Request ID" value={request.reference} />
          <Badge
            label={SERVICE_REQUEST_STATUS_LABELS[request.status]}
            tone={STATUS_TONES[request.status]}
          />
        </View>
        <KeyValue label="Service" value={request.service.name} />
        <KeyValue label="Property" value={request.property?.name ?? 'Property removed'} />
        <KeyValue label="Cost" value={costLabel(request)} />
        <KeyValue label="What you need" value={request.description} />
        <KeyValue
          label="Preferred date"
          value={request.preferred_date ? formatDate(request.preferred_date) : null}
        />
        <KeyValue
          label="Scheduled for"
          value={request.scheduled_for ? formatDate(request.scheduled_for) : null}
        />
        <KeyValue label="Message from Propittu" value={request.status_note} />
      </Card>

      <Timeline request={request} />

      {request.report ? <VisitReportView report={request.report} /> : null}

      {request.status === 'requested' ? (
        <Button
          title="Cancel request"
          variant="danger"
          onPress={confirmCancel}
          loading={cancel.isPending}
        />
      ) : null}
      {submitted === '1' ? <Button title="Done" onPress={() => router.back()} /> : null}
    </ScrollView>
  );
}

function costLabel(r: ServiceRequest): string {
  if (r.coverage === 'included') return SERVICE_COVERAGE_LABELS.included;
  return r.price_paise !== null
    ? `${SERVICE_COVERAGE_LABELS.extra} · ${formatPrice(r.price_paise)}`
    : `${SERVICE_COVERAGE_LABELS.extra} · price confirmed after review`;
}

function Timeline({ request }: { request: ServiceRequest }) {
  const steps = [
    { label: 'Requested', at: request.created_at },
    { label: 'Confirmed', at: request.confirmed_at },
    { label: 'Completed', at: request.completed_at },
    { label: 'Cancelled', at: request.cancelled_at },
  ].filter((s): s is { label: string; at: string } => !!s.at);

  return (
    <Card style={styles.card}>
      {steps.map((s) => (
        <View key={s.label} style={styles.step}>
          <View style={styles.dot} />
          <Text style={[typography.body, styles.flex]}>{s.label}</Text>
          <Text style={typography.caption}>{formatDate(s.at)}</Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl },
  confirmation: { alignItems: 'center', gap: space.sm, paddingTop: space.lg },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  center: { textAlign: 'center' },
  card: { gap: space.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  flex: { flex: 1 },
});
