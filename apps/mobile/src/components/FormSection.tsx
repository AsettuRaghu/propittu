import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { space, typography } from '@/theme';

/**
 * A form section in the flat style: a heading (and optional line), with the
 * fields indented beneath it like list entries.
 */
export function FormSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View>
        <Text style={typography.heading}>{title}</Text>
        {subtitle ? <Text style={typography.small}>{subtitle}</Text> : null}
      </View>
      <View style={styles.fields}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  // Fields sit 12 pt in from their heading, like list entries.
  fields: { gap: space.lg, paddingLeft: space.md },
});
