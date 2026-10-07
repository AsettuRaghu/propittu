import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space, typography } from '@/theme';
import { dialog } from './Dialog';
import { Icon } from './Icon';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

/**
 * Dropdown field: shows the chosen option; tapping opens the bottom sheet
 * list (with a tick on the current one). `noneLabel` adds an "empty" choice
 * for optional fields.
 */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Choose…',
  noneLabel,
  optional = false,
  error,
}: {
  label: string;
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T | null) => void;
  placeholder?: string;
  noneLabel?: string;
  optional?: boolean;
  error?: string;
}) {
  const chosen = options.find((o) => o.value === value) ?? null;
  const NONE = '__none__';

  const open = async () => {
    const picked = await dialog.actions<string>({
      title: label,
      actions: [
        ...(noneLabel ? [{ label: noneLabel, value: NONE, selected: value === null }] : []),
        ...options.map((o) => ({ ...o, selected: o.value === value })),
      ],
    });
    if (picked === null) return;
    onChange(picked === NONE ? null : (picked as T));
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {optional ? <Text style={styles.optional}> · optional</Text> : null}
      </Text>
      <Pressable
        onPress={() => void open()}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${chosen?.label ?? noneLabel ?? placeholder}`}
        style={[styles.field, error && { borderColor: colors.danger }]}
      >
        <Text
          style={[typography.body, styles.flex, !chosen && { color: colors.textSubtle }]}
          numberOfLines={1}
        >
          {chosen?.label ?? noneLabel ?? placeholder}
        </Text>
        <Icon name="chevron-down" size={18} color={colors.textSubtle} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  optional: { fontWeight: '500', color: colors.textSubtle },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 50,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  error: { fontSize: 13, color: colors.danger, fontWeight: '600' },
});
