import { useState } from 'react';
import { RefreshControl, type RefreshControlProps } from 'react-native';
import { colors } from '@/theme';

/**
 * Pull-to-refresh that spins only while the USER pulled. Background
 * refetches (returning to a screen, app foreground) keep the content on
 * screen silently — no spinner appearing at the top on its own.
 */
export function PullRefresh({
  onRefresh,
  ...rest
}: Omit<RefreshControlProps, 'refreshing' | 'onRefresh'> & { onRefresh: () => unknown }) {
  const [refreshing, setRefreshing] = useState(false);
  return (
    <RefreshControl
      {...rest}
      tintColor={colors.primary}
      colors={[colors.primary]}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void Promise.resolve(onRefresh())
          .catch(() => undefined)
          .finally(() => setRefreshing(false));
      }}
    />
  );
}
