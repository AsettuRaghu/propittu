import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import { useMe } from '@/api/queries';
import { useSession } from '@/auth/SessionProvider';
import { dialog } from '@/components/Dialog';
import { TextField } from '@/components/Field';
import { Footer } from '@/components/Footer';
import { Icon, type IconName } from '@/components/Icon';
import { LoadingState } from '@/components/States';
import { Banner, Button, ListGroup, ListRow } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { accents, space, typography } from '@/theme';

const PHRASE = 'DELETE MY ACCOUNT';

/**
 * Delete account (App Store / Play Store requirement, DPDP right to
 * erasure), on one calm page: what THIS account would lose, two ways out
 * (talk to us, log out), then type the phrase and confirm in a dialog.
 */
export default function DeleteAccountScreen() {
  const { data: me, isPending } = useMe();
  const { signOut } = useSession();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (isPending || !me) return <LoadingState />;

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const daysLeft = me.plan.days_left ?? 0;
  const losses: { icon: IconName; text: string }[] = [
    {
      icon: 'home',
      text: me.property_count
        ? `${plural(me.property_count, 'property', 'properties')}, with every document, photo and video`
        : 'Your account and everything in it',
    },
    ...(me.plan.plan_name && daysLeft > 0
      ? [
          {
            icon: 'plan' as const,
            text: `Your ${me.plan.plan_name} — ${plural(daysLeft, 'day', 'days')} left, not refundable`,
          },
        ]
      : []),
    ...(me.service_request_count > 0
      ? [
          {
            icon: 'requests' as const,
            text: `${plural(me.service_request_count, 'service request', 'service requests')} and their reports`,
          },
        ]
      : []),
  ];

  const remove = async () => {
    const ok = await dialog.confirm({
      title: 'Delete your account for good?',
      message: 'Everything above is removed straight away and can’t be brought back.',
      confirmLabel: 'Delete account',
      cancelLabel: 'Keep my account',
      tone: 'danger',
      icon: 'delete',
    });
    if (!ok) return;
    setBusy(true);
    setProblem(null);
    try {
      await api<void>('/me/delete', { method: 'POST', body: { confirm: 'DELETE' } });
      await dialog.alert({
        title: 'Account deleted',
        message: 'Your data has been removed. Thank you for trying Propittu.',
        icon: 'success',
      });
      await signOut();
    } catch (err) {
      setProblem(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View>
          <ListGroup title="Deleting your account removes" plain>
            {losses.map((l) => (
              <View key={l.text} style={styles.point}>
                <Icon name={l.icon} size={16} color={accents.coral.fg} />
                <Text style={[typography.body, styles.flex]}>{l.text}</Text>
              </View>
            ))}
          </ListGroup>
          <Text style={[typography.caption, styles.note]}>
            Payment records are kept as tax law requires, no longer linked to you.
          </Text>
        </View>

        <ListGroup title="Something not working?" plain>
          <ListRow
            icon="support"
            accent="teal"
            title="Talk to us first"
            subtitle="Most things can be fixed without losing your records"
            onPress={() => router.replace('/support')}
          />
        </ListGroup>

        {problem ? <Banner message={problem} /> : null}
        <ListGroup title="Confirm" plain>
          <View style={styles.field}>
            <TextField
              label={`Type ${PHRASE}`}
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!busy}
            />
          </View>
        </ListGroup>
      </ScrollView>
      <Footer>
        <Button
          title="Delete account"
          variant="danger"
          icon="delete"
          onPress={() => void remove()}
          disabled={typed.trim().toUpperCase().replace(/\s+/g, ' ') !== PHRASE}
          loading={busy}
        />
      </Footer>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  content: { padding: space.lg, paddingTop: space.md, gap: space.xl, paddingBottom: space.xxl },
  point: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  note: { marginTop: space.sm, marginLeft: space.md },
  field: { paddingHorizontal: 14, paddingVertical: space.xs },
});
