import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Children, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
  accents,
  colors,
  gradients,
  radius,
  shadow,
  space,
  typography,
  type Accent,
} from '@/theme';
import { Icon, type IconName } from './Icon';

export type { IconName };

const tap = () => void Haptics.selectionAsync().catch(() => undefined);

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

/* ------------------------------------------------------------------ *
 * Surfaces
 * ------------------------------------------------------------------ */

export function Card({
  children,
  onPress,
  style,
  flat = false,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  flat?: boolean;
}) {
  const base = [styles.card, !flat && shadow];
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [base, pressed && styles.cardPressed, style]}
    >
      {children}
    </Pressable>
  );
}

/** A card painted with one of the brand gradients — for a few heroes only. */
export function GradientCard({
  children,
  colors: palette = gradients.brand,
  onPress,
  style,
}: {
  children: ReactNode;
  colors?: readonly [string, string];
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const body = (
    <LinearGradient
      colors={palette}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.gradient, style]}
    >
      {children}
    </LinearGradient>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => pressed && { opacity: 0.92 }}
    >
      {body}
    </Pressable>
  );
}

/** Rounded square with a soft tint — the app's signature icon treatment. */
export function IconTile({
  icon,
  accent = 'indigo',
  size = 32,
  solid = false,
}: {
  icon: IconName;
  accent?: Accent;
  size?: number;
  solid?: boolean;
}) {
  const a = accents[accent];
  return (
    <View
      style={[
        styles.iconTile,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.32),
          backgroundColor: solid ? a.fg : a.bg,
        },
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={solid ? '#FFFFFF' : a.fg} />
    </View>
  );
}

