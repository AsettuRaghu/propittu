import { router } from 'expo-router';
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
 * Court cases and disputes about the property's project or land: alerts
 * our team confirmed for everyone in the project, Pittu's online search
 * (anything it finds is checked by our team first — the owner never sees an
 * unchecked claim), what this owner told us and our reply, and a way to tell
 * us about one.
 */
export function DisputesSection({
  disputes: d,
  propertyId,
}: {
  disputes: PropertyDisputes | null;
  propertyId: string;
}) {
  const project = d?.project ?? [];
  const reports = d?.reports ?? [];
  const online =
    !d || d.status === 'failed' ? null : d.status === 'working' ? (
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
      <View style={[styles.inner, styles.list]}>
        {project.map((p) => (
          <View key={p.id} style={[styles.item, p.status === 'resolved' && styles.resolved]}>
            <Text style={typography.caption}>
              {`For everyone in ${p.project_name} · ${p.status === 'resolved' ? 'resolved' : 'confirmed by our team'} · ${formatDate(p.updated_at)}`}
            </Text>
            <Text style={typography.bodyStrong}>{p.summary}</Text>
            {p.what_it_means ? (
              <Text style={typography.small}>{`What it means for you: ${p.what_it_means}`}</Text>
            ) : null}
            {p.what_to_do ? (
              <Text style={typography.small}>{`What to do: ${p.what_to_do}`}</Text>
            ) : null}
            {p.source_url ? (
              <Text
                style={styles.link}
                onPress={() => void WebBrowser.openBrowserAsync(p.source_url!)}
              >
                See the record
              </Text>
            ) : null}
          </View>
        ))}
        {online}
        {reports.map((r) => (
          <View key={r.id} style={styles.report}>
            <Text style={typography.caption}>{`You told us on ${formatDate(r.created_at)}`}</Text>
            <Text style={typography.small} numberOfLines={3}>
              {r.details}
            </Text>
            <Text style={[typography.small, styles.reply]}>
              {r.status === 'not_found'
                ? `Our team: ${r.staff_note ?? 'We couldn’t find a record of this yet.'}`
                : r.status === 'confirmed'
                  ? `Our team confirmed it${r.staff_note ? ` — ${r.staff_note}` : ''}`
                  : r.staff_note
                    ? `Our team: ${r.staff_note}`
                    : 'Our team is looking into it.'}
            </Text>
          </View>
        ))}
        <Text
          style={styles.link}
          onPress={() => router.push(`/properties/${propertyId}/report-dispute`)}
        >
          Heard about a dispute? Tell us
        </Text>
      </View>
    </ListGroup>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  inner: { paddingHorizontal: 14, paddingVertical: space.xs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  list: { gap: space.md },
  item: { gap: 3, borderLeftWidth: 3, borderLeftColor: accents.amber.fg, paddingLeft: 12 },
  resolved: { borderLeftColor: colors.border },
  report: { gap: 3, borderLeftWidth: 3, borderLeftColor: colors.border, paddingLeft: 12 },
  reply: { color: colors.text },
  link: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  pressed: { opacity: 0.7 },
});
