import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatIndianMobile, updateProfileSchema } from '@propittu/shared';
import { useMe } from '@/api/queries';
import { useUpdateProfile } from '@/api/support';
import { InlineEdit } from '@/components/InlineEdit';
import { PullRefresh } from '@/components/PullRefresh';
import { ErrorState, LoadingState } from '@/components/States';
import { Badge, LinkButton, ListGroup, ListRow } from '@/components/ui';
import { env } from '@/lib/env';
import { planBadge } from '@/lib/planBadge';
import { useLogout } from '@/lib/useLogout';
import { colors, space, typography } from '@/theme';

const openLegal = (page: 'privacy' | 'terms') =>
  void WebBrowser.openBrowserAsync(`${env.apiUrl}/legal/${page}`);

/**
 * Profile (§25), flat and calm: My profile (name edited in place, the
 * verified number, plan), Company (help and legal), then Log out and a
 * quiet Delete account link at the very end (store requirement).
 */
export default function ProfileScreen() {
  const { data: me, isPending, error, refetch } = useMe();
  const updateProfile = useUpdateProfile();
  const { signingOut, logout } = useLogout();

  if (isPending) return <LoadingState />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        refreshControl={<PullRefresh onRefresh={() => refetch()} />}
      >
        {error || !me ? (
          <View style={styles.error}>
            <ErrorState error={error} onRetry={() => void refetch()} />
          </View>
        ) : (
          <ListGroup title="My profile" plain>
            <InlineEdit
              icon="user"
              label="Name"
              hideLabel
              value={me.full_name}
              placeholder="Add your name"
              validate={(v) => {
                const r = updateProfileSchema.safeParse({ full_name: v });
                return r.success ? null : (r.error.issues[0]?.message ?? 'Check the name');
              }}
              onSave={(full_name) => updateProfile.mutateAsync({ full_name })}
              inputProps={{ autoCapitalize: 'words', autoComplete: 'name', maxLength: 120 }}
              badge={me.full_name ? undefined : <Badge label="Incomplete" tone="warning" />}
            />
            <ListRow icon="phone" title={formatIndianMobile(me.phone)} />
            <ListRow
              icon="plan"
              accent="violet"
              title="Plan & Usage"
              right={
                <Badge
                  {...planBadge({
                    status: me.plan.status,
                    planName: me.plan.plan_name,
                    accountActive: me.account.status === 'active',
                  })}
                />
              }
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

        <View style={styles.footer}>
          <View style={styles.logout}>
            <ListGroup plain>
              <ListRow
                icon="logout"
                title={signingOut ? 'Logging out…' : 'Log out'}
                destructive
                showChevron={false}
                onPress={() => void logout()}
              />
            </ListGroup>
          </View>
          {me && !me.staff_role ? (
            <LinkButton
              title="Delete account"
              tone="muted"
              onPress={() => router.push('/account-delete')}
            />
          ) : null}
          <Text style={typography.caption}>
            Propittu v{Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.lg, paddingTop: space.md, gap: space.xl, paddingBottom: space.xxl },
  error: { minHeight: 240 },
  footer: { alignItems: 'center', gap: space.md, marginTop: space.xl },
  logout: { alignSelf: 'stretch' },
});
