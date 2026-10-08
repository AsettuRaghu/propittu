import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { WATCH_CATEGORY_LABELS, type WatchItem } from '@propittu/shared';
import { usePropertyNews } from '@/api/ai';
import { Icon } from '@/components/Icon';
import { PropertyContext } from '@/components/PropertyContext';
import { PullRefresh } from '@/components/PullRefresh';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { formatDate } from '@/lib/format';
import { useMarkNewsSeen } from '@/lib/newsSeen';
import { colors, space, typography } from '@/theme';

/**
 * Pittu Watch: local news that may matter to the property — roads, metro,
 * water, flooding, schools — picked from local news by Pittu and checked by
 * our team. Each item says what it's about in a line and opens the source.
 */
export default function PropertyNewsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending, error, refetch } = usePropertyNews(id);
  const markSeen = useMarkNewsSeen();
  useEffect(() => {
    void markSeen(id);
  }, [id, markSeen]);

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  return (
    <FlatList
      data={data}
      keyExtractor={(n) => n.id}
      contentContainerStyle={styles.content}
      refreshControl={<PullRefresh onRefresh={() => refetch()} />}
      ListHeaderComponent={<PropertyContext propertyId={id} />}
      ItemSeparatorComponent={() => <View style={styles.divider} />}
      renderItem={({ item }) => <NewsRow item={item} />}
      ListEmptyComponent={
        <EmptyState
          icon="map"
          accent="sky"
          title="Nothing new around here"
          message="When there’s news about your area — roads, metro, water, new projects — you’ll see it here."
        />
      }
      ListFooterComponent={
        data.length ? (
          <Text style={[typography.caption, styles.footer]}>
            Picked from local news by Pittu and checked by our team. Tap a story to read it in full
            at the source.
          </Text>
        ) : null
      }
    />
  );
}

function NewsRow({ item: n }: { item: WatchItem }) {
  const when = n.published_at ? formatDate(n.published_at) : null;
  return (
    <Pressable
      onPress={() => void WebBrowser.openBrowserAsync(n.url)}
      accessibilityRole="link"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={typography.overline}>
        {[n.category ? WATCH_CATEGORY_LABELS[n.category] : null, n.place_name]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      <Text style={typography.bodyStrong}>{n.title}</Text>
      {n.summary ? <Text style={typography.small}>{n.summary}</Text> : null}
      <View style={styles.source}>
        <Text style={typography.caption}>{[n.domain, when].filter(Boolean).join(' · ')}</Text>
        <Icon name="external" size={12} color={colors.textSubtle} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.xs, gap: space.md, paddingBottom: space.xxl },
  row: { gap: 4, paddingVertical: space.sm },
  pressed: { opacity: 0.7 },
  source: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  footer: { marginTop: space.lg },
});
