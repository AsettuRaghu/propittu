import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatFileSize, MAX_LONG_DOCUMENT_BYTES } from '@propittu/shared';
import { createDraftProperty, startAnalysis } from '@/api/ai';
import { api } from '@/api/client';
import { prepareDocument, uploadDocument } from '@/api/uploads';
import { errorMessage } from '@/lib/errors';
import { accents, colors, radius, shadow, space, typography } from '@/theme';
import { Icon, type IconName } from './Icon';
import { Banner, Button, ProgressBar } from './ui';

type Phase = { kind: 'idle' } | { kind: 'uploading'; progress: number } | { kind: 'handing' };

/**
 * The first screen of Add property when Pittu is available: one card, two
 * equal choices. Choosing the deed opens the file picker straight away and
 * uploads right here — no second page. A failed upload removes the draft.
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
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.pittu}>
        <View style={styles.avatar}>
          <Icon name="home" size={18} color="#FFFFFF" strokeWidth={2.2} />
        </View>
        <View style={styles.bubble}>
          <Text style={styles.bubbleTitle}>Let’s add your property</Text>
          <Text style={typography.body}>
            Hand me the sale deed and I’ll do the reading and the typing. Or fill it in yourself —
            your call.
          </Text>
        </View>
      </View>

      <View style={[styles.group, shadow]}>
        <Option
          icon="document"
          accent="indigo"
          title="Upload the sale deed"
          subtitle="Pittu fills in the details for you · about a minute"
          tag="Recommended"
          onPress={() => void uploadDeed()}
          disabled={busy}
        />
        <View style={styles.divider} />
        <Option
          icon="edit"
          accent="slate"
          title="Fill it in myself"
          subtitle="Type the details · you can add the deed later"
          onPress={onManual}
          disabled={busy}
        />
      </View>

      {phase.kind === 'uploading' ? (
        <View style={styles.progress}>
          <Text style={typography.small}>
            Uploading your deed securely… {Math.round(phase.progress * 100)}%
          </Text>
          <ProgressBar progress={phase.progress} />
        </View>
      ) : phase.kind === 'handing' ? (
        <Text style={[typography.small, styles.center]}>Handing it to Pittu…</Text>
      ) : null}
      {problem ? <Banner message={problem} /> : null}

      <View style={styles.privacy}>
        <Icon name="lock" size={13} color={colors.textSubtle} />
        <Text style={typography.caption}>
          PDF up to {formatFileSize(MAX_LONG_DOCUMENT_BYTES)} · stored privately · you check
          everything before it’s saved
        </Text>
      </View>
    </ScrollView>
  );
}

function Option({
  icon,
  accent,
  title,
  subtitle,
  tag,
  onPress,
  disabled,
}: {
  icon: IconName;
  accent: 'indigo' | 'slate';
  title: string;
  subtitle: string;
  tag?: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const a = accents[accent];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.option, (pressed || disabled) && { opacity: 0.7 }]}
    >
      <View style={[styles.optionIcon, { backgroundColor: a.bg }]}>
        <Icon name={icon} size={22} color={a.fg} />
      </View>
      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <Text style={typography.heading}>{title}</Text>
          {tag ? <Text style={styles.tag}>{tag}</Text> : null}
        </View>
        <Text style={typography.small}>{subtitle}</Text>
      </View>
      <Icon name="chevron" size={18} color={colors.textSubtle} />
    </Pressable>
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
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center' },
  content: { padding: space.lg, paddingTop: space.sm, gap: space.lg, paddingBottom: space.xxl },
  pittu: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderTopLeftRadius: 4,
    padding: space.md,
    gap: 4,
  },
  bubbleTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 72 },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  tag: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  progress: { gap: space.xs },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  limit: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.xl,
    alignItems: 'center',
    gap: space.md,
  },
});
