import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatFileSize, MAX_LONG_DOCUMENT_BYTES } from '@propittu/shared';
import { createDraftProperty, startAnalysis } from '@/api/ai';
import { api } from '@/api/client';
import { prepareDocument, uploadDocument } from '@/api/uploads';
import { errorMessage } from '@/lib/errors';
import {
  accents,
  colors,
  font,
  gradients,
  radius,
  shadow,
  space,
  typography,
  type Accent,
} from '@/theme';
import { Icon, type IconName } from './Icon';
import { Banner, Button, ListGroup, ListRow, ProgressBar } from './ui';

type Phase = { kind: 'idle' } | { kind: 'uploading'; progress: number } | { kind: 'handing' };

/**
 * The first screen of Add property when Pittu is available: a bold invite
 * to hand over the sale deed (what Pittu picks up, listed below it), and a
 * quiet way to type it in instead. The deed uploads right here — no second
 * page. A failed upload removes the draft.
 */
export function AddPropertyChoice({ onManual }: { onManual: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [problem, setProblem] = useState<string | null>(null);
  const busy = phase.kind !== 'idle';

  const uploadDeed = async () => {
    if (busy) return;
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

    setPhase({ kind: 'uploading', progress: 0 });
    let propertyId: string | null = null;
    try {
      propertyId = (await createDraftProperty()).id;
      const doc = await uploadDocument(propertyId, 'sale_deed', file, (progress) =>
        setPhase({ kind: 'uploading', progress }),
      );
      setPhase({ kind: 'handing' });
      await startAnalysis(doc.id).catch(() => undefined); // the next screen retries
      router.replace({
        pathname: '/properties/[id]/setup',
        params: { id: propertyId, doc: doc.id },
      });
    } catch (err) {
      if (propertyId) {
        await api<void>(`/properties/${propertyId}`, { method: 'DELETE' }).catch(() => undefined);
      }
      setPhase({ kind: 'idle' });
      setProblem(errorMessage(err, "Couldn't upload the deed. Please try again."));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, shadow]}
      >
        <View style={styles.heroIcon}>
          <Icon name="deed" size={30} color="#FFFFFF" strokeWidth={1.8} />
          <View style={styles.spark}>
            <Icon name="sparkles" size={13} color={accents.amber.fg} strokeWidth={2.6} />
          </View>
        </View>
        <Text style={styles.heroTitle}>Upload your sale deed — we’ll do the rest</Text>
        <Text style={styles.heroText}>
          Pittu reads it and fills in the type, address, size and survey numbers. You just check and
          save.
        </Text>
        {phase.kind === 'uploading' ? (
          <View style={styles.progress}>
            <Text style={styles.heroNote}>
              Uploading securely… {Math.round(phase.progress * 100)}%
            </Text>
            <ProgressBar progress={phase.progress} />
          </View>
        ) : phase.kind === 'handing' ? (
          <Text style={styles.heroNote}>Handing it to Pittu…</Text>
        ) : (
          <Button
            title="Upload sale deed"
            icon="attach"
            variant="secondary"
            onPress={() => void uploadDeed()}
          />
        )}
        <View style={styles.privacy}>
          <Icon name="lock" size={12} color="rgba(255,255,255,0.8)" />
          <Text style={styles.heroNote}>
            PDF up to {formatFileSize(MAX_LONG_DOCUMENT_BYTES)} · stored privately
          </Text>
        </View>
      </LinearGradient>

      {problem ? <Banner message={problem} /> : null}

      <ListGroup title="What Pittu picks up" plain>
        {PICKS.map((p) => (
          <ListRow
            key={p.title}
            icon={p.icon}
            accent={p.accent}
            title={p.title}
            subtitle={p.text}
          />
        ))}
      </ListGroup>

      <ListGroup title="No deed at hand?" plain>
        <ListRow
          icon="edit"
          accent="slate"
          title="Fill it in myself"
          subtitle="Takes a couple of minutes · add the deed later"
          onPress={busy ? undefined : onManual}
        />
      </ListGroup>
    </ScrollView>
  );
}

const PICKS: { icon: IconName; accent: Accent; title: string; text: string }[] = [
  {
    icon: 'home',
    accent: 'indigo',
    title: 'What and where',
    text: 'Type, address, village, district',
  },
  {
    icon: 'area',
    accent: 'teal',
    title: 'Size and land records',
    text: 'Area, survey and Khata numbers',
  },
  {
    icon: 'receipt',
    accent: 'amber',
    title: 'The registration',
    text: 'Number, date, buyers, sale price',
  },
];

/** Shown instead of both choices when this term's property slots are all used. */
export function PropertyLimitReached({
  limit,
  planName,
  usedBy,
  renewsOn,
}: {
  limit: number;
  planName: string;
  /** Names using the slots (incl. deleted ones still counted this term). */
  usedBy: string[];
  renewsOn: string | null;
}) {
  const names =
    usedBy.length <= 2
      ? usedBy.join(' and ')
      : `${usedBy.slice(0, 2).join(', ')} and ${usedBy.length - 2} more`;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={[styles.limit, shadow]}>
        <View style={[styles.optionIcon, { backgroundColor: accents.violet.bg }]}>
          <Icon name="gem" size={22} color={accents.violet.fg} />
        </View>
        <Text style={typography.title}>Room for one more?</Text>
        <Text style={[typography.body, styles.center]}>
          Your {planName} plan covers {limit} {limit === 1 ? 'property' : 'properties'} this term
          {names ? `, used by ${names}` : ''}. Upgrade to add more
          {renewsOn ? `, or add one after your plan renews on ${renewsOn}` : ''}.
        </Text>
        <Button title="See plans" onPress={() => router.push('/plan')} />
        <Button
          title="Contact us"
          variant="ghost"
          icon="support"
          onPress={() =>
            router.push({
              pathname: '/support/new',
              params: { category: 'property', subject: 'Replace a property / property sold' },
            })
          }
        />
        <Text style={[typography.caption, styles.center]}>
          Sold a property or added one by mistake? Tell us and we’ll take a look.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  content: { padding: space.lg, paddingTop: space.sm, gap: space.xl, paddingBottom: space.xxl },
  hero: { borderRadius: radius.lg, padding: space.xl, gap: space.md },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spark: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: accents.amber.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: font(26), fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  heroText: { fontSize: font(15), lineHeight: font(21), color: 'rgba(255,255,255,0.9)' },
  heroNote: { fontSize: font(12.5), color: 'rgba(255,255,255,0.85)' },
  progress: { gap: space.xs },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  limit: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.xl,
    alignItems: 'center',
    gap: space.md,
  },
});
