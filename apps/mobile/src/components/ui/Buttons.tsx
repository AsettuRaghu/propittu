import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, font, radius, space } from '@/theme';
import { Icon, type IconName } from '../Icon';
import { tap } from './tap';

/* ------------------------------------------------------------------ *
 * Button — disables itself while `loading`, which prevents duplicate
 * submissions across the app (PRODUCT_SPEC.md §40).
 * ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

const buttonVariants: Record<
  ButtonVariant,
  { bg: string; pressed: string; border: string; text: string }
> = {
  primary: {
    bg: colors.primary,
    pressed: colors.primaryPressed,
    border: colors.primary,
    text: colors.onPrimary,
  },
  secondary: {
    bg: colors.primarySoft,
    pressed: '#E0E3FF',
    border: colors.primarySoft,
    text: colors.primary,
  },
  outline: {
    bg: colors.surface,
    pressed: colors.surfaceMuted,
    border: colors.border,
    text: colors.text,
  },
  ghost: {
    bg: 'transparent',
    pressed: colors.primarySoft,
    border: 'transparent',
    text: colors.primary,
  },
  danger: {
    bg: colors.dangerSoft,
    pressed: '#FBDCDC',
    border: colors.dangerSoft,
    text: colors.danger,
  },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
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
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' && styles.buttonSm,
        { backgroundColor: pressed ? v.pressed : v.bg, borderColor: v.border },
        inactive && styles.buttonInactive,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.text} />
      ) : (
        <View style={styles.buttonContent}>
          {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} color={v.text} /> : null}
          <Text
            style={[styles.buttonText, size === 'sm' && styles.buttonTextSm, { color: v.text }]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** A small text-style action ("See all", "Change"). */
export function LinkButton({
  title,
  onPress,
  tone = 'primary',
  icon,
}: {
  title: string;
  onPress: () => void;
  tone?: 'primary' | 'danger' | 'muted';
  icon?: IconName;
}) {
  const color =
    tone === 'danger' ? colors.danger : tone === 'muted' ? colors.textMuted : colors.primary;
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" style={styles.link}>
      {icon ? <Icon name={icon} size={15} color={color} /> : null}
      <Text style={[styles.linkText, { color }]}>{title}</Text>
    </Pressable>
  );
}

/** Round icon-only button (header actions, FAB). */
export function IconButton({
  icon,
  onPress,
  label,
  variant = 'soft',
  size = 40,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  variant?: 'soft' | 'solid' | 'plain';
  size?: number;
}) {
  const bg =
    variant === 'solid' ? colors.primary : variant === 'soft' ? colors.primarySoft : 'transparent';
  const fg = variant === 'solid' ? colors.onPrimary : colors.primary;
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        styles.iconButton,
        pressed && { opacity: 0.75 },
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={fg} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSm: { minHeight: 38, paddingHorizontal: space.md, borderRadius: radius.sm },
  buttonInactive: { opacity: 0.5 },
  buttonContent: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  buttonText: { fontSize: font(16), fontWeight: '700', letterSpacing: -0.1 },
  buttonTextSm: { fontSize: font(14) },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkText: { fontSize: font(14), fontWeight: '600' },
  iconButton: { alignItems: 'center', justifyContent: 'center' },
});
