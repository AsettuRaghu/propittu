import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPES, type DocumentType } from '@propittu/shared';
import { useDocuments } from '@/api/queries';
import { DOCUMENT_TYPE_VISUALS } from '@/lib/icons';
import { accents, colors, font, radius, shadow, space } from '@/theme';
import { Icon } from './Icon';
import { IconTile } from './ui';

/**
 * One tile per document type. An empty slot uploads straight into that
 * type; a filled slot opens the property's documents. Owners see at a
 * glance what is still missing (e.g. the Sale Deed).
 */
export function DocumentSlots({ propertyId }: { propertyId: string }) {
  const { data } = useDocuments(propertyId);
  const counts = new Map<DocumentType, number>();
  for (const d of data ?? []) counts.set(d.document_type, (counts.get(d.document_type) ?? 0) + 1);

  const open = (type: DocumentType) =>
    (counts.get(type) ?? 0) > 0
      ? router.push(`/properties/${propertyId}/documents`)
      : router.push({
          pathname: '/properties/[id]/add-document',
          params: { id: propertyId, type },
        });

  return (
    <View style={styles.grid}>
      {DOCUMENT_TYPES.map((type) => {
        const count = counts.get(type) ?? 0;
        const v = DOCUMENT_TYPE_VISUALS[type];
        return (
          <Pressable
            key={type}
            onPress={() => open(type)}
            accessibilityRole="button"
            accessibilityLabel={`${DOCUMENT_TYPE_LABELS[type]}: ${count > 0 ? `${count} added` : 'add'}`}
            style={({ pressed }) => [styles.tile, shadow, pressed && { opacity: 0.85 }]}
          >
            <IconTile icon={v.icon} accent={v.accent} size={36} />
            <Text style={styles.label} numberOfLines={1}>
              {DOCUMENT_TYPE_LABELS[type]}
            </Text>
            {count > 0 ? (
              <View style={styles.done}>
                <Icon name="check" size={12} color={accents.teal.fg} strokeWidth={3} />
                <Text style={styles.doneText}>{count === 1 ? 'Added' : `${count} added`}</Text>
              </View>
            ) : (
              <View style={styles.add}>
                <Icon name="add" size={12} color={colors.primary} strokeWidth={3} />
                <Text style={styles.addText}>Upload</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    width: '48.5%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
  label: { fontSize: font(14), fontWeight: '700', color: colors.text },
  done: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  doneText: { fontSize: font(12), fontWeight: '700', color: accents.teal.fg },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addText: { fontSize: font(12), fontWeight: '700', color: colors.primary },
});
