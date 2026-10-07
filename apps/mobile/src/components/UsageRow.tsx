import { StyleSheet, Text, View } from 'react-native';
import { colors, typography, type Accent } from '@/theme';
import { type IconName } from './Icon';
import { ListRow } from './ui';

/**
 * One usage line, in the same row style as Plans and Payments: what it is,
 * and on the right "used / limit" with what is left. Amber from 80 %, red
 * at the limit — numbers only, no bars.
 */
export function UsageRow({
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
  const share = limit ? used / limit : 0;
  const tone = share >= 1 ? colors.danger : share >= 0.8 ? colors.warning : colors.text;
  const left = limit !== undefined ? Math.max(0, limit - used) : null;
  return (
    <ListRow
      icon={icon}
      accent={accent}
      title={label}
      subtitle={hint}
      right={
        <View style={styles.numbers}>
          <Text style={[styles.used, { color: tone }]}>
            {format(used)}
            {limit !== undefined ? <Text style={styles.of}> / {format(limit)}</Text> : null}
          </Text>
          {left !== null ? (
            <Text style={[typography.caption, share >= 1 && { color: colors.danger }]}>
              {left > 0 ? `${format(left)} left` : 'Limit reached'}
            </Text>
          ) : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  numbers: { alignItems: 'flex-end' },
  used: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  of: { fontSize: 13, fontWeight: '500', color: colors.textSubtle },
});
