import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { propertyCallName, type PittuState } from '@propittu/shared';
import { usePropertyValue } from '@/api/ai';
import { formatDate, rupeesShort } from '@/lib/format';
import { colors, space, typography } from '@/theme';
import { Icon } from './Icon';
import { TitleTimeline } from './TitleTimeline';
import { Button, KeyValue, ListGroup } from './ui';

/**
 * "Here's what I found": the moment after a property is added from its
 * deed. Pittu tells the owner back what the deed says — what and where it
 * is, who they bought it from, the land's story before them, the record
 * numbers — and what it's worth (the government value, and the market range
 * once Pittu has checked prices nearby). Then the quick questions.
 */
export function PittuFound({
  propertyId,
  state,
  onNext,
}: {
  propertyId: string;
  state: PittuState;
  onNext: () => void;
}) {
  const s = state.story!;
  const value = usePropertyValue(propertyId).data;
  const name = propertyCallName(state.context);
  const headline = name.charAt(0).toUpperCase() + name.slice(1);
  const where = [
    s.floor ? `${s.floor} floor` : null,
    s.block_or_tower ? `Block ${s.block_or_tower}` : null,
    value?.area_sqft ? `${Math.round(value.area_sqft).toLocaleString('en-IN')} sq ft` : null,
    s.village,
    s.city,
  ].filter(Boolean);
  const est = value?.estimate;
  const history = s.history.length >= 2 ? s.history : [];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.bubbleRow}>
        <View style={styles.avatar}>
          <Icon name="sparkles" size={16} color="#FFFFFF" strokeWidth={2.2} />
        </View>
        <Text style={[typography.body, styles.flex]}>
          I’ve read your deed. Here’s what I found.
        </Text>
      </View>

      <View style={styles.hero}>
        <Text style={typography.display}>{headline}</Text>
        {where.length ? <Text style={typography.small}>{where.join(' · ')}</Text> : null}
      </View>

      {s.sellers.length || s.bought_on || s.price_inr ? (
        <ListGroup title="You bought it" plain>
          <Text style={[typography.body, styles.inner]}>
            {[
              s.sellers.length ? `From ${s.sellers.join(', ')}` : null,
              s.bought_on ? `on ${formatDate(s.bought_on)}` : null,
              s.price_inr
                ? `for ${rupeesShort(s.price_inr)}${
                    value?.paid_per_sqft
                      ? ` (₹${Math.round(value.paid_per_sqft).toLocaleString('en-IN')} per sq ft)`
                      : ''
                  }`
                : null,
            ]
              .filter(Boolean)
              .join(' ')}
            .
          </Text>
        </ListGroup>
      ) : null}

      {history.length ? (
        <ListGroup title={`Its story · ${history.length} steps, as your deed tells it`} plain>
          <View style={styles.inner}>
            <TitleTimeline events={history} />
          </View>
        </ListGroup>
      ) : null}

      {value &&
      (value.government_value_inr || est?.status === 'working' || est?.status === 'ready') ? (
        <ListGroup title="What it’s worth" plain>
          <View style={[styles.inner, styles.facts]}>
            {est?.status === 'ready' && est.value_low && est.value_high ? (
              <KeyValue
                icon="rupee"
                label="Similar homes nearby sell for about"
                value={`${rupeesShort(est.value_low)} – ${rupeesShort(est.value_high)}`}
              />
            ) : est?.status === 'working' ? (
              <View style={styles.working}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={typography.small}>Checking prices nearby…</Text>
              </View>
            ) : null}
            <KeyValue
              icon="government"
              label="Government value today"
              value={value.government_value_inr ? rupeesShort(value.government_value_inr) : null}
            />
          </View>
        </ListGroup>
      ) : null}

      {s.survey_numbers.length || s.khata_number ? (
        <ListGroup title="On record" plain>
          <View style={[styles.inner, styles.facts]}>
            <KeyValue icon="tag" label="Survey number" value={s.survey_numbers.join(', ')} />
            <KeyValue icon="deed" label="Khata" value={s.khata_number} />
            <KeyValue icon="home" label="Developer" value={s.developer} />
          </View>
        </ListGroup>
      ) : null}

      <Text style={typography.caption}>
        All from your sale deed — saved to your property. Prices are a guide from listings and sales
        Pittu found online.
      </Text>
      <Button title="Next: a few quick taps" icon="arrow" onPress={onNext} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, paddingTop: space.xs, gap: space.xl, paddingBottom: space.xxl },
  bubbleRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: { gap: space.xs },
  inner: { paddingHorizontal: 14, paddingVertical: space.xs },
  facts: { gap: space.sm },
  working: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
