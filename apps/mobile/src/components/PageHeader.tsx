import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, font, space, typography } from '@/theme';

/**
 * The top of a section page (Plan & Usage, Help & Support): a large title
 * with an optional badge, one line right beneath it, and the page's main
 * action on the right, vertically centred.
 */
export function PageHeader({
  title,
  badge,
  subtitle,
  action,
}: {
  title: string;
  badge?: ReactNode;
  /** A string, or rich text (e.g. a bold part); shown just under the title. */
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <Text style={typography.display} numberOfLines={1}>
            {title}
          </Text>
          {badge}
        </View>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

/** The emphasised part of a PageHeader subtitle. */
export function Strong({ children }: { children: ReactNode }) {
  return <Text style={styles.strong}>{children}</Text>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  wrap: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  subtitle: { fontSize: font(14), color: colors.textMuted, marginTop: 2 },
  strong: { fontWeight: '700', color: colors.text },
});
