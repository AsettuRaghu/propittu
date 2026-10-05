import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '@/lib/errors';
import { colors, space, typography } from '@/theme';
import { Button } from './ui';

/*
 * PRODUCT_SPEC.md §40: "Every asynchronous operation should have a
 * loading state, success state and error state." These three cover every
 * screen that loads data.
 */

export function LoadingState({ label }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityLabel={label ?? 'Loading'}>
      <ActivityIndicator size="large" color={colors.primary} />
      {label ? <Text style={typography.small}>{label}</Text> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={40} color={colors.textSubtle} />
      <Text style={[typography.heading, styles.text]}>Couldn&apos;t load this</Text>
      <Text style={[typography.small, styles.text]}>{errorMessage(error)}</Text>
      {onRetry ? (
        <Button title="Try again" variant="secondary" onPress={onRetry} style={styles.action} />
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.center}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={32} color={colors.primary} />
      </View>
      <Text style={[typography.heading, styles.text]}>{title}</Text>
      {message ? <Text style={[typography.small, styles.text]}>{message}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    gap: space.sm,
  },
  text: { textAlign: 'center' },
  action: { marginTop: space.md, alignSelf: 'stretch' },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
});
