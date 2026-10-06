import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SUPPORT_EMAIL } from '@propittu/shared';
import { api } from '@/api/client';
import { useSession } from '@/auth/SessionProvider';
import { dialog } from '@/components/Dialog';
import { TextField } from '@/components/Field';
import { Footer } from '@/components/Footer';
import { Icon, type IconName } from '@/components/Icon';
import { Banner, Button, Card, IconTile } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { accents, colors, space, typography } from '@/theme';

const DELETED: { icon: IconName; text: string }[] = [
  { icon: 'home', text: 'All your properties and their details' },
  { icon: 'document', text: 'Documents, photos and videos' },
  { icon: 'requests', text: 'Service requests, visit reports and outcomes' },
  { icon: 'support', text: 'Support tickets and messages' },
  { icon: 'user', text: 'Your name and mobile number' },
];

/**
 * Delete account (App Store / Play Store requirement, DPDP right to
 * erasure): what goes, what stays, type DELETE, done.
 */
export default function DeleteAccountScreen() {
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
          <View style={styles.row}>
            <IconTile icon="warning" accent="coral" size={40} />
            <Text style={[typography.heading, styles.flex]}>This permanently deletes</Text>
          </View>
          {DELETED.map((d) => (
            <View key={d.text} style={styles.item}>
              <Icon name={d.icon} size={16} color={accents.coral.fg} />
              <Text style={[typography.body, styles.flex]}>{d.text}</Text>
            </View>
          ))}
        </Card>

        <Card style={styles.card}>
          <Text style={typography.bodyStrong}>What we keep</Text>
          <Text style={typography.small}>
            Payment records (what was bought, amount and date), as Indian tax law requires — no
            longer linked to your name or number. Any unused plan time is forfeited.
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
        <Text style={[typography.caption, styles.center]}>
          Changed your mind about something specific? Write to {SUPPORT_EMAIL} — we’re happy to
          help.
        </Text>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.xs },
  center: { textAlign: 'center', color: colors.textSubtle },
});
