import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  RATE_UNIT_LABELS,
  VALUE_KIND_LABELS,
  type MarketEstimate,
  type PropertyValue,
} from '@propittu/shared';
import { usePropertyValue } from '@/api/ai';
import { PropertyContext } from '@/components/PropertyContext';
import { PullRefresh } from '@/components/PullRefresh';
import { ErrorState, LoadingState } from '@/components/States';
import { KeyValue, ListGroup } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { formatDate, rupees, rupeesShort } from '@/lib/format';
import { colors, font, space, typography } from '@/theme';

const MATCHED_ON: Record<NonNullable<PropertyValue['rate']>['matched_on'], string> = {
  survey_number: 'by its survey number',
  locality: 'by its area',
  pincode: 'by its PIN code',
};

/**
 * Pittu Value: what similar homes nearby sell for (Pittu's market range,
 * shown only when enough real prices agree), then the GOVERNMENT value
 * (area × the published rate) and what the owner paid.
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

      <Market estimate={v.estimate ?? null} />

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
  flex: { flex: 1 },
  range: { fontSize: font(22), fontWeight: '800', color: colors.text },
  working: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  source: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  pressed: { opacity: 0.7 },
});

/** Pittu's market range: what similar properties nearby sell or are listed for, with its pages. */
function Market({ estimate: e }: { estimate: MarketEstimate | null }) {
  if (!e || e.status === 'failed') return null;
  if (e.status === 'working') {
    return (
      <View style={styles.working}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={typography.small}>Pittu is checking what similar homes sell for nearby…</Text>
      </View>
    );
  }
  if (e.status !== 'ready' || !e.per_sqft_low || !e.per_sqft_high) {
    return (
      <Text style={typography.small}>
        Pittu couldn’t find enough recent prices nearby to give a range yet. It checks again every
        few months.
      </Text>
    );
  }
  return (
    <ListGroup title="What similar homes sell for" plain>
      <View style={styles.facts}>
        <Text style={styles.range}>
          {e.value_low && e.value_high
            ? `${rupeesShort(e.value_low)} – ${rupeesShort(e.value_high)}`
            : `${rupees(e.per_sqft_low)} – ${rupees(e.per_sqft_high)} per sq ft`}
        </Text>
        <Text style={typography.small}>
          {`${rupees(e.per_sqft_low)} – ${rupees(e.per_sqft_high)} per sq ft, from ${e.comparables.length} recent prices${
            e.comparables.some((c) => c.same_project) ? ' in the same project' : ' nearby'
          }. Asking prices are often a little above what homes finally sell for.`}
        </Text>
        {e.comparables.slice(0, 6).map((c) => (
          <Pressable
            key={c.url}
            onPress={() => void WebBrowser.openBrowserAsync(c.url)}
            accessibilityRole="link"
            style={({ pressed }) => [styles.source, pressed && styles.pressed]}
          >
            <Text style={[typography.small, styles.flex]} numberOfLines={1}>
              {`${rupees(c.per_sqft)}/sq ft · ${c.title}`}
            </Text>
            <Text style={typography.caption}>{hostOf(c.url)}</Text>
            <Icon name="external" size={12} color={colors.textSubtle} />
          </Pressable>
        ))}
      </View>
    </ListGroup>
  );
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
