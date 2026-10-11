import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { DOCUMENT_TYPE_LABELS, type DocumentPittu, type DocumentType } from '@propittu/shared';
import { accents, colors, font, space, typography } from '@/theme';
import { Icon, type IconName } from './Icon';

const LEVEL: Record<'ok' | 'note' | 'differs', { icon: IconName; color: string }> = {
  ok: { icon: 'success', color: accents.teal.fg },
  note: { icon: 'info', color: accents.amber.fg },
  differs: { icon: 'warning', color: accents.coral.fg },
};

/**
 * Under a document: what Pittu read on it ("Tax for 2026–27 · ₹2,450 paid")
 * and how it compares with the deed — a tick for what matches, amber for
 * worth knowing, coral for what differs.
 */
export function DocumentPittuLine({
  pittu,
  onMove,
}: {
  pittu: DocumentPittu;
  /** Filed under the wrong type: move it with one tap. */
  onMove?: (to: DocumentType) => void;
}) {
  if (pittu.status === 'reading') {
    return (
      <View style={styles.row}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={typography.caption}>Pittu is reading it…</Text>
      </View>
    );
  }
  if (pittu.status === 'failed') return null;
  return (
    <View style={styles.wrap}>
      {pittu.summary ? (
        <View style={styles.row}>
          <Icon name="sparkles" size={13} color={colors.primary} />
          <Text style={[typography.small, styles.summary]}>{pittu.summary}</Text>
        </View>
      ) : null}
      {pittu.findings.map((f, i) => (
        <View key={i} style={styles.row}>
          <Icon name={LEVEL[f.level].icon} size={13} color={LEVEL[f.level].color} />
          <Text style={[typography.caption, styles.flex, { color: LEVEL[f.level].color }]}>
            {f.text}
            {f.move_to && onMove ? (
              <Text style={styles.move} onPress={() => onMove(f.move_to!)}>
                {`  Move it to ${DOCUMENT_TYPE_LABELS[f.move_to]}`}
              </Text>
            ) : null}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 3, marginTop: space.xs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  flex: { flex: 1 },
  summary: { flex: 1, fontSize: font(13), color: colors.text },
  move: { color: colors.primary, fontWeight: '700' },
});
