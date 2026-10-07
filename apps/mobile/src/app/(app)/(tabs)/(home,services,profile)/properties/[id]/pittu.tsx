import * as DocumentPicker from 'expo-document-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  pittuQuestions,
  type PittuQuestion,
  type PittuState,
} from '@propittu/shared';
import { pittuKey, useAnswerPittu, usePittu } from '@/api/ai';
import { prepareDocument, uploadDocument } from '@/api/uploads';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/Icon';
import { PittuCarePlan } from '@/components/PittuCarePlan';
import { ErrorState, LoadingState } from '@/components/States';
import { Banner, Button } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { colors, font, radius, shadow, space, typography } from '@/theme';

/**
 * Pittu's quick questions after a property is added from its deed, then the
 * documents checklist and a care plan of Propittu services (each with its
 * reason). Every answer is saved as soon as it is tapped; anything can be
 * skipped. Rules: packages/shared/src/pittu.ts.
 */
export default function PittuScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pittu = usePittu(id);
  if (pittu.isPending) return <LoadingState />;
  if (pittu.error) return <ErrorState error={pittu.error} onRetry={() => void pittu.refetch()} />;
  return <Flow propertyId={id} state={pittu.data} />;
}

function Flow({ propertyId, state }: { propertyId: string; state: PittuState }) {
  const answer = useAnswerPittu(propertyId);
  const qc = useQueryClient();
  const [reply, setReply] = useState<string | null>(null);
  const [glossary, setGlossary] = useState(false);
  const [receiptStep, setReceiptStep] = useState<'ask' | 'done' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const questions = pittuQuestions(state.context, state.answers);
  const pending = questions.filter((q) => !state.answers[q.id]);
  const current = pending[0];
  const needsReceipt =
    state.answers.tax_paid === 'paid' &&
    !state.context.documents.includes('property_tax') &&
    receiptStep !== 'done';

  const pick = (q: PittuQuestion, value: string, text: string) => {
    setProblem(null);
    setGlossary(false);
    answer.mutate(
      { question: q.id, answer: value },
      {
        onSuccess: () => {
          setReply(text);
          if (q.id === 'tax_paid' && value === 'paid') setReceiptStep('ask');
        },
        onError: (err) => setProblem(errorMessage(err)),
      },
    );
  };

  const addReceipt = async () => {
    setProblem(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: [...ALLOWED_DOCUMENT_MIME_TYPES],
      copyToCacheDirectory: true,
      multiple: false,
    });
    const asset = picked.canceled ? undefined : picked.assets[0];
    if (!asset) return;
    setUploading(true);
    try {
      await uploadDocument(propertyId, 'property_tax', prepareDocument(asset, 'property_tax'));
      await qc.invalidateQueries({ queryKey: pittuKey(propertyId) });
      setReply('Got it — saved to Documents under Property Tax.');
      setReceiptStep('done');
    } catch (err) {
      setProblem(errorMessage(err, "Couldn't upload the receipt."));
    } finally {
      setUploading(false);
    }
  };

  if (current || needsReceipt) {
    const total = questions.length;
    const done = total - pending.length;
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: 'A few quick questions' }} />
        <View style={styles.progressRow}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round((done / total) * 100)}%` }]} />
          </View>
          <Text style={styles.count}>
            {Math.min(done + 1, total)} of {total}
          </Text>
        </View>

        <Bubble
          text={
            reply ?? 'Nice — your property is saved. A few taps so we can look after it properly.'
          }
        />

        {needsReceipt && !current ? (
          <>
            <View style={[styles.card, shadow]}>
              <Text style={styles.title}>Great! Add the receipt so we can track it.</Text>
              <Text style={typography.small}>
                We save it in Documents and keep an eye on the next due date.
              </Text>
            </View>
            {problem ? <Banner message={problem} /> : null}
            <Button
              title={uploading ? 'Uploading…' : 'Upload tax receipt'}
              icon="upload"
              onPress={() => void addReceipt()}
              loading={uploading}
            />
            <Button
              title="I’ll add it later"
              variant="ghost"
              onPress={() => setReceiptStep('done')}
            />
          </>
        ) : current ? (
          <>
            <View style={[styles.card, shadow]}>
              <Text style={styles.title}>{current.title}</Text>
              <Text style={typography.small}>{current.why}</Text>
              {current.glossary ? (
                <>
                  <Pressable onPress={() => setGlossary((g) => !g)} style={styles.chip}>
                    <Text style={styles.chipText}>
                      {glossary ? 'Hide' : current.glossary.label}
                    </Text>
                  </Pressable>
                  {glossary ? (
                    <View style={styles.glossary}>
                      <Text style={typography.small}>{current.glossary.text}</Text>
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>
            {problem ? <Banner message={problem} /> : null}
            <View style={styles.options}>
              {current.options.map((o) => (
                <Pressable
                  key={o.value}
                  onPress={() => pick(current, o.value, o.reply)}
                  disabled={answer.isPending}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.option,
                    (pressed || answer.isPending) && { opacity: 0.7 },
                  ]}
                >
                  <Text style={typography.bodyStrong}>{o.label}</Text>
                  <Icon name="chevron" size={16} color={colors.textSubtle} />
                </Pressable>
              ))}
            </View>
            <Button
              title="Skip for now"
              variant="ghost"
              onPress={() =>
                pick(
                  current,
                  'skipped',
                  'Skipped — you can answer that later from the property page.',
                )
              }
            />
          </>
        ) : null}
      </ScrollView>
    );
  }

  return <PittuCarePlan propertyId={propertyId} state={state} reply={reply} />;
}

function Bubble({ text }: { text: string }) {
  return (
    <View style={styles.bubbleRow}>
      <View style={styles.avatar}>
        <Icon name="home" size={16} color="#FFFFFF" strokeWidth={2.2} />
      </View>
      <View style={styles.bubble}>
        <Text style={typography.body}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space.lg,
    gap: space.sm,
  },
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center' },
  content: { padding: space.lg, paddingTop: space.xs, gap: space.md, paddingBottom: space.xxl },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  count: { fontSize: font(12), fontWeight: '700', color: colors.textMuted },
  bubbleRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 9,
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
  },
  title: {
    fontSize: font(20),
    fontWeight: '800',
    color: colors.text,
    lineHeight: font(26),
    letterSpacing: -0.3,
  },
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    marginTop: space.xs,
  },
  chipText: { fontSize: font(13), fontWeight: '700', color: colors.primary },
  glossary: { backgroundColor: colors.background, borderRadius: radius.md, padding: space.md },
  options: { gap: space.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: 15,
  },
});
