import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, space } from '@/theme';

/**
 * Sticky bottom bar for a screen's primary action (§38 "Clear primary actions").
 * Every screen sits inside the tabs, and the tab bar already covers the
 * home-indicator area, so no extra safe-area padding is added here.
 */
export function Footer({ children }: { children: ReactNode }) {
  return <View style={styles.footer}>{children}</View>;
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
    gap: space.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
