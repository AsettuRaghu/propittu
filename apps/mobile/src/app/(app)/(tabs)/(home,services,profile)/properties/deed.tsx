import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatFileSize, MAX_LONG_DOCUMENT_BYTES } from '@propittu/shared';
import { createDraftProperty, startAnalysis } from '@/api/ai';
import { api } from '@/api/client';
import { prepareDocument, uploadDocument } from '@/api/uploads';
import { Icon, type IconName } from '@/components/Icon';
import { Banner, Button, ProgressBar } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { colors, gradients, radius, shadow, space, typography } from '@/theme';

type Phase =
  | { kind: 'idle' }
  | { kind: 'preparing' }
  | { kind: 'uploading'; progress: number }
  | { kind: 'starting' };

const PERKS: { icon: IconName; text: string }[] = [
  { icon: 'sparkles', text: 'Details filled in for you — no long forms' },
  { icon: 'shield', text: 'Stored privately, only you and Propittu can open it' },
  { icon: 'clock', text: 'Usually under a minute' },
];

/**
 * Add property with a Sale Deed (Pittu). Creates a draft property, uploads
 * the deed against it, starts the reading and moves on to the reading /
 * review screen. A failed upload removes the draft — nothing half-made stays.
 */
export default function DeedUploadScreen() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [problem, setProblem] = useState<string | null>(null);
  const busy = phase.kind !== 'idle';

  const choose = async () => {
    setProblem(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    const asset = picked.canceled ? undefined : picked.assets[0];
    if (!asset) return;

    let file;
    try {
      file = prepareDocument(asset, 'sale_deed');
    } catch (err) {
      setProblem(errorMessage(err));
      return;
    }

    setPhase({ kind: 'preparing' });
    let propertyId: string | null = null;
    try {
      propertyId = (await createDraftProperty()).id;
      setPhase({ kind: 'uploading', progress: 0 });
      const doc = await uploadDocument(propertyId, 'sale_deed', file, (progress) =>
        setPhase({ kind: 'uploading', progress }),
      );
      setPhase({ kind: 'starting' });
      await startAnalysis(doc.id).catch(() => undefined); // the next screen retries
      router.replace({
        pathname: '/properties/[id]/setup',
        params: { id: propertyId, doc: doc.id },
      });
    } catch (err) {
      if (propertyId)
        await api<void>(`/properties/${propertyId}`, { method: 'DELETE' }).catch(() => undefined);
      setPhase({ kind: 'idle' });
      setProblem(errorMessage(err, "Couldn't upload the deed. Please try again."));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ headerBackVisible: !busy, gestureEnabled: !busy }} />
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroIcon}>
          <Icon name="document" size={30} color="#FFFFFF" strokeWidth={1.8} />
        </View>
        <Text style={styles.heroTitle}>Upload your Sale Deed</Text>
        <Text style={styles.heroText}>
          Pittu reads it and sets up your property for you. You check the details before anything is
          saved.
        </Text>
      </LinearGradient>

      <View style={[styles.card, shadow]}>
        {PERKS.map((p) => (
          <View key={p.text} style={styles.perk}>
            <Icon name={p.icon} size={16} color={colors.primary} />
            <Text style={[typography.body, styles.flex]}>{p.text}</Text>
          </View>
        ))}
      </View>

      {problem ? <Banner message={problem} /> : null}

      {phase.kind === 'uploading' ? (
        <View style={styles.progress}>
          <Text style={typography.small}>
            Uploading securely… {Math.round(phase.progress * 100)}%
          </Text>
          <ProgressBar progress={phase.progress} />
        </View>
      ) : null}

      <Button
        title={
          phase.kind === 'preparing'
            ? 'Getting ready…'
            : phase.kind === 'starting'
              ? 'Handing it to Pittu…'
              : busy
                ? 'Uploading…'
                : 'Choose sale deed (PDF)'
        }
        icon="upload"
        onPress={() => void choose()}
        loading={busy}
      />
      <Text style={[typography.caption, styles.center]}>
        PDF up to {formatFileSize(MAX_LONG_DOCUMENT_BYTES)}. Prefer to type it in?{' '}
        <Text
          style={styles.link}
          onPress={() => !busy && router.replace('/properties/new?manual=1')}
        >
          Enter details myself
        </Text>
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, paddingTop: space.xs, gap: space.lg, paddingBottom: space.xxl },
  hero: { borderRadius: radius.xl, padding: space.xl, gap: space.sm },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.4 },
  heroText: { fontSize: 15, lineHeight: 21, color: 'rgba(255,255,255,0.92)' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  perk: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  progress: { gap: space.xs },
  center: { textAlign: 'center' },
  link: { color: colors.primary, fontWeight: '700' },
});
