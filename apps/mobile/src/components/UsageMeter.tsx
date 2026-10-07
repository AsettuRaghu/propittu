import { StyleSheet, Text, View } from 'react-native';
import { accents, colors, radius, space, typography, type Accent } from '@/theme';
import { type IconName } from './Icon';
import { IconTile } from './ui';

/** Small allowances (properties, visits) read better as slots than as a bar. */
const MAX_SLOTS = 12;

/**
 * One usage line: what it is, how much is used of how much, how much is
 * left, and a meter — slots for small whole-number allowances, a bar
 * otherwise. Amber from 80 %, red at the limit.
 */
export function UsageMeter({
  icon,
  accent,
  label,
  hint,
  used,
  limit,
  format = String,
}: {
  icon: IconName;
  accent: Accent;
  label: string;
  hint?: string;
  used: number;
  limit: number | undefined;
  format?: (n: number) => string;
}) {
  const a = accents[accent];
  const share = limit ? used / limit : 0;
  const fill = share >= 1 ? colors.danger : share >= 0.8 ? colors.warning : a.fg;
  const left = limit !== undefined ? Math.max(0, limit - used) : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <IconTile icon={icon} accent={accent} size={28} />
        <View style={styles.flex}>
          <Text style={typography.bodyStrong} numberOfLines={1}>
            {label}
          </Text>
          {hint ? (
            <Text style={typography.caption} numberOfLines={1}>
              {hint}
            </Text>
          ) : null}
        </View>
        <View style={styles.numbers}>
          <Text style={styles.used}>
            {format(used)}
            {limit !== undefined ? <Text style={styles.of}> / {format(limit)}</Text> : null}
          </Text>
          {left !== null ? (
            <Text style={[typography.caption, share >= 1 && { color: colors.danger }]}>
              {left > 0 ? `${format(left)} left` : 'Limit reached'}
            </Text>
          ) : null}
        </View>
      </View>
      {limit === undefined ? null : Number.isInteger(limit) && limit <= MAX_SLOTS ? (
        <View style={styles.slots} accessibilityLabel={`${used} of ${limit} used`}>
          {Array.from({ length: limit }, (_, i) => (
            <View key={i} style={[styles.slot, { backgroundColor: i < used ? fill : a.bg }]} />
          ))}
        </View>
      ) : (
        <View
          style={[styles.track, { backgroundColor: a.bg }]}
          accessibilityLabel={`${Math.round(share * 100)}% used`}
        >
          <View
            style={[
              styles.bar,
              {
                backgroundColor: fill,
                width: `${Math.min(100, Math.max(share > 0 ? 3 : 0, share * 100))}%`,
              },
            ]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  wrap: { gap: space.sm, paddingVertical: space.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  numbers: { alignItems: 'flex-end' },
  used: { fontSize: 16, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  of: { fontSize: 13, fontWeight: '600', color: colors.textSubtle },
  slots: { flexDirection: 'row', gap: 4 },
  slot: { flex: 1, height: 8, borderRadius: radius.pill },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: radius.pill },
});
