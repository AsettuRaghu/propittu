import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LEGAL_LEVEL_LABELS, type LegalLevel } from '@propittu/shared';
import { useLegalChecks } from '@/api/ai';
import { PropertyContext } from '@/components/PropertyContext';
import { PullRefresh } from '@/components/PullRefresh';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Badge, Button, ListGroup, type Tone } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { accents, space, typography } from '@/theme';

const ORDER: LegalLevel[] = ['red', 'amber', 'green'];
const LEVEL_TONES: Record<LegalLevel, Tone> = {
  green: 'success',
  amber: 'warning',
  red: 'danger',
};
const LEVEL_COLOURS: Record<LegalLevel, string> = {
  green: accents.teal.fg,
  amber: accents.amber.fg,
  red: accents.coral.fg,
};

/**
 * Pittu Legal: the property records check our team shared — what the
 * Encumbrance Certificate shows against the sale deed. Same words as the
 * printed report (backoffice LegalReport); it reports what the records say,
 * never that a property is "safe".
 */
export default function PropertyLegalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending, error, refetch } = useLegalChecks(id);
  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  const c = data[0];
  if (!c) {
    return (
      <EmptyState
        icon="verified"
        accent="teal"
        title="No records check yet"
        message="Our team checks the Encumbrance Certificate against your sale deed and shares what the records show."
      />
    );
  }
  const findings = c.findings.filter((f) => f.review !== 'dismissed');
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<PullRefresh onRefresh={() => refetch()} />}
    >
      <PropertyContext propertyId={id} />

      <View style={styles.hero}>
        <Badge
          size="lg"
          tone={c.overall ? LEVEL_TONES[c.overall] : 'neutral'}
          label={c.overall ? LEGAL_LEVEL_LABELS[c.overall] : 'No findings'}
        />
        {c.summary ? <Text style={typography.body}>{c.summary}</Text> : null}
        {c.shared_at ? (
          <Text style={typography.caption}>Shared by our team on {formatDate(c.shared_at)}</Text>
        ) : null}
      </View>

      <ListGroup title="What we checked" plain>
        <Text style={[typography.small, styles.inner]}>
          The Encumbrance Certificate (EC) issued by {c.ec_office ?? 'the Sub-Registrar office'}
          {c.ec_period_from && c.ec_period_to
            ? ` for ${formatDate(c.ec_period_from)} to ${formatDate(c.ec_period_to)}`
            : ''}
          , read by Pittu and compared with your sale deed by our team.
        </Text>
      </ListGroup>

      {findings.length ? (
        <ListGroup title="What we found" plain>
          {ORDER.flatMap((level) =>
            findings
              .filter((f) => f.level === level)
              .map((f, i) => (
                <View
                  key={`${level}-${i}`}
                  style={[styles.finding, { borderLeftColor: LEVEL_COLOURS[level] }]}
                >
                  <Text style={typography.bodyStrong}>{f.title}</Text>
                  <Text style={typography.small}>{f.detail}</Text>
                  {f.staff_note ? (
                    <Text style={typography.small}>Our note: {f.staff_note}</Text>
                  ) : null}
                </View>
              )),
          )}
        </ListGroup>
      ) : null}

      <Button
        title="Ask us about this"
        icon="chat"
        variant="secondary"
        onPress={() =>
          router.push({
            pathname: '/support/new',
            params: { subject: 'About my property records check', propertyId: id },
          })
        }
      />

      <ListGroup title="What this report is, and isn’t" plain>
        <Text style={[typography.caption, styles.inner]}>
          This report shows what the official records we checked say, on the dates shown. It covers
          registered transactions on the EC for the period searched. It does not cover unregistered
          agreements, matters outside that period or office, court or revenue proceedings not
          recorded on the EC, or the physical state of the property. It is information to help you
          decide, not a legal opinion or a guarantee of title. For a formal title opinion, ask us
          about our legal partner.
        </Text>
      </ListGroup>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.xs, gap: space.xl, paddingBottom: space.xxl },
  hero: { gap: space.sm, alignItems: 'flex-start' },
  inner: { paddingHorizontal: 14, paddingVertical: space.xs },
  finding: {
    gap: 4,
    paddingVertical: space.xs,
    paddingLeft: 12,
    marginLeft: 14,
    borderLeftWidth: 3,
  },
});
