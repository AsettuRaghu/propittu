import * as WebBrowser from 'expo-web-browser';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PropertyDisputes } from '@propittu/shared';
import { formatDate } from '@/lib/format';
import { accents, colors, space, typography } from '@/theme';
import { Icon } from './Icon';
import { ListGroup } from './ui';

const SOURCE: Record<string, string> = {
  court: 'Court record',
  news: 'News',
  rera: 'RERA',
  government: 'Government',
  other: 'Web',
};

/**
 * Court cases and disputes about the property's project or land. Pittu
 * searches the web; anything it finds is checked by our team first, so the
 * owner sees "being checked" until then — never an unchecked claim.
 */
export function DisputesSection({ disputes: d }: { disputes: PropertyDisputes | null }) {
  if (!d || d.status === 'failed') return null;
  const body =
    d.status === 'working' ? (
      <View style={styles.row}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[typography.small, styles.flex]}>
          Pittu is checking court records, RERA and news for this project and its land…
        </Text>
      </View>
    ) : d.status === 'in_review' ? (
      <View style={styles.row}>
        <Icon name="hourglass" size={16} color={accents.amber.fg} />
        <Text style={[typography.small, styles.flex]}>
          Pittu found something about this project or its land. Our team is checking what it means
          and will tell you here.
        </Text>
      </View>
    ) : d.status === 'clear' ? (
      <View style={styles.row}>
        <Icon name="success" size={16} color={accents.teal.fg} />
        <Text style={[typography.small, styles.flex]}>
          {`No court cases, ownership claims or RERA complaints found online for this project or its land${
            d.checked_at ? ` (checked ${formatDate(d.checked_at)})` : ''
          }. Not every court record is online — a full search covers the courts’ own registers.`}
        </Text>
      </View>
    ) : (
      <View style={styles.list}>
        {d.note ? <Text style={typography.body}>{d.note}</Text> : null}
        {d.items.map((i) => (
          <Pressable
            key={i.url}
            onPress={() => void WebBrowser.openBrowserAsync(i.url)}
            accessibilityRole="link"
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <Text style={typography.caption}>
              {[
                SOURCE[i.source_kind],
                i.status === 'pending' ? 'Pending' : i.status === 'decided' ? 'Decided' : null,
                i.date,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Text style={typography.bodyStrong}>{i.summary}</Text>
            <View style={styles.row}>
              <Text style={typography.caption}>{i.title}</Text>
              <Icon name="external" size={12} color={colors.textSubtle} />
            </View>
          </Pressable>
        ))}
      </View>
    );
  return (
    <ListGroup title="Court cases and disputes" plain>
      <View style={styles.inner}>{body}</View>
    </ListGroup>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  inner: { paddingHorizontal: 14, paddingVertical: space.xs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  list: { gap: space.md },
  item: { gap: 3, borderLeftWidth: 3, borderLeftColor: accents.amber.fg, paddingLeft: 12 },
  pressed: { opacity: 0.7 },
});
