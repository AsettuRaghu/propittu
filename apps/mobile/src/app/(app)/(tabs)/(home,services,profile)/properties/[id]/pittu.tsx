import * as DocumentPicker from 'expo-document-picker';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  carePlan,
  documentChecklist,
  pittuQuestions,
  type CareItem,
  type PittuQuestion,
  type PittuState,
} from '@propittu/shared';
import { pittuKey, useAnswerPittu, usePittu } from '@/api/ai';
import { api } from '@/api/client';
import { useProperty, useServices } from '@/api/queries';
import { prepareDocument, uploadDocument } from '@/api/uploads';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { ErrorState, LoadingState } from '@/components/States';
import { Banner, Button } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { accents, colors, radius, shadow, space, typography } from '@/theme';

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

  return <Summary propertyId={propertyId} state={state} reply={reply} />;
}

function Summary({
  propertyId,
  state,
  reply,
}: {
  propertyId: string;
  state: PittuState;
  reply: string | null;
}) {
  const property = useProperty(propertyId);
  const services = useServices();
  const plan = carePlan(state.context, state.answers);
  const checklist = documentChecklist(state.context);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const chosen = plan.filter((p) => !off[p.service_code]);

  const send = async () => {
    setSending(true);
    setProblem(null);
    let sent = 0;
    for (const item of chosen) {
      const service = (services.data ?? []).find((s) => s.code === item.service_code);
      if (!service || service.coverage === 'unavailable') continue;
      try {
        await api('/service-requests', {
          method: 'POST',
          body: {
            property_id: propertyId,
            service_id: service.id,
            description: `${item.title} — suggested by Pittu. ${item.because}.`,
            preferred_date: null,
          },
        });
        sent++;
      } catch (err) {
        setProblem(errorMessage(err, `Couldn't request ${item.title}.`));
      }
    }
    setSending(false);
    toast(sent ? `${sent} service${sent === 1 ? '' : 's'} requested` : 'Property saved');
    router.replace(`/properties/${propertyId}`);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'All set' }} />
      <Bubble text={reply ?? 'All done! Here’s what we know, and how we can help.'} />

      <View style={[styles.card, shadow, styles.row]}>
        <View style={[styles.ring, { borderColor: accents.teal.fg }]}>
          <Text style={styles.ringText}>{property.data?.completion.percent ?? '—'}%</Text>
        </View>
        <View style={styles.flex}>
          <Text style={typography.heading} numberOfLines={1}>
            {property.data?.name ?? 'Your property'}
          </Text>
          <Text style={typography.small}>Property profile</Text>
        </View>
      </View>

      <Text style={styles.overline}>DOCUMENTS</Text>
      <View style={[styles.card, shadow, styles.tight]}>
        {checklist.map((d, i) => (
          <Pressable
            key={d.document_type}
            disabled={d.have}
            onPress={() =>
              router.push({
                pathname: '/properties/[id]/add-document',
                params: { id: propertyId, type: d.document_type },
              })
            }
            style={[styles.docRow, i > 0 && styles.border]}
          >
            <View
              style={[
                styles.docIcon,
                { backgroundColor: d.have ? accents.teal.bg : accents.amber.bg },
              ]}
            >
              <Icon
                name={d.have ? 'check' : 'add'}
                size={14}
                strokeWidth={3}
                color={d.have ? accents.teal.fg : accents.amber.fg}
              />
            </View>
            <View style={styles.flex}>
              <Text style={typography.bodyStrong}>{d.label}</Text>
              <Text style={typography.caption}>{d.hint}</Text>
            </View>
            {!d.have ? <Text style={styles.upload}>Upload</Text> : null}
          </Pressable>
        ))}
      </View>

      {plan.length ? (
        <>
          <Text style={styles.overline}>PITTU’S CARE PLAN</Text>
          <Text style={typography.small}>
            Based on your answers. Untick anything you don’t need.
          </Text>
          {plan.map((p) => (
            <CareCard
              key={p.service_code}
              item={p}
              on={!off[p.service_code]}
              onToggle={() => setOff((o) => ({ ...o, [p.service_code]: !o[p.service_code] }))}
            />
          ))}
          {problem ? <Banner message={problem} /> : null}
          <Button
            title={
              chosen.length
                ? `Request ${chosen.length} service${chosen.length === 1 ? '' : 's'}`
                : 'Done'
            }
            onPress={() =>
              chosen.length ? void send() : router.replace(`/properties/${propertyId}`)
            }
            loading={sending}
          />
          <Button
            title="Decide later"
            variant="ghost"
            onPress={() => router.replace(`/properties/${propertyId}`)}
          />
          <Text style={[typography.caption, styles.center]}>
            Included services use your plan; others are priced before you pay — nothing is charged
            until we confirm.
          </Text>
        </>
      ) : (
        <Button
          title="Go to my property"
          onPress={() => router.replace(`/properties/${propertyId}`)}
        />
      )}
    </ScrollView>
  );
}

function CareCard({ item, on, onToggle }: { item: CareItem; on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={[styles.care, shadow, on && styles.careOn]}
    >
      <View style={styles.flex}>
        <Text style={typography.heading}>{item.title}</Text>
        <Text style={typography.small}>{item.reason}</Text>
        <Text style={typography.caption}>{item.because}</Text>
        {item.legal ? (
          <Text style={styles.legal}>Reviewed by our team, with a lawyer where needed.</Text>
        ) : null}
      </View>
      <View style={[styles.check, on && styles.checkOn]}>
        {on ? <Icon name="check" size={13} color="#FFFFFF" strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
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
  count: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space.lg,
    gap: space.sm,
  },
  tight: { paddingVertical: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 26,
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
  chipText: { fontSize: 13, fontWeight: '700', color: colors.primary },
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
  ring: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringText: { fontSize: 13, fontWeight: '800', color: colors.text },
  overline: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSubtle,
    letterSpacing: 0.9,
    marginTop: space.sm,
  },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 11 },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  docIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upload: { fontSize: 13, fontWeight: '700', color: colors.primary },
  care: {
    flexDirection: 'row',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  careOn: { borderColor: colors.primary },
  legal: { fontSize: 12, fontWeight: '600', color: colors.warning, marginTop: 2 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
