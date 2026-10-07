import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatFileSize, MAX_LONG_DOCUMENT_BYTES } from '@propittu/shared';
import { createDraftProperty, startAnalysis, useDraftProperties } from '@/api/ai';
import { api } from '@/api/client';
import { prepareDocument, uploadDocument } from '@/api/uploads';
import { errorMessage } from '@/lib/errors';
import { accents, colors, font, gradients, radius, shadow, space, typography } from '@/theme';
import { DeedArt } from './DeedArt';
import { DraftRow } from './DraftRow';
import { Icon } from './Icon';
import { Banner, Button, ListGroup, ListRow, ProgressBar } from './ui';

/** Unfinished deed set-ups kept at once (matches the server). */
const MAX_UNFINISHED = 2;

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
  const drafts = useDraftProperties();

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

  const waiting = (drafts.data ?? []).filter((d) => d.document_id || d.status);
  const full = (drafts.data?.length ?? 0) >= MAX_UNFINISHED;

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          title: '',
          headerStyle: { backgroundColor: gradients.brand[0] },
          headerTintColor: '#FFFFFF',
          headerShadowVisible: false,
        }}
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <LinearGradient
          colors={[gradients.brand[0], gradients.brand[1], '#8E4FE8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.6, y: 1 }}
          style={styles.top}
        >
          <View style={[styles.glow, styles.glowA]} />
          <View style={[styles.glow, styles.glowB]} />
          <DeedArt />
          <View style={styles.pill}>
            <Icon name="sparkles" size={13} color="#FFFFFF" />
            <Text style={styles.pillText}>Recommended · about a minute</Text>
          </View>
          <Text style={styles.title}>Let Pittu fill it in for you</Text>
          <Text style={styles.text}>
            Upload your sale deed — Pittu reads it and fills in the details. You just check and
            save.
          </Text>
          {phase.kind === 'uploading' ? (
            <View style={styles.progress}>
              <Text style={styles.note}>
                Uploading securely… {Math.round(phase.progress * 100)}%
              </Text>
              <ProgressBar progress={phase.progress} />
            </View>
          ) : phase.kind === 'handing' ? (
            <Text style={styles.note}>Handing it to Pittu…</Text>
          ) : (
            <Button
              title="Upload sale deed"
              icon="upload"
              variant="secondary"
              onPress={() => void uploadDeed()}
              disabled={full}
            />
          )}
          {problem ? <Banner message={problem} /> : null}
          <View style={styles.privacy}>
            <Icon name="lock" size={12} color="rgba(255,255,255,0.8)" />
            <Text style={styles.note}>
              {full
                ? 'Finish or remove an unfinished property below first'
                : `PDF up to ${formatFileSize(MAX_LONG_DOCUMENT_BYTES)} · stored privately`}
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.bottom}>
          {waiting.length > 0 ? (
            <ListGroup title={`Unfinished · ${waiting.length} of ${MAX_UNFINISHED}`} plain>
              {waiting.map((d) => (
                <DraftRow key={d.id} draft={d} />
              ))}
            </ListGroup>
          ) : null}
          <ListGroup title="Manual entry" plain>
            <ListRow
              icon="edit"
              accent="slate"
              title="Fill in the details yourself"
              subtitle="A couple of minutes · add the deed later"
              onPress={busy ? undefined : onManual}
            />
          </ListGroup>
        </View>
      </ScrollView>
    </View>
  );
}

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
  flex: { flex: 1, backgroundColor: colors.background },
  center: { textAlign: 'center' },
  content: { padding: space.lg, paddingTop: space.sm, gap: space.xl, paddingBottom: space.xxl },
  scroll: { flexGrow: 1 },
  top: {
    alignItems: 'center',
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.xxl,
    gap: space.md,
    overflow: 'hidden',
  },
  glow: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  glowA: { width: 320, height: 320, top: -140, right: -120 },
  glowB: { width: 240, height: 240, bottom: -110, left: -90 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  pillText: { fontSize: font(12.5), fontWeight: '700', color: '#FFFFFF' },
  title: {
    fontSize: font(28),
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  text: {
    fontSize: font(15.5),
    lineHeight: font(22),
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: space.sm,
  },
  note: { fontSize: font(12.5), color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  progress: { gap: space.xs, alignSelf: 'stretch' },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bottom: { padding: space.lg, paddingTop: space.xl, gap: space.xl, paddingBottom: space.xxl },
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
