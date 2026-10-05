import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, space, typography } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/* ------------------------------------------------------------------ *
 * Button — disables itself while `loading`, which is what prevents
 * duplicate submissions across the app (PRODUCT_SPEC.md §40).
 * ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const inactive = disabled || loading;
  const v = buttonVariants[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed ? v.pressed : v.background, borderColor: v.border },
        inactive && styles.buttonInactive,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.text} />
      ) : (
        <View style={styles.buttonContent}>
          {icon ? <Ionicons name={icon} size={18} color={v.text} /> : null}
          <Text style={[styles.buttonText, { color: v.text }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const buttonVariants: Record<
  ButtonVariant,
  { background: string; pressed: string; border: string; text: string }
> = {
  primary: {
    background: colors.primary,
    pressed: colors.primaryPressed,
    border: colors.primary,
    text: colors.onPrimary,
  },
  secondary: {
    background: colors.surface,
    pressed: colors.surfaceMuted,
    border: colors.borderStrong,
    text: colors.text,
  },
  ghost: {
    background: 'transparent',
    pressed: colors.primarySoft,
    border: 'transparent',
    text: colors.primary,
  },
  danger: {
    background: colors.surface,
    pressed: colors.dangerSoft,
    border: colors.danger,
    text: colors.danger,
  },
};

/* ------------------------------------------------------------------ *
 * Layout and content
 * ------------------------------------------------------------------ */

export function Card({
  children,
  onPress,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}
    >
      {children}
    </Pressable>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={typography.overline}>{title}</Text>
      {action}
    </View>
  );
}

export function KeyValue({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.keyValue}>
      <Text style={typography.overline}>{label}</Text>
      <Text style={typography.body}>{value}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

/* ------------------------------------------------------------------ *
 * Status
 * ------------------------------------------------------------------ */

export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

const toneColors: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.textMuted, bg: colors.surfaceMuted },
  info: { fg: colors.info, bg: colors.infoSoft },
  warning: { fg: colors.warning, bg: colors.warningSoft },
  success: { fg: colors.success, bg: colors.successSoft },
  danger: { fg: colors.danger, bg: colors.dangerSoft },
};

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const c = toneColors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

const bannerIcons: Record<Tone, IconName> = {
  neutral: 'information-circle-outline',
  info: 'information-circle-outline',
  warning: 'warning-outline',
  success: 'checkmark-circle-outline',
  danger: 'alert-circle-outline',
};

export function Banner({ message, tone = 'danger' }: { message: string; tone?: Tone }) {
  const c = toneColors[tone];
  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: c.bg, borderColor: c.fg }]}
    >
      <Ionicons name={bannerIcons[tone]} size={20} color={c.fg} />
      <Text style={[styles.bannerText, { color: c.fg }]}>{message}</Text>
    </View>
  );
}

export function ProgressBar({ progress }: { progress: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <View
      style={styles.progressTrack}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <View style={[styles.progressFill, { width: `${pct}%` }]} />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */

export interface Option<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: IconName;
}

/** Compact wrap of selectable chips — for short lists such as area units. */
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
            onPress={() => onChange(o.value)}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Full-width selectable rows — for longer lists or options with descriptions. */
export function OptionList<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.optionList}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => [
              styles.option,
              selected && styles.optionSelected,
              pressed && !selected && styles.cardPressed,
            ]}
          >
            {o.icon ? (
              <Ionicons
                name={o.icon}
                size={22}
                color={selected ? colors.primary : colors.textMuted}
              />
            ) : null}
            <View style={styles.optionBody}>
              <Text style={[typography.bodyStrong, selected && { color: colors.primary }]}>
                {o.label}
              </Text>
              {o.description ? <Text style={typography.small}>{o.description}</Text> : null}
            </View>
            <Ionicons
              name={selected ? 'radio-button-on' : 'radio-button-off'}
              size={22}
              color={selected ? colors.primary : colors.borderStrong}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonInactive: { opacity: 0.55 },
  buttonContent: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  buttonText: { fontSize: 16, fontWeight: '600' },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  cardPressed: { backgroundColor: colors.surfaceMuted },

  sectionTitle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  keyValue: { gap: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.lg },

  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },

  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bannerText: { flex: 1, fontSize: 14, lineHeight: 20 },

  progressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.primary },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { fontSize: 14, color: colors.text },
  chipTextSelected: { color: colors.primary, fontWeight: '600' },

  optionList: { gap: space.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionBody: { flex: 1, gap: 2 },
});
