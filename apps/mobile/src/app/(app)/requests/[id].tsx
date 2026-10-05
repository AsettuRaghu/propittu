import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SERVICE_REQUEST_STATUS_LABELS } from '@propittu/shared';
import { useServiceRequest } from '@/api/queries';
import { ErrorState, LoadingState } from '@/components/States';
import { Badge, Button, Card, KeyValue } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { STATUS_TONES } from '@/lib/icons';
import { colors, radius, space, typography } from '@/theme';

/**
 * Service request detail. Arriving straight from submission (`submitted=1`)
 * it shows the §23 confirmation: "Service request submitted. Request ID: …"
 */
export default function ServiceRequestScreen() {
  const { id, submitted } = useLocalSearchParams<{ id: string; submitted?: string }>();
  const { data: request, isPending, error, refetch, isRefetching } = useServiceRequest(id);

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

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
            We&apos;ll review your request and update its status here.
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
        <KeyValue label="What you need" value={request.description} />
        <KeyValue label="Submitted" value={formatDate(request.created_at)} />
      </Card>

      {submitted === '1' ? <Button title="Done" onPress={() => router.back()} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xl },
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
});
