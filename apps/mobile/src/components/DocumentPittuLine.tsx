import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  DOCUMENT_TYPE_LABELS,
  type DocumentPittu,
  type DocumentType,
  type NameLink,
} from '@propittu/shared';
import { useSaveNameLink, useServices } from '@/api/queries';
import { errorMessage } from '@/lib/errors';
import { dialog, toast } from './Dialog';
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
  propertyId,
  onMove,
}: {
  pittu: DocumentPittu;
  propertyId: string;
  /** Filed under the wrong type: move it with one tap. */
  onMove?: (to: DocumentType) => void;
}) {
  const saveLink = useSaveNameLink();
  const services = useServices();
  const confirm = async (names: { deed_name: string; other_name: string }) => {
    const reason = await dialog.actions<NameLink['reason']>({
      title: `Is “${names.other_name}” the same person as “${names.deed_name}”?`,
      actions: [
        { label: 'Yes — married name', value: 'married_name', icon: 'users' },
        { label: 'Yes — spelt differently', value: 'spelling', icon: 'edit' },
        { label: 'Yes — initials written out', value: 'initials', icon: 'user' },
        { label: 'Yes — another reason', value: 'other', icon: 'check' },
        { label: 'No, a different person', value: 'not_same', icon: 'close' },
      ],
    });
    if (!reason) return;
    saveLink.mutate(
      { ...names, reason },
      {
        onSuccess: () =>
          toast(
            reason === 'not_same'
              ? 'Noted — our team will take a look'
              : 'Got it — I’ll remember that',
          ),
        onError: (err) =>
          void dialog.alert({
            title: 'Couldn’t save that',
            message: errorMessage(err),
            tone: 'danger',
          }),
      },
    );
  };
  const getHelp = (code: string) => {
    const service = (services.data ?? []).find((s) => s.code === code);
    router.push({
      pathname: '/services/request',
      params: { propertyId, ...(service ? { serviceId: service.id } : {}) },
    });
  };
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
            {f.confirm_name ? (
              <Text style={styles.move} onPress={() => void confirm(f.confirm_name!)}>
                {'  Same person?'}
              </Text>
            ) : null}
            {f.service ? (
              <Text style={styles.move} onPress={() => getHelp(f.service!)}>
                {'  We can fix it'}
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
