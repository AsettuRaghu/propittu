import { StyleSheet, Text, View } from 'react-native';
import { requestStatusLabel, type ServiceRequest } from '@propittu/shared';
import { formatDate } from '@/lib/format';
import { serviceVisual, STATUS_ICONS, STATUS_TONES } from '@/lib/icons';
import { colors, space, typography } from '@/theme';
import { Icon } from './Icon';
import { Badge, Card, IconTile } from './ui';

const STEPS: ServiceRequest['status'][] = ['requested', 'confirmed', 'scheduled', 'completed'];

/** Index of the furthest step reached (in progress counts as scheduled). */
function stepOf(status: ServiceRequest['status']): number {
  if (status === 'in_progress') return 2;
  return STEPS.indexOf(status);
}

export function ServiceRequestCard({
  request,
  onPress,
}: {
  request: ServiceRequest;
  onPress: () => void;
}) {
  const v = serviceVisual(request.service.code, request.service.category);
  const step = stepOf(request.status);
  const cancelled = request.status === 'cancelled';
  const when = request.scheduled_for
    ? `Visit ${formatDate(request.scheduled_for)}`
    : `Requested ${formatDate(request.created_at)}`;

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.top}>
        <IconTile icon={v.icon} accent={v.accent} size={36} />
        <View style={styles.flex}>
          <Text style={typography.bodyStrong} numberOfLines={1}>
            {request.service.name}
          </Text>
          <Text style={typography.small} numberOfLines={1}>
            {request.property?.name ?? 'Property removed'} · {formatDate(request.created_at)}
          </Text>
        </View>
        <Icon name="chevron" size={18} color={colors.textSubtle} />
      </View>

      {!cancelled ? (
        <View style={styles.progress}>
          {STEPS.map((s, i) => (
            <View
              key={s}
              style={[
                styles.bar,
                i <= step && { backgroundColor: i === 3 ? colors.success : colors.primary },
              ]}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.bottom}>
        <Badge
          label={requestStatusLabel(request.status, request.fulfilment)}
          tone={STATUS_TONES[request.status]}
          icon={STATUS_ICONS[request.status]}
        />
        <Text style={typography.caption}>{when}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1, minWidth: 0 },
  progress: { flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surfaceMuted },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
