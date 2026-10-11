import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { AREA_BASIS_LABELS, type AreaBasis } from '@propittu/shared';
import { useProject } from '@/api/ai';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Button, ListGroup, ListRow } from '@/components/ui';
import { formatDate, rupeesShort } from '@/lib/format';
import { accents, colors, font, space, typography } from '@/theme';

/**
 * The property's project on Propittu: every owner there makes it better for
 * the rest — alerts our team confirmed reach all of them, and sales owners
 * share (anonymously) sharpen everyone's value. Invite neighbours.
 */
export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending, error, refetch } = useProject(id);
  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) {
    return (
      <EmptyState
        icon="building"
        title="No project on the deed"
        message="When your sale deed names a project or layout, you’ll see everyone in it here."
      />
    );
  }
  const others = data.owners - 1;
  const invite = () =>
    void Share.share({
      message: `I use Propittu to look after my home in ${data.project_name} — documents in one place, records checks, the property's value, and alerts for everyone in the project. Worth a look: search for Propittu.`,
    });
  const active = data.alerts.filter((a) => a.status === 'active');

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={typography.display}>{data.project_name}</Text>
        <Text style={styles.count}>
          {others > 0
            ? `You and ${others} other owner${others === 1 ? '' : 's'} here use Propittu`
            : 'You’re the first owner here on Propittu'}
        </Text>
        <Text style={typography.small}>
          The more owners in the project, the better it works for everyone: alerts our team confirms
          reach all of you, and each sale shared sharpens every home’s value.
        </Text>
        <Button title="Invite owners in your building" icon="users" onPress={invite} />
      </View>

      <ListGroup title="Alerts for the project" plain>
        {active.length ? (
          active.map((a) => (
            <ListRow
              key={a.id}
              icon="warning"
              accent="coral"
              title={a.summary}
              subtitle={`Confirmed by our team · ${formatDate(a.updated_at)}`}
              subtitleLines={3}
              onPress={() => router.push(`/properties/${id}/legal`)}
            />
          ))
        ) : (
          <Text style={[typography.small, styles.inner]}>
            None. If our team confirms a dispute or notice for the project, every owner here sees
            it.
          </Text>
        )}
      </ListGroup>

      <ListGroup title="Sales owners shared" plain>
        {data.sales.length ? (
          data.sales.map((s, i) => (
            <View key={i} style={[styles.inner, styles.sale]}>
              <Text style={typography.bodyStrong}>{rupeesShort(s.price_inr)}</Text>
              <Text style={typography.small}>
                {`${s.area_sqft.toLocaleString('en-IN')} sq ft ${AREA_BASIS_LABELS[s.area_basis as AreaBasis]?.toLowerCase() ?? ''} · ₹${Math.round(
                  s.price_inr / s.area_sqft,
                ).toLocaleString('en-IN')}/sq ft · ${s.sold_on}`}
              </Text>
            </View>
          ))
        ) : (
          <Text style={[typography.small, styles.inner]}>
            None yet. Know a recent sale here? Add it under What it’s worth — without your name or
            flat number.
          </Text>
        )}
      </ListGroup>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.xs, gap: space.xl, paddingBottom: space.xxl },
  hero: { gap: space.sm, alignItems: 'flex-start' },
  count: { fontSize: font(16), fontWeight: '700', color: accents.teal.fg },
  inner: { paddingHorizontal: 14, paddingVertical: space.xs },
  sale: {
    gap: 2,
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
    marginLeft: 14,
    paddingLeft: 12,
  },
});
