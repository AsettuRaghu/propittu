import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatIndianMobile, PLAN_STATUS_LABELS, STAFF_ROLE_LABELS } from '@propittu/shared';
import { useMe } from '@/api/queries';
import { useSession } from '@/auth/SessionProvider';
import { dialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { ErrorState, LoadingState } from '@/components/States';
import { GradientCard, ListGroup, ListRow } from '@/components/ui';
import { BUILD_LABEL } from '@/lib/buildInfo';
import { formatDate } from '@/lib/format';
import { colors, gradients, radius, space, typography } from '@/theme';

const SUPPORT_EMAIL = 'contact@propittu.com';

/** Profile (PRODUCT_SPEC.md §25): who you are, your plan, and everything account-related. */
export default function ProfileScreen() {
  const { data: me, isPending, error, refetch, isRefetching } = useMe();
  const { signOut } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  const confirmLogout = async () => {
    const ok = await dialog.confirm({
      title: 'Log out of Propittu?',
      message: 'You can log back in any time with your mobile number.',
      confirmLabel: 'Log out',
      tone: 'danger',
      icon: 'logout',
    });
    if (!ok) return;
    setSigningOut(true);
    await signOut(); // The session guard returns the user to Login.
  };

  if (isPending) return <LoadingState />;

  const initials =
    me?.full_name
      ?.split(' ')
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() ?? null;

  const planValue = me
    ? me.plan.status === 'trialing' || me.plan.status === 'active'
      ? me.plan.days_left !== null
        ? `${me.plan.days_left} days left`
        : PLAN_STATUS_LABELS[me.plan.status]
      : PLAN_STATUS_LABELS[me.plan.status]
    : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={typography.display}>Profile</Text>

        {error || !me ? (
          <View style={styles.error}>
            <ErrorState error={error} onRetry={() => void refetch()} />
          </View>
        ) : (
          <>
            {/* Identity */}
            <GradientCard colors={gradients.brand} style={styles.identity}>
              <View style={styles.idRow}>
                <View style={styles.avatar}>
                  {initials ? (
                    <Text style={styles.avatarText}>{initials}</Text>
                  ) : (
                    <Icon name="user" size={26} color="#FFFFFF" />
                  )}
                </View>
                <View style={styles.flex}>
                  <Text style={styles.name} numberOfLines={1}>
                    {me.full_name ?? 'Property owner'}
                  </Text>
                  <Text style={styles.phone}>{formatIndianMobile(me.phone)}</Text>
                </View>
                <View style={styles.role}>
                  <Text style={styles.roleText}>
                    {me.staff_role ? STAFF_ROLE_LABELS[me.staff_role] : 'Owner'}
                  </Text>
                </View>
              </View>
              <View style={styles.stats}>
                <Stat value={me.property_count} label="Properties" />
                <View style={styles.statDivider} />
                <Stat value={me.service_request_count} label="Requests" />
                <View style={styles.statDivider} />
                <Stat
                  value={formatDate(me.created_at).replace(/ \d{4}$/, '')}
                  label="Member since"
                />
              </View>
            </GradientCard>

            {/* Plan & account */}
            <ListGroup>
              <ListRow
                icon="plan"
                accent="violet"
                title={me.plan.plan_name ?? 'No active plan'}
                subtitle="Plan & usage"
                value={planValue}
                onPress={() => router.push('/plan')}
              />
              <ListRow
                icon="wallet"
                accent="sky"
                title="Payments"
                subtitle="History and receipts"
                onPress={() => router.push('/plan')}
              />
              <ListRow
                icon="requests"
                accent="coral"
                title="My service requests"
                subtitle={`${me.service_request_count} in total`}
                onPress={() => router.push('/requests')}
              />
            </ListGroup>

            <ListGroup>
              <ListRow
                icon="support"
                accent="teal"
                title="Help & support"
                subtitle={SUPPORT_EMAIL}
                onPress={() =>
                  void dialog.alert({
                    title: 'We are here to help',
                    message: `Write to ${SUPPORT_EMAIL} from your registered number and we'll get back to you within a working day.`,
                    icon: 'support',
                    buttonLabel: 'Got it',
                  })
                }
              />
              {me.staff_role ? (
                <ListRow
                  icon="staff"
                  accent="slate"
                  title="Backoffice"
                  subtitle="Requests, customers, payments"
                  onPress={() => router.push('/backoffice')}
                />
              ) : null}
            </ListGroup>
          </>
        )}

        {/* Logout stays available even if the profile failed to load. */}
        <ListGroup>
          <ListRow
            icon="logout"
            title={signingOut ? 'Logging out…' : 'Log out'}
            destructive
            showChevron={false}
            onPress={() => void confirmLogout()}
          />
        </ListGroup>

        <Text style={[typography.caption, styles.version]}>
          Propittu {Constants.expoConfig?.version ?? ''} · {BUILD_LABEL}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  content: { padding: space.lg, paddingTop: space.md, gap: space.lg, paddingBottom: space.xxl },
  error: { minHeight: 240 },
  identity: { gap: space.lg, padding: space.xl },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  name: { color: '#FFFFFF', fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  phone: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 2 },
  role: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 5,
  },
  roleText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.md,
    paddingVertical: space.md,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' },
  statDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.25)' },
  version: { textAlign: 'center', marginTop: space.sm },
});
