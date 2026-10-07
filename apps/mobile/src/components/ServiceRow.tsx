import { StyleSheet, Text } from 'react-native';
import { formatPrice, type CatalogueService } from '@propittu/shared';
import { serviceVisual } from '@/lib/icons';
import { colors, typography } from '@/theme';
import { ListRow } from './ui';

export const servicePrice = (s: CatalogueService) =>
  s.price_paise !== null ? formatPrice(s.price_paise) : 'On quote';

/**
 * One service in a list: its icon, name, a short line (the description, or
 * a note such as "Not in your area yet") and its price on the right.
 */
export function ServiceRow({
  service,
  note,
  onPress,
}: {
  service: CatalogueService;
  /** Replaces the description and mutes the price (e.g. out of reach). */
  note?: string | null;
  onPress: () => void;
}) {
  return (
    <ListRow
      {...serviceVisual(service.code, service.category)}
      title={service.name}
      subtitle={note ?? service.description}
      right={
        <Text style={[styles.price, note ? styles.muted : null]}>{servicePrice(service)}</Text>
      }
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  price: { ...typography.bodyStrong, color: colors.text },
  muted: { color: colors.textSubtle },
});
