import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, shadow, space } from '@/theme';
import { Icon, type IconName } from '../Icon';
import { tap } from './tap';

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */

export interface Option<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: IconName;
}

/** Compact wrap of selectable chips — short lists such as area units. */
export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            {o.icon ? (
              <Icon name={o.icon} size={15} color={selected ? colors.primary : colors.textMuted} />
            ) : null}
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** iOS-style segmented control. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  variant = 'pill',
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** `text`: flat tabs — just words, the active one bold in the brand colour. */
  variant?: 'pill' | 'text';
}) {
  const flat = variant === 'text';
  return (
    <View style={flat ? styles.tabs : styles.segments} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={
              flat
                ? [styles.tab, active && styles.tabActive]
                : [styles.segment, active && [styles.segmentActive, shadow]]
            }
          >
            <Text
              style={[
                styles.segmentText,
                active && styles.segmentTextActive,
                flat && (active ? styles.tabTextActive : styles.tabText),
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.surfaceMuted,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { fontSize: font(14), fontWeight: '500', color: colors.text },
  chipTextSelected: { color: colors.primary, fontWeight: '700' },
  segments: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  segment: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { fontSize: font(14), fontWeight: '600', color: colors.textMuted },
  segmentTextActive: { color: colors.text },
  tabs: { flexDirection: 'row', gap: space.xs },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.pill },
  tabActive: { backgroundColor: colors.primarySoft },
  tabText: { fontSize: font(15), fontWeight: '500', color: colors.textMuted },
  tabTextActive: { fontSize: font(15), fontWeight: '600', color: colors.primary },
});
