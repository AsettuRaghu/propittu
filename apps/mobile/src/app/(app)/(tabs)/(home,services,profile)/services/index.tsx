import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  REACH_PROBLEM_LABELS,
  reachProblem,
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
  type CatalogueService,
} from '@propittu/shared';
import { useMe, useProperties, useServices } from '@/api/queries';
import { PageHeader } from '@/components/PageHeader';
import { PullRefresh } from '@/components/PullRefresh';
import { ServiceRequestList } from '@/components/ServiceRequestList';
import { ServiceRow } from '@/components/ServiceRow';
import { ErrorState, LimitedAccessState, LoadingState } from '@/components/States';
import { Button, ListGroup, ListRow, Segmented } from '@/components/ui';
import { serviceVisual } from '@/lib/icons';
import { colors, space } from '@/theme';

type Segment = 'browse' | 'requests';

const book = (service: CatalogueService) =>
  router.push({ pathname: '/services/request', params: { serviceId: service.id } });

/**
 * Services tab, flat like Profile: a header with Browse · My requests.
 * Browse shows what the plan already includes (only while some is left),
 * then every other service by category, each one row: what it is, a short
 * line, and its price.
 */
export default function ServicesScreen() {
  // Other screens can open My requests directly (?tab=requests).
  const { tab, at } = useLocalSearchParams<{ tab?: string; at?: string }>();
  const [segment, setSegment] = useState<Segment>(tab === 'requests' ? 'requests' : 'browse');
  // Opened again from elsewhere (openServicesTab) while already mounted: follow it.
  const [seen, setSeen] = useState(at);
  if (at !== seen) {
    setSeen(at);
    setSegment(tab === 'requests' ? 'requests' : 'browse');
  }
  const me = useMe();
  const limited = me.data?.plan.access === 'limited';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <PageHeader title="Services" />
        {!limited ? (
          <Segmented
            variant="text"
            options={[
              { value: 'browse', label: 'Browse' },
              { value: 'requests', label: 'My requests' },
            ]}
            value={segment}
            onChange={setSegment}
          />
        ) : null}
      </View>
      {limited ? (
        <LimitedAccessState status={me.data?.plan.status} />
      ) : segment === 'browse' ? (
        <Catalogue />
      ) : (
        <ServiceRequestList />
      )}
    </SafeAreaView>
  );
}

function Catalogue() {
  const services = useServices();
  const properties = useProperties();
  if (services.isPending || properties.isPending) return <LoadingState />;
  if (services.error) {
    return <ErrorState error={services.error} onRetry={() => void services.refetch()} />;
  }

  // Muted when NONE of the customer's properties can get it (by PIN / state).
  const list = properties.data ?? [];
  const outOfReach = (s: CatalogueService) =>
    list.length > 0 && list.every((p) => reachProblem(s, p.reach) !== null);
  const included = services.data.filter(
    (s) => s.coverage === 'included' && (s.included_remaining ?? 0) > 0,
  );
  const rest = services.data.filter((s) => !included.includes(s));

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <PullRefresh onRefresh={() => Promise.all([services.refetch(), properties.refetch()])} />
      }
    >
      {included.length > 0 ? (
        <ListGroup title="Included in your plan" plain>
          {included.map((s) => (
            <ListRow
              key={s.id}
              {...serviceVisual(s.code, s.category)}
              title={s.name}
              subtitle={
                outOfReach(s)
                  ? REACH_PROBLEM_LABELS.not_in_area
                  : `${s.included_remaining} left this year`
              }
              right={<Button title="Book" size="sm" onPress={() => book(s)} />}
            />
          ))}
        </ListGroup>
      ) : null}

      {SERVICE_CATEGORIES.map((category) => {
        const items = rest.filter((s) => s.category === category);
        if (items.length === 0) return null;
        return (
          <ListGroup key={category} title={SERVICE_CATEGORY_LABELS[category]} plain>
            {items.map((s) => (
              <ServiceRow
                key={s.id}
                service={s}
                note={outOfReach(s) ? REACH_PROBLEM_LABELS.not_in_area : null}
                onPress={() => book(s)}
              />
            ))}
          </ListGroup>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md },
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl },
});
