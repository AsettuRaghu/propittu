import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CompletionItem, PropertyCompletion } from '@propittu/shared';
import { colors, radius, space, typography } from '@/theme';
import { Card, ProgressBar } from './ui';

/**
 * Property profile completion (M2): "62% complete" plus the next
 * meaningful actions. The percentage is computed by the API from the
 * shared rules — the app only renders it.
 */
export function CompletionCard({
  completion,
  onAction,
}: {
  completion: PropertyCompletion;
  onAction: (item: CompletionItem) => void;
}) {
  const complete = completion.percent === 100;
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={typography.bodyStrong}>
          {complete ? 'Profile complete' : `${completion.percent}% complete`}
        </Text>
        {complete ? <Ionicons name="checkmark-circle" size={22} color={colors.success} /> : null}
      </View>
      <ProgressBar progress={completion.percent / 100} />
      {!complete ? (
        <View style={styles.actions}>
          <Text style={typography.small}>Next steps</Text>
          {completion.next.slice(0, 3).map((item) => (
            <Pressable
              key={item.key}
              onPress={() => onAction(item)}
              style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
              accessibilityRole="button"
            >
              <Ionicons name="ellipse-outline" size={16} color={colors.primary} />
              <Text style={[typography.body, styles.actionText]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { gap: space.xs },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
  },
  actionPressed: { backgroundColor: colors.surfaceMuted },
  actionText: { flex: 1, color: colors.primary },
});
