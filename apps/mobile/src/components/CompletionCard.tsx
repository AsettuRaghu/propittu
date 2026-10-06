import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CompletionItem, PropertyCompletion } from '@propittu/shared';
import { accents, colors, radius, space, typography } from '@/theme';
import { Icon } from './Icon';
import { Card, ProgressRing } from './ui';

/**
 * Property profile completion (M2): a ring with the percentage and the
 * next steps as tappable chips. The percentage is computed by the API
 * from the shared rules — the app only renders it.
 */
export function CompletionCard({
  completion,
  onAction,
}: {
  completion: PropertyCompletion;
  onAction: (item: CompletionItem) => void;
}) {
  const complete = completion.percent === 100;
  const ringColor = complete ? colors.success : colors.primary;
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <ProgressRing progress={completion.percent / 100} size={52} stroke={6} color={ringColor}>
          {complete ? (
            <Icon name="check" size={20} color={colors.success} strokeWidth={3} />
          ) : (
            <Text style={styles.percent}>{completion.percent}%</Text>
          )}
        </ProgressRing>
        <View style={styles.flex}>
          <Text style={typography.bodyStrong}>
            {complete ? 'Property profile complete' : 'Complete your property profile'}
          </Text>
          <Text style={typography.small} numberOfLines={1}>
            {complete
              ? 'Everything important is in one place.'
              : `${completion.next.length} step${completion.next.length === 1 ? '' : 's'} left`}
          </Text>
        </View>
      </View>
      {!complete ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {completion.next.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => onAction(item)}
              style={({ pressed }) => [styles.chip, pressed && { opacity: 0.75 }]}
              accessibilityRole="button"
            >
              <Icon name="add" size={14} color={accents.indigo.fg} strokeWidth={2.5} />
              <Text style={styles.chipText}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
  percent: { fontSize: 13, fontWeight: '800', color: colors.primary },
  chips: { gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: accents.indigo.bg,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 8,
  },
  chipText: { fontSize: 13, fontWeight: '700', color: accents.indigo.fg },
});
