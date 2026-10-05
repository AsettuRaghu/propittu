import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { SERVICE_REQUEST_STATUS_LABELS, type ServiceRequest } from '@propittu/shared';
import { formatDate } from '@/lib/format';
import { STATUS_TONES } from '@/lib/icons';
import { colors, space, typography } from '@/theme';
import { Badge, Card } from './ui';

export function ServiceRequestCard({
  request,
  onPress,
}: {
  request: ServiceRequest;
  onPress: () => void;
}) {
  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.top}>
        <Text style={typography.caption}>{request.reference}</Text>
        <Badge
          label={SERVICE_REQUEST_STATUS_LABELS[request.status]}
          tone={STATUS_TONES[request.status]}
        />
      </View>
      <Text style={typography.bodyStrong}>{request.service.name}</Text>
      <View style={styles.bottom}>
        <Text style={[typography.small, styles.flex]} numberOfLines={1}>
          {request.property?.name ?? 'Property removed'}
        </Text>
        <Text style={typography.caption}>{formatDate(request.created_at)}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.xs },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
});
