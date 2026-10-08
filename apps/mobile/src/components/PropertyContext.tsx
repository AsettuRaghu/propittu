import { StyleSheet, Text, View } from 'react-native';
import { useProperty } from '@/api/queries';
import { PROPERTY_TYPE_ICONS } from '@/lib/icons';
import { colors, font, radius, space } from '@/theme';
import { Icon } from './Icon';

/**
 * A quiet line under a page's title saying whose items these are: the
 * property's type icon, its name (one line, however long) and its city.
 * Used by Documents, Photos & videos and Service requests, so the header
 * can simply name the page.
 */
export function PropertyContext({ propertyId }: { propertyId: string }) {
  const { data: p } = useProperty(propertyId);
  if (!p) return <View style={styles.placeholder} />;
  return (
    <View style={styles.row} accessibilityLabel={`For ${p.name}`}>
      <View style={styles.icon}>
        <Icon name={PROPERTY_TYPE_ICONS[p.property_type]} size={14} color={colors.primary} />
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {p.name}
        {p.city ? <Text style={styles.city}> · {p.city}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  placeholder: { height: 26 },
  icon: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { flex: 1, fontSize: font(14), fontWeight: '600', color: colors.textMuted },
  city: { fontWeight: '400', color: colors.textSubtle },
});
