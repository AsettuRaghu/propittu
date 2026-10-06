import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  formatIndianMobile,
  PLAN_STATUS_LABELS,
  STAFF_ROLE_LABELS,
  type Me,
} from '@propittu/shared';
import { PullRefresh } from '@/components/PullRefresh';
import { useMe } from '@/api/queries';
import { useSession } from '@/auth/SessionProvider';
import { dialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { ErrorState, LoadingState } from '@/components/States';
import { Badge, ListGroup, ListRow, type Tone } from '@/components/ui';
import { BUILD_LABEL } from '@/lib/buildInfo';
import { env } from '@/lib/env';
import { colors, radius, shadow, space, typography } from '@/theme';

function planBadge(me: Me): { label: string; tone: Tone } {
  const p = me.plan;
  if (p.status === 'trialing') return { label: `Trial · ${p.days_left ?? 0}d left`, tone: 'info' };
  if (p.status === 'active') return { label: p.plan_name ?? 'Active', tone: 'success' };
  if (p.status === 'cancelling') return { label: 'Ends soon', tone: 'warning' };
  return { label: PLAN_STATUS_LABELS[p.status], tone: 'danger' };
}

/** Profile (§25): account at a glance, and the four places people go from here. */
export default function ProfileScreen() {
  const { data: me, isPending, error, refetch } = useMe();
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
    await signOut();
  };

  if (isPending) return <LoadingState />;

  const initials =
    me?.full_name
      ?.trim()
      .split(/\s+/)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<PullRefresh onRefresh={() => refetch()} />}
      >
        <Text style={typography.display}>Profile</Text>

        {error || !me ? (
          <View style={styles.error}>
            <ErrorState error={error} onRetry={() => void refetch()} />
          </View>
        ) : (
          <>
            {/* Account */}
            <Pressable
              onPress={() => router.push('/profile-edit')}
              accessibilityRole="button"
              style={({ pressed }) => [styles.account, shadow, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.avatar}>
                {initials ? (
                  <Text style={styles.avatarText}>{initials}</Text>
                ) : (
                  <Icon name="user" size={22} color={colors.primary} />
                )}
              </View>
              <View style={styles.flex}>
                <Text style={typography.heading} numberOfLines={1}>
                  {me.full_name ?? 'Add your name'}
                </Text>
                <View style={styles.phoneRow}>
                  <Text style={typography.small}>{formatIndianMobile(me.phone)}</Text>
                  <Icon name="verified" size={13} color={colors.success} />
                </View>
                <Text style={styles.editLink}>
                  {me.staff_role ? `${STAFF_ROLE_LABELS[me.staff_role]} · ` : 'Property owner · '}
                  Edit profile
                </Text>
              </View>
              <Icon name="chevron" size={18} color={colors.textSubtle} />
            </Pressable>

            <ListGroup>
              <ListRow
                icon="plan"
                accent="violet"
                title="Plan & Usage"
                subtitle="Usage, benefits, payments and receipts"
                right={<Badge {...planBadge(me)} />}
                onPress={() => router.push('/plan')}
              />
              <ListRow
                icon="requests"
                accent="coral"
                title="Service Requests"
                subtitle={`${me.service_request_count} in total · track status and history`}
                onPress={() => router.push('/requests')}
              />
              <ListRow
                icon="support"
                accent="teal"
                title="Help & Support"
                subtitle="Call, email or raise a ticket"
                onPress={() => router.push('/support')}
              />
              {me.staff_role ? (
                <ListRow
                  icon="staff"
                  accent="slate"
                  title="Backoffice"
                  subtitle="Requests, tickets, customers, payments"
                  onPress={() => router.push('/backoffice')}
                />
              ) : null}
            </ListGroup>
          </>
        )}

        <ListGroup>
          <ListRow
            icon="shield"
            title="Privacy policy"
            onPress={() => void WebBrowser.openBrowserAsync(`${env.apiUrl}/legal/privacy`)}
          />
          <ListRow
            icon="document"
            title="Terms of use"
            onPress={() => void WebBrowser.openBrowserAsync(`${env.apiUrl}/legal/terms`)}
          />
        </ListGroup>

        <ListGroup>
          <ListRow
            icon="logout"
            title={signingOut ? 'Logging out…' : 'Log out'}
            destructive
            showChevron={false}
            onPress={() => void confirmLogout()}
          />
          {me && !me.staff_role ? (
            <ListRow
              icon="delete"
              title="Delete account"
              destructive
              onPress={() => router.push('/account-delete')}
            />
          ) : null}
        </ListGroup>

        <Text style={[typography.caption, styles.version]}>
          Propittu {Constants.expoConfig?.version ?? ''} · {BUILD_LABEL}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  content: { padding: space.lg, paddingTop: space.md, gap: space.md, paddingBottom: space.xxl },
  error: { minHeight: 240 },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.primary, fontSize: 17, fontWeight: '800' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  editLink: { fontSize: 12, fontWeight: '700', color: colors.primary, marginTop: 3 },
  version: { textAlign: 'center', marginTop: space.sm },
});
