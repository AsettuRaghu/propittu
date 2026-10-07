import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { PlanStatus } from '@propittu/shared';
import { ApiError } from '@/api/client';
import { errorMessage } from '@/lib/errors';
import { colors, space, typography, type Accent } from '@/theme';
import type { IconName } from './Icon';
import { Button, IconTile } from './ui';

/*
 * PRODUCT_SPEC.md §40: "Every asynchronous operation should have a
 * loading state, success state and error state." These cover every screen
 * that loads data, plus the Limited Access state (no active plan).
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
  if (error instanceof ApiError && error.code === 'LIMITED_ACCESS') return <LimitedAccessState />;
  return (
    <View style={styles.center}>
      <IconTile icon="error" accent="coral" size={64} />
      <Text style={[typography.heading, styles.text]}>Couldn&apos;t load this</Text>
      <Text style={[typography.small, styles.text]}>{errorMessage(error)}</Text>
      {onRetry ? (
        <Button
          title="Try again"
          icon="refresh"
          variant="secondary"
          onPress={onRetry}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
  accent = 'indigo',
}: {
  icon: IconName;
  title: string;
  message?: string;
  action?: ReactNode;
  accent?: Accent;
}) {
  return (
    <View style={styles.center}>
      <IconTile icon={icon} accent={accent} size={72} />
      <Text style={[typography.title, styles.text]}>{title}</Text>
      {message ? (
        <Text style={[typography.small, styles.text, styles.message]}>{message}</Text>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

/**
 * Limited Access (M6, strict): shown in place of property and service
 * screens when the Trial or Plan has ended. Data is kept, never deleted.
 */
export function LimitedAccessState({ status }: { status?: PlanStatus }) {
  return (
    <EmptyState
      icon="lock"
      accent="violet"
      title={status === 'expired' ? 'Your plan has ended' : 'Choose a plan to continue'}
      message="Your properties, documents and photos are safe. Pick a plan to pick up right where you left off."
      action={<Button title="See plans" icon="plan" onPress={() => router.push('/plan')} />}
    />
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
  message: { maxWidth: 300 },
  action: { marginTop: space.md, alignSelf: 'stretch' },
});
