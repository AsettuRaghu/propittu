import { StyleSheet, Text, View } from 'react-native';
import { TITLE_EVENT_LABELS, type TitleEvent } from '@propittu/shared';
import { formatDate } from '@/lib/format';
import { colors, font, space, typography } from '@/theme';

/** "17 Aug 2005", or just "2005" when the deed gives only the year. */
const when = (date: string | null) =>
  !date ? null : /^\d{4}$/.test(date) ? date : formatDate(date);

/**
 * The property's history as its sale deed tells it, oldest first: who it
 * passed from and to, and how — ending with the owner's own purchase.
 * Shown as a quiet vertical line of dots.
 */
export function TitleTimeline({ events }: { events: TitleEvent[] }) {
  return (
    <View>
      {events.map((e, i) => {
        const last = i === events.length - 1;
        const who =
          e.from.length || e.to.length
            ? [e.from.join(', '), e.to.join(', ')].filter(Boolean).join(' → ')
            : null;
        return (
          <View key={i} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, last && styles.dotLast]} />
              {!last ? <View style={styles.line} /> : null}
            </View>
            <View style={styles.body}>
              <Text style={typography.caption}>
                {[when(e.date), TITLE_EVENT_LABELS[e.event]].filter(Boolean).join(' · ')}
              </Text>
              {who ? <Text style={styles.who}>{who}</Text> : null}
              {e.note ? <Text style={typography.small}>{e.note}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md },
  rail: { width: 12, alignItems: 'center' },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
    backgroundColor: colors.border,
    borderWidth: 2,
    borderColor: colors.borderStrong,
  },
  dotLast: { backgroundColor: colors.primary, borderColor: colors.primary },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  body: { flex: 1, gap: 2, paddingBottom: space.md },
  who: { fontSize: font(15), fontWeight: '600', color: colors.text },
});