/** Section heading with an optional right-hand action. */
export function SectionTitle({
  title,
  action,
  subtitle,
}: {
  title: string;
  action?: ReactNode;
  subtitle?: string;
}) {
  return (
    <View style={styles.sectionTitle}>
      <View style={styles.flex}>
        <Text style={typography.heading} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={typography.small} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

/** Settings-style row: icon tile, title/subtitle, accessory. */
export function ListRow({
  icon,
  accent = 'indigo',
  title,
  subtitle,
  value,
  onPress,
  destructive = false,
  right,
  showChevron = true,
}: {
  icon?: IconName;
  accent?: Accent;
  title: string;
  subtitle?: string | null;
  value?: string | null;
  onPress?: () => void;
  destructive?: boolean;
  right?: ReactNode;
  showChevron?: boolean;
}) {
  const content = (
    <>
      {icon ? <IconTile icon={icon} accent={destructive ? 'coral' : accent} size={30} /> : null}
      <View style={styles.flex}>
        <Text
          style={[typography.bodyStrong, destructive && { color: colors.danger }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={typography.small} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={[typography.small, styles.rowValue]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {right ? <View style={styles.rowRight}>{right}</View> : null}
      {onPress && showChevron ? <Icon name="chevron" size={18} color={colors.textSubtle} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.listRow}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.listRow, pressed && styles.listRowPressed]}
    >
      {content}
    </Pressable>
  );
}

/**
 * Groups ListRows with hairline separators — inside one card, or `plain`
 * (no card, flush with the page) under an optional section title.
 */
export function ListGroup({
  children,
  title,
  action,
  plain = false,
  indent,
  collapsible = false,
}: {
  children: ReactNode;
  title?: string;
  /** Shown on the right of the title (e.g. a small "Raise a ticket" button). */
  action?: ReactNode;
  plain?: boolean;
  /** Plain only: set the entries slightly in from the heading (default: when titled). */
  indent?: boolean;
  /** Tapping the title folds the entries away (a chevron shows which way). */
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const inset = indent ?? !!title;
  const items = Children.toArray(children);
  const heading = title ? (
    <View style={styles.listTitleRow}>
      <Text style={typography.heading}>{title}</Text>
      {collapsible ? (
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
      ) : null}
    </View>
  ) : null;
  return (
    <View>
      {title ? (
        <View style={[styles.listHead, action ? styles.listHeadAction : null]}>
          {collapsible ? (
            <Pressable
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setOpen((v) => !v);
              }}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              hitSlop={8}
              style={styles.flex}
            >
              {heading}
            </Pressable>
          ) : (
            <View style={styles.flex}>{heading}</View>
          )}
          {action}
        </View>
      ) : null}
      {open ? (
        <View
          style={
            plain ? (inset ? styles.listPlainInset : styles.listPlain) : [styles.listGroup, shadow]
          }
        >
          {items.map((child, i) => (
            <View key={i}>
              {i > 0 ? (
                <View style={[styles.listDivider, plain && styles.listDividerPlain]} />
              ) : null}
              {child}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function KeyValue({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | null | undefined;
  icon?: IconName;
}) {
  if (!value) return null;
  return (
    <View style={styles.keyValue}>
      {icon ? <Icon name={icon} size={16} color={colors.textSubtle} /> : null}
      <View style={styles.flex}>
        <Text style={typography.caption}>{label}</Text>
        <Text style={typography.body}>{value}</Text>
      </View>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

/* ------------------------------------------------------------------ *
 * Status
 * ------------------------------------------------------------------ */

export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'brand';

const toneColors: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.textMuted, bg: colors.surfaceMuted },
  info: { fg: colors.info, bg: colors.infoSoft },
  warning: { fg: colors.warning, bg: colors.warningSoft },
  success: { fg: colors.success, bg: colors.successSoft },
  danger: { fg: colors.danger, bg: colors.dangerSoft },
  brand: { fg: colors.primary, bg: colors.primarySoft },
};

const toneIcons: Record<Tone, IconName> = {
  neutral: 'info',
  info: 'info',
  warning: 'warning',
  success: 'success',
  danger: 'error',
  brand: 'sparkles',
};

export function Badge({
  label,
  tone = 'neutral',
  icon,
  size = 'sm',
}: {
  label: string;
  tone?: Tone;
  icon?: IconName;
  /** `lg` for a status that is the point of the screen (e.g. a ticket). */
  size?: 'sm' | 'lg';
}) {
  const lg = size === 'lg';
  const c = toneColors[tone];
  // The outer view follows the parent's alignment (centred in a row); the
  // pill inside keeps its own size (never stretched in a column).
  return (
    <View>
      <View style={[styles.badge, lg && styles.badgeLg, { backgroundColor: c.bg }]}>
        {icon ? <Icon name={icon} size={lg ? 14 : 12} color={c.fg} strokeWidth={2.5} /> : null}
        <Text
          style={[styles.badgeText, lg && styles.badgeTextLg, { color: c.fg }]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

/** Inline message. With `action`, the whole banner is tappable and says what happens. */
export function Banner({
  message,
  tone = 'danger',
  title,
  action,
  onPress,
  icon,
}: {
  message: string;
  tone?: Tone;
  title?: string;
  action?: string;
  onPress?: () => void;
  icon?: IconName;
}) {
  const c = toneColors[tone];
  const body = (
    <View style={[styles.banner, { backgroundColor: c.bg }]} accessibilityRole="alert">
      <Icon name={icon ?? toneIcons[tone]} size={18} color={c.fg} />
      <View style={styles.flex}>
        {title ? <Text style={[styles.bannerTitle, { color: c.fg }]}>{title}</Text> : null}
        <Text style={[styles.bannerText, { color: tone === 'neutral' ? colors.text : c.fg }]}>
          {message}
        </Text>
      </View>
      {action ? (
        <View style={[styles.bannerAction, { borderColor: c.fg }]}>
          <Text style={[styles.bannerActionText, { color: c.fg }]}>{action}</Text>
        </View>
      ) : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => pressed && { opacity: 0.85 }}
    >
      {body}
    </Pressable>
  );
}

export function ProgressBar({
  progress,
  color = colors.primary,
  track = colors.surfaceMuted,
  height = 8,
}: {
  progress: number;
  color?: string;
  track?: string;
  height?: number;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <View
      style={[styles.progressTrack, { height, backgroundColor: track }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

/** Circular progress (profile completion, days left). */
export function ProgressRing({
  progress,
  size = 56,
  stroke = 6,
  color = colors.primary,
  track = colors.surfaceMuted,
  children,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - p)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
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

/** Full-width selectable rows — longer lists or options with descriptions. */
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
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={({ pressed }) => [
              styles.option,
              selected && styles.optionSelected,
              pressed && !selected && styles.cardPressed,
            ]}
          >
            {o.icon ? (
              <IconTile icon={o.icon} size={36} accent={selected ? 'indigo' : 'slate'} />
            ) : null}
            <View style={styles.flex}>
              <Text style={[typography.bodyStrong, selected && { color: colors.primary }]}>
                {o.label}
              </Text>
              {o.description ? <Text style={typography.small}>{o.description}</Text> : null}
            </View>
            <View style={[styles.radio, selected && styles.radioOn]}>
              {selected ? (
                <Icon name="check" size={14} color={colors.onPrimary} strokeWidth={3} />
              ) : null}
            </View>
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
  flex: { flex: 1, minWidth: 0 },

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
  buttonText: { fontSize: 16, fontWeight: '700', letterSpacing: -0.1 },
  buttonTextSm: { fontSize: 14 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkText: { fontSize: 14, fontWeight: '600' },
  iconButton: { alignItems: 'center', justifyContent: 'center' },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 14,
  },
  cardPressed: { opacity: 0.88 },
  gradient: { borderRadius: radius.lg, padding: space.lg, overflow: 'hidden' },
  iconTile: { alignItems: 'center', justifyContent: 'center' },

  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.sm,
  },
  listGroup: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 52,
  },
  listRowPressed: { backgroundColor: colors.surfaceMuted },
  listDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 56 },
  listDividerPlain: { marginLeft: 0 },
  // Rows have 14 pt inner padding; bleeding by the same amount lines their
  // content up with the page's own 16 pt edge (titles, headers, buttons).
  listPlain: { marginHorizontal: -14 },
  // Entries 12 pt in from their heading; right edge still on the page edge.
  listPlainInset: { marginLeft: -2, marginRight: -14 },
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.xs,
  },
  listHeadAction: { minHeight: 38 },
  listTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue: { maxWidth: '45%' },
  rowRight: { justifyContent: 'center' },
  keyValue: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: space.md,
  },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  badgeLg: { paddingHorizontal: space.md, paddingVertical: 6, gap: 6 },
  badgeTextLg: { fontSize: 14, fontWeight: '800' },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 10,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
  },
  bannerTitle: { fontSize: 14, fontWeight: '700', marginBottom: 1 },
  bannerText: { fontSize: 13, lineHeight: 18 },
  bannerAction: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  bannerActionText: { fontSize: 13, fontWeight: '700' },

  progressTrack: { borderRadius: radius.pill, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill },

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
  chipText: { fontSize: 14, fontWeight: '500', color: colors.text },
  chipTextSelected: { color: colors.primary, fontWeight: '700' },

  optionList: { gap: space.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { backgroundColor: colors.primary, borderColor: colors.primary },

  segments: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  segment: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  segmentTextActive: { color: colors.text },
  tabs: { flexDirection: 'row', gap: space.xs },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.pill },
  tabActive: { backgroundColor: colors.primarySoft },
  tabText: { fontSize: 15, fontWeight: '500', color: colors.textMuted },
  tabTextActive: { fontSize: 15, fontWeight: '600', color: colors.primary },
});
