import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatIndianMobile, PLAN_STATUS_LABELS, STAFF_ROLE_LABELS } from '@propittu/shared';
import { useMe } from '@/api/queries';
import { useSession } from '@/auth/SessionProvider';
import { ErrorState, LoadingState } from '@/components/States';
import { Button, Card, KeyValue } from '@/components/ui';
import { BUILD_LABEL } from '@/lib/buildInfo';
import { colors, space, typography } from '@/theme';

/** Profile (PRODUCT_SPEC.md §25). Name is optional and not edited in V1. */
export default function ProfileScreen() {
  const { data: me, isPending, error, refetch, isRefetching } = useMe();
  const { signOut } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  const confirmLogout = () => {
    Alert.alert('Log out of Propittu?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          await signOut(); // The session guard returns the user to Login.
        },
      },
    ]);
  };

  if (isPending) return <LoadingState />;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          tintColor={colors.primary}
        />
      }
    >
      {error ? (
        <View style={styles.error}>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </View>
      ) : (
        <Card style={styles.card}>
          {me.full_name ? <KeyValue label="Name" value={me.full_name} /> : null}
          <KeyValue label="Mobile Number" value={formatIndianMobile(me.phone)} />
          <KeyValue label="Properties" value={String(me.property_count)} />
          <KeyValue label="Service Requests" value={String(me.service_request_count)} />
          {me.staff_role ? (
            <KeyValue label="Staff Role" value={STAFF_ROLE_LABELS[me.staff_role]} />
          ) : null}
        </Card>
      )}

      {me ? (
        <Card style={styles.card} onPress={() => router.push('/plan')}>
          <KeyValue
            label="Plan"
            value={`${me.plan.plan_name ?? 'No active plan'} · ${PLAN_STATUS_LABELS[me.plan.status]}`}
          />
          <Text style={[typography.small, styles.link]}>View plan & usage ›</Text>
        </Card>
      ) : null}

      {me?.staff_role ? (
        <Button
          title="Open Backoffice"
          icon="briefcase-outline"
          variant="secondary"
          onPress={() => router.push('/backoffice')}
        />
      ) : null}

      {/* Logout stays available even if the profile failed to load. */}
      <Button
        title="Logout"
        variant="danger"
        icon="log-out-outline"
        onPress={confirmLogout}
        loading={signingOut}
      />

      <Text style={[typography.caption, styles.version]}>
        Propittu {Constants.expoConfig?.version ?? ''} · {BUILD_LABEL}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xl },
  card: { gap: space.lg },
  error: { minHeight: 240 },
  version: { textAlign: 'center' },
  link: { color: colors.primary, fontWeight: '600' },
});
