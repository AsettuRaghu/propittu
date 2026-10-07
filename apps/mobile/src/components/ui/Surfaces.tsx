import { Children, useState, type ReactNode } from 'react';
import {
  LayoutAnimation,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { accents, colors, radius, shadow, space, typography, type Accent } from '@/theme';
import { Icon, type IconName } from '../Icon';

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
  subtitleLines = 1,
  detail,
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
  /** Lines the subtitle may use before it is cut (long names wrap). */
  subtitleLines?: number;
  /** An optional third line (e.g. dates), in caption style. */
  detail?: string | null;
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
          <Text style={typography.small} numberOfLines={subtitleLines}>
            {subtitle}
          </Text>
        ) : null}
        {detail ? (
          <Text style={typography.caption} numberOfLines={1}>
            {detail}
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
  initiallyOpen = true,
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
  /** Collapsible only: start folded. */
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
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

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 14,
  },
  cardPressed: { opacity: 0.88 },
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
});
