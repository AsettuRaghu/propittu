import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppNotification } from '@propittu/shared';
import { useInbox, useMarkRead } from '@/api/notifications';
import { PullRefresh } from '@/components/PullRefresh';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Banner, LinkButton } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { notificationsAllowed, turnOnNotifications } from '@/lib/push';
import { colors, font, space, typography } from '@/theme';

/**
 * Everything we told the owner, newest first: requests moving, team
 * replies, records checks, disputes, what Pittu read, news around the
 * property. Tapping one opens what it's about and marks it read.
 */
export default function NotificationsScreen() {
  const { data, isPending, error, refetch } = useInbox();
  const markRead = useMarkRead();
  const [asked, setAsked] = useState(true);
  useEffect(() => {
    void notificationsAllowed().then((on) => setAsked(on));
  }, []);
  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const open = (n: AppNotification) => {
    if (!n.read_at) markRead.mutate([n.id]);
    if (n.url) router.push(n.url as never);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () =>
            data.unread ? (
              <LinkButton title="Mark all read" onPress={() => markRead.mutate(undefined)} />
            ) : null,
        }}
      />
      <FlatList
        data={data.items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={data.items.length ? styles.list : styles.empty}
        refreshControl={<PullRefresh onRefresh={() => refetch()} />}
        ListHeaderComponent={
          asked ? null : (
            <Banner
              tone="info"
              icon="bell"
              message="Get these on your phone as they happen."
              action="Turn on notifications"
              onPress={() => {
                setAsked(true);
                void turnOnNotifications();
              }}
            />
          )
        }
        ItemSeparatorComponent={() => <View style={styles.divider} />}
        renderItem={({ item: n }) => (
          <Pressable
            onPress={() => open(n)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            {!n.read_at ? <View style={styles.dot} /> : <View style={styles.dotSpace} />}
            <View style={styles.flex}>
              <Text style={[typography.bodyStrong, n.read_at && styles.read]}>{n.title}</Text>
              {n.body ? (
                <Text style={typography.small} numberOfLines={3}>
                  {n.body}
                </Text>
              ) : null}
              <Text style={typography.caption}>{formatDateTime(n.created_at)}</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="bell"
            title="Nothing yet"
            message="We’ll tell you here when a request moves, our team replies, Pittu reads a document or there’s news around your property."
          />
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: space.lg, paddingTop: space.xs, gap: space.sm, paddingBottom: space.xxl },
  empty: { flexGrow: 1, padding: space.lg },
  row: { flexDirection: 'row', gap: space.md, paddingVertical: space.sm },
  pressed: { opacity: 0.7 },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 6, backgroundColor: colors.primary },
  dotSpace: { width: 9 },
  read: { fontWeight: '500', fontSize: font(15) },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
