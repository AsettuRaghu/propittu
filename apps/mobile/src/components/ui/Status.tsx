import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, font, radius, space } from '@/theme';
import { Icon, type IconName } from '../Icon';

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

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: font(12), fontWeight: '700' },
  badgeLg: { paddingHorizontal: space.md, paddingVertical: 6, gap: 6 },
  badgeTextLg: { fontSize: font(14), fontWeight: '800' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 10,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
  },
  bannerTitle: { fontSize: font(14), fontWeight: '700', marginBottom: 1 },
  bannerText: { fontSize: font(13), lineHeight: font(18) },
  bannerAction: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  bannerActionText: { fontSize: font(13), fontWeight: '700' },
  progressTrack: { borderRadius: radius.pill, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill },
});
