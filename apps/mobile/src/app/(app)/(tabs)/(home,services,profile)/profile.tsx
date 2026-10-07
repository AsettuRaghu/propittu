import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  formatIndianMobile,
  PLAN_STATUS_LABELS,
  updateProfileSchema,
  type Me,
} from '@propittu/shared';
import { useMe } from '@/api/queries';
import { useUpdateProfile } from '@/api/support';
import { useSession } from '@/auth/SessionProvider';
import { dialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { InlineEdit } from '@/components/InlineEdit';
import { PullRefresh } from '@/components/PullRefresh';
import { ErrorState, LoadingState } from '@/components/States';
import { Badge, LinkButton, ListGroup, ListRow, type Tone } from '@/components/ui';
import { env } from '@/lib/env';
import { colors, space, typography } from '@/theme';

function planBadge(me: Me): { label: string; tone: Tone } {
  const p = me.plan;
  if (p.status === 'trialing') return { label: `Trial · ${p.days_left ?? 0}d left`, tone: 'info' };
  if (p.status === 'active') return { label: p.plan_name ?? 'Active', tone: 'success' };
  if (p.status === 'cancelling') return { label: 'Ends soon', tone: 'warning' };
  return { label: PLAN_STATUS_LABELS[p.status], tone: 'danger' };
}

const openLegal = (page: 'privacy' | 'terms') =>
  void WebBrowser.openBrowserAsync(`${env.apiUrl}/legal/${page}`);

/**
 * Profile (§25): plain sections — My profile (name edited in place, the
 * verified number, plan), Company (help and legal), Log out. Account
 * deletion is a quiet link at the very end (store requirement).
 */
export default function ProfileScreen() {
  const { data: me, isPending, error, refetch } = useMe();
  const updateProfile = useUpdateProfile();
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<PullRefresh onRefresh={() => refetch()} />}
      >
        <Text style={typography.display}>Profile</Text>

        {error || !me ? (
          <View style={styles.error}>
            <ErrorState error={error} onRetry={() => void refetch()} />
          </View>
        ) : (
          <ListGroup title="My profile" plain>
            <InlineEdit
              icon="user"
              label="Name"
              value={me.full_name}
              placeholder="Add your name"
              validate={(v) => {
                const r = updateProfileSchema.safeParse({ full_name: v });
                return r.success ? null : (r.error.issues[0]?.message ?? 'Check the name');
              }}
              onSave={(full_name) => updateProfile.mutateAsync({ full_name })}
              inputProps={{ autoCapitalize: 'words', autoComplete: 'name', maxLength: 120 }}
            />
            <ListRow
              icon="phone"
              title={formatIndianMobile(me.phone)}
              subtitle="Verified · used to log in"
              right={<Icon name="verified" size={16} color={colors.success} />}
            />
            <ListRow
              icon="plan"
              accent="violet"
              title="Plan & Usage"
              right={<Badge {...planBadge(me)} />}
              onPress={() => router.push('/plan')}
            />
            {me.staff_role ? (
              <ListRow
                icon="staff"
                accent="slate"
                title="Backoffice"
                onPress={() => router.push('/backoffice')}
              />
            ) : null}
          </ListGroup>
        )}

        <ListGroup title="Company" plain>
          <ListRow
            icon="support"
            accent="teal"
            title="Help & Support"
            onPress={() => router.push('/support')}
          />
          <ListRow icon="shield" title="Privacy policy" onPress={() => openLegal('privacy')} />
          <ListRow icon="document" title="Terms of use" onPress={() => openLegal('terms')} />
        </ListGroup>

        <ListGroup plain>
          <ListRow
            icon="logout"
            title={signingOut ? 'Logging out…' : 'Log out'}
            destructive
            showChevron={false}
            onPress={() => void confirmLogout()}
          />
        </ListGroup>

        <View style={styles.footer}>
          <Text style={typography.caption}>
            Propittu v{Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
          {me && !me.staff_role ? (
            <LinkButton
              title="Delete account"
              tone="muted"
              onPress={() => router.push('/account-delete')}
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.lg, paddingTop: space.md, gap: space.xl, paddingBottom: space.xxl },
  error: { minHeight: 240 },
  footer: { alignItems: 'center', gap: space.sm, marginTop: space.md },
});
