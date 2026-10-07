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
import { Banner, Button, Card, LinkButton } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { accents, space, typography } from '@/theme';

/**
 * Delete account (App Store / Play Store requirement, DPDP right to
 * erasure). Deliberately two calm steps, never hidden or blocked:
 *   1. Before you go — what THIS account would lose, and two ways out
 *      (talk to us, or just log out).
 *   2. Confirm — what goes and what the law makes us keep; type DELETE.
 */
export default function DeleteAccountScreen() {
  const [step, setStep] = useState<'before' | 'confirm'>('before');
  return step === 'before' ? <BeforeYouGo onContinue={() => setStep('confirm')} /> : <Confirm />;
}

function Point({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.point}>
      <Icon name={icon} size={16} color={accents.coral.fg} />
      <Text style={[typography.body, styles.flex]}>{text}</Text>
    </View>
  );
}

function BeforeYouGo({ onContinue }: { onContinue: () => void }) {
  const { data: me, isPending } = useMe();
  const { signOut } = useSession();
  if (isPending || !me) return <LoadingState />;

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const daysLeft = me.plan.days_left ?? 0;
  const losses: { icon: IconName; text: string }[] = [
    ...(me.property_count > 0
      ? [
          {
            icon: 'home' as const,
            text: `${plural(me.property_count, 'property', 'properties')}, with every document, photo and video`,
          },
        ]
      : []),
    ...(me.plan.plan_name && daysLeft > 0
      ? [
          {
            icon: 'plan' as const,
            text: `Your ${me.plan.plan_name} — ${plural(daysLeft, 'day', 'days')} left, which can't be refunded`,
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

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={typography.title}>Before you go</Text>
      {losses.length > 0 ? (
        <Card style={styles.card}>
          <Text style={typography.bodyStrong}>Deleting your account removes</Text>
          {losses.map((l) => (
            <Point key={l.text} {...l} />
          ))}
          <Text style={typography.small}>
            This can’t be undone — we can’t bring any of it back.
          </Text>
        </Card>
      ) : null}

      <Card style={styles.card}>
        <Text style={typography.bodyStrong}>Something not working for you?</Text>
        <Text style={typography.small}>
          Tell us what went wrong — most things can be fixed without losing your records.
        </Text>
        <Button
          title="Talk to us"
          icon="support"
          onPress={() =>
            router.replace({
              pathname: '/support/new',
              params: { category: 'account', subject: 'Before I delete my account' },
            })
          }
        />
        <Button title="Just log out" variant="secondary" onPress={() => void signOut()} />
      </Card>

      <View style={styles.center}>
        <LinkButton title="Continue to delete" tone="danger" onPress={onContinue} />
      </View>
    </ScrollView>
  );
}

const DELETED: { icon: IconName; text: string }[] = [
  { icon: 'home', text: 'All your properties and their details' },
  { icon: 'document', text: 'Documents, photos and videos' },
  { icon: 'requests', text: 'Service requests, visit reports and outcomes' },
  { icon: 'support', text: 'Support tickets and messages' },
  { icon: 'user', text: 'Your name and mobile number' },
];

function Confirm() {
  const { signOut } = useSession();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ready = confirm.trim().toUpperCase() === 'DELETE';

  const remove = async () => {
    const ok = await dialog.confirm({
      title: 'Delete your account now?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete for good',
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
        <Card style={styles.card}>
          <Text style={typography.heading}>This permanently deletes</Text>
          {DELETED.map((d) => (
            <Point key={d.text} {...d} />
          ))}
        </Card>
        <Card style={styles.card}>
          <Text style={typography.bodyStrong}>What we keep</Text>
          <Text style={typography.small}>
            Payment records (what was bought, amount and date), as Indian tax law requires — no
            longer linked to your name or number.
          </Text>
        </Card>
        {problem ? <Banner message={problem} /> : null}
        <TextField
          label="Type DELETE to confirm"
          value={confirm}
          onChangeText={setConfirm}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!busy}
        />
      </ScrollView>
      <Footer>
        <Button
          title="Delete my account"
          variant="danger"
          icon="delete"
          onPress={() => void remove()}
          disabled={!ready}
          loading={busy}
        />
      </Footer>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  content: { padding: space.lg, paddingTop: space.xs, gap: space.lg, paddingBottom: space.xxl },
  card: { gap: space.md },
  point: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  center: { alignItems: 'center', paddingTop: space.sm },
});
