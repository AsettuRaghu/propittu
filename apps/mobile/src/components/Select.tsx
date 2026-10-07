import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space, typography } from '@/theme';
import { dialog } from './Dialog';
import { Icon, type IconName } from './Icon';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  /** Shown next to the option in the picker sheet. */
  icon?: IconName;
}

/**
 * Dropdown field: shows the chosen option; tapping opens the bottom sheet
 * list (with a tick on the current one). Optional fields use `clearable`:
 * tapping the chosen option again clears it.
 */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Choose…',
  optional = false,
  clearable = false,
  error,
  variant = 'field',
}: {
  /**
   * `flat`: no box — a small label, the choice, a chevron and a hairline
   * underneath (brand colour while open, red on error). Matches the flat
   * TextField.
   */
  variant?: 'field' | 'flat';
  label: string;
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T | null) => void;
  placeholder?: string;
  optional?: boolean;
  /** Optional choice: tapping the chosen option again clears it (no "none" entry needed). */
  clearable?: boolean;
  error?: string;
}) {
  const chosen = options.find((o) => o.value === value) ?? null;

  const open = async () => {
    const picked = await dialog.actions<string>({
      title: label,
      actions: [
        ...options.map((o) => {
          const selected = o.value === value;
          const hint = clearable && selected ? 'Selected · tap again to remove' : undefined;
          return {
            ...o,
            selected,
            description: [o.description, hint].filter(Boolean).join(' · ') || undefined,
          };
        }),
      ],
    });
    if (picked === null) return;
    if (clearable && picked === value) return onChange(null);
    onChange(picked as T);
  };

  if (variant === 'flat') {
    return (
      <View>
        <Pressable
          onPress={() => void open()}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${chosen?.label ?? placeholder}`}
          style={({ pressed }) => [
            styles.flatField,
            error ? { borderBottomColor: colors.danger } : null,
            pressed && { borderBottomColor: colors.primary },
          ]}
        >
          <View style={styles.flex}>
            <Text style={typography.caption}>{label}</Text>
            <Text
              style={[styles.flatValue, !chosen && { color: colors.textSubtle }]}
              numberOfLines={1}
            >
              {chosen?.label ?? placeholder}
            </Text>
          </View>
          <Icon name="chevron-down" size={18} color={colors.textMuted} />
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {optional ? <Text style={styles.optional}> · optional</Text> : null}
      </Text>
      <Pressable
        onPress={() => void open()}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${chosen?.label ?? placeholder}`}
        style={[styles.field, error && { borderColor: colors.danger }]}
      >
        <Text
          style={[typography.body, styles.flex, !chosen && { color: colors.textSubtle }]}
          numberOfLines={1}
        >
          {chosen?.label ?? placeholder}
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
  label: { fontSize: font(13), fontWeight: '700', color: colors.textMuted },
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
  error: { fontSize: font(13), color: colors.danger, fontWeight: '600', marginTop: 4 },
  flatField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
  },
  flatValue: { fontSize: font(17), color: colors.text, marginTop: 2 },
});
