import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { RATE_UNIT_LABELS, VALUE_KIND_LABELS, type PropertyValue } from '@propittu/shared';
import { usePropertyValue } from '@/api/ai';
import { PropertyContext } from '@/components/PropertyContext';
import { PullRefresh } from '@/components/PullRefresh';
import { ErrorState, LoadingState } from '@/components/States';
import { KeyValue, ListGroup } from '@/components/ui';
import { formatDate, rupees } from '@/lib/format';
import { colors, font, space, typography } from '@/theme';

const MATCHED_ON: Record<NonNullable<PropertyValue['rate']>['matched_on'], string> = {
  survey_number: 'by its survey number',
  locality: 'by its area',
  pincode: 'by its PIN code',
};

/**
 * Pittu Value: the GOVERNMENT value of the property (its area × the
 * published guidance / market rate), next to what the owner paid. Never
 * presented as what it would sell for.
 */
export default function PropertyValueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: v, isPending, error, refetch } = usePropertyValue(id);
  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  const r = v.rate;
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<PullRefresh onRefresh={() => refetch()} />}
    >
      <PropertyContext propertyId={id} />

      <View style={styles.hero}>
        <Text style={typography.caption}>Government value today</Text>
        <Text style={styles.amount}>
          {v.government_value_inr !== null ? rupees(v.government_value_inr) : 'Not known yet'}
        </Text>
        <Text style={typography.small}>
          {v.government_value_inr !== null
            ? 'Your area × the rate the government has set for it. It’s used for stamp duty and registration — it isn’t what the property would sell for today.'
            : 'We need a little more before we can work it out:'}
        </Text>
        {v.government_value_inr === null
          ? v.missing.map((m) => (
              <Text key={m} style={typography.small}>
                • {m}
              </Text>
            ))
          : null}
      </View>

      <ListGroup title="How it’s worked out" plain>
        <View style={styles.facts}>
          <KeyValue
            icon="rupee"
            label="You paid"
            value={
              v.paid_inr !== null
                ? [
                    rupees(v.paid_inr),
                    v.purchase_date ? `in ${formatDate(v.purchase_date)}` : null,
                    v.paid_per_sqft ? `· ${rupees(v.paid_per_sqft)} per sq ft` : null,
                  ]
                    .filter(Boolean)
                    .join(' ')
                : 'Not added yet'
            }
          />
          <KeyValue
            icon="area"
            label="Area"
            value={
              v.area_sqft !== null
                ? `${Math.round(v.area_sqft).toLocaleString('en-IN')} sq ft`
                : 'Not added yet'
            }
          />
          {r ? (
            <>
              <KeyValue
                icon="government"
                label="Government rate"
                value={
                  `${rupees(r.rate_inr)} ${RATE_UNIT_LABELS[r.unit]}` +
                  (r.unit !== 'sqft' ? ` (${rupees(r.per_sqft)} per sq ft)` : '') +
                  ` · ${VALUE_KIND_LABELS[r.kind]}`
                }
              />
              <KeyValue
                icon="pin"
                label="Rate for"
                value={[r.locality, r.office].filter(Boolean).join(' · ')}
              />
              <KeyValue
                icon="calendar"
                label="In force from"
                value={r.effective_from ? formatDate(r.effective_from) : null}
              />
            </>
          ) : null}
        </View>
      </ListGroup>

      <Text style={typography.caption}>
        {r ? `We matched your property to this rate ${MATCHED_ON[r.matched_on]}. ` : ''}
        Rates come from the government’s published lists and are checked by our team. They change
        from time to time, so treat this as a guide.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.xs, gap: space.xl, paddingBottom: space.xxl },
  hero: { gap: space.xs },
  amount: { fontSize: font(32), fontWeight: '800', color: colors.text, letterSpacing: -0.6 },
  facts: { paddingHorizontal: 14, paddingVertical: space.xs, gap: space.sm },
});
