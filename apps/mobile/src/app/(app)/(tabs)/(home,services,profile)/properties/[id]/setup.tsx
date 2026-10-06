import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ANALYSIS_ERROR_LABELS,
  FACT_LABELS,
  PREFILL_SOURCES,
  prefillFromFacts,
  type AreaUnit,
  type DocumentAnalysis,
  type PrefillField,
  type PropertyFact,
  type PropertyType,
} from '@propittu/shared';
import { startAnalysis, useAnalysis, useFinishSetup } from '@/api/ai';
import { api, ApiError } from '@/api/client';
import { dialog, toast } from '@/components/Dialog';
import { Footer } from '@/components/Footer';
import { Icon } from '@/components/Icon';
import {
  PropertyForm,
  emptyPropertyForm,
  validatePropertyForm,
  type PropertyFormValues,
} from '@/components/PropertyForm';
import { Banner, Button, Card } from '@/components/ui';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { accents, colors, radius, space, typography } from '@/theme';

/** Form labels, for "please check" notes. */
const FIELD_LABELS: Record<PrefillField, string> = {
  property_type: 'Property type',
  name: 'Name',
  address_line: 'Address',
  city: 'City',
  state: 'State',
  pincode: 'PIN code',
  area_value: 'Area',
  area_unit: 'Area unit',
  survey_number: 'Survey number',
  property_number: 'Plot / property number',
  khata_number: 'Khata number',
};
/** Shown as "More from your deed" (not form fields). */
const EXTRA_KEYS = [
  'buyers',
  'registration_number',
  'registration_date',
  'sub_registrar_office',
  'sale_consideration_inr',
  'village',
  'hobli',
  'taluk_or_mandal',
  'district',
  'survey_numbers',
  'super_built_up_sqft',
  'carpet_sqft',
  'undivided_share',
];

const STEPS = ['Uploaded securely', 'Finding the property details', 'Checking names and numbers'];

/**
 * Pittu: reading the deed, then "We found these details". The draft becomes
 * a real property only when the customer confirms; every edit is recorded
 * against what Pittu found (the improvement signal).
 */
export default function PropertySetupScreen() {
  const { id, doc } = useLocalSearchParams<{ id: string; doc?: string }>();
  const analysis = useAnalysis(doc);
  const started = useRef(false);
  const [elapsed, setElapsed] = useState(0);

  // No reading yet (e.g. the start call was interrupted): start it once.
  useEffect(() => {
    if (!doc || started.current) return;
    if (analysis.error instanceof ApiError && analysis.error.status === 404) {
      started.current = true;
      void startAnalysis(doc).then(() => analysis.refetch());
    }
  }, [doc, analysis]);

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const a = analysis.data;
  const reading = !doc ? false : !a || a.status === 'queued' || a.status === 'reading';

  if (reading) {
    // The upload is already done; the rest is paced to a typical reading (~15–30 s).
    const step = elapsed < 10 ? 1 : 2;
    return (
      <View style={styles.reading}>
        <Stack.Screen options={{ title: 'Reading your deed' }} />
        <View style={styles.readingIcon}>
          <Icon name="document" size={44} color={colors.primary} strokeWidth={1.8} />
        </View>
        <Text style={[typography.title, styles.center]}>Pittu is reading your deed…</Text>
        <Text style={[typography.small, styles.center]}>
          This usually takes under a minute. You can leave — we’ll keep it ready for you.
        </Text>
        <Card style={styles.steps}>
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <View key={s} style={styles.stepRow}>
                <View
                  style={[
                    styles.dot,
                    done && { backgroundColor: accents.teal.fg, borderColor: accents.teal.fg },
                    active && { borderColor: colors.primary },
                  ]}
                >
                  {done ? <Icon name="check" size={12} color="#FFFFFF" strokeWidth={3} /> : null}
                </View>
                <Text
                  style={[
                    typography.body,
                    done && { fontWeight: '600' },
                    active && { color: colors.primary, fontWeight: '700' },
                    !done && !active && { color: colors.textSubtle },
                  ]}
                >
                  {s}
                </Text>
              </View>
            );
          })}
        </Card>
      </View>
    );
  }

  return <Review key={a?.id ?? 'manual'} propertyId={id} analysis={a ?? null} />;
}

function Review({
  propertyId,
  analysis,
}: {
  propertyId: string;
  analysis: DocumentAnalysis | null;
}) {
  const ready = analysis?.status === 'ready';
  const facts: PropertyFact[] = ready ? analysis.facts : [];
  const prefill = prefillFromFacts(facts);
  const [values, setValues] = useState<PropertyFormValues>(() => ({
    ...emptyPropertyForm,
    property_type: (prefill.property_type as PropertyType | null) ?? null,
    name: String(prefill.name ?? ''),
    address_line: String(prefill.address_line ?? ''),
    city: String(prefill.city ?? ''),
    state: String(prefill.state ?? ''),
    pincode: String(prefill.pincode ?? ''),
    area_value:
      prefill.area_value === null || prefill.area_value === undefined
        ? ''
        : String(prefill.area_value),
    area_unit: (prefill.area_unit as AreaUnit | null) ?? null,
    survey_number: String(prefill.survey_number ?? ''),
    property_number: String(prefill.property_number ?? ''),
    khata_number: String(prefill.khata_number ?? ''),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const finish = useFinishSetup(propertyId);
  const scrollRef = useRef<ScrollView>(null);

  const byKey = new Map(facts.map((f) => [f.key, f]));
  const unsure = (Object.keys(PREFILL_SOURCES) as PrefillField[]).filter((field) =>
    PREFILL_SOURCES[field].some((k) => {
      const c = byKey.get(k)?.confidence;
      return c === 'low' || c === 'medium';
    }),
  );
  const extras = EXTRA_KEYS.flatMap((k) => {
    const f = byKey.get(k);
    if (!f) return [];
    const v = Array.isArray(f.value)
      ? f.value.join(', ')
      : k === 'sale_consideration_inr'
        ? `₹${Number(f.value).toLocaleString('en-IN')}`
        : String(f.value);
    return [{ key: k, label: FACT_LABELS[k] ?? k, value: v }];
  });

  const onChange = (patch: Partial<PropertyFormValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in patch))));
  };

  const save = () => {
    const validation = validatePropertyForm(values);
    if (!validation.data) {
      setErrors(validation.errors);
      setFormError('Please check the highlighted fields.');
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setFormError(null);
    // A new property has no map pin yet, so the form's empty location is right here.
    const property = validation.data;
    finish.mutate(
      { property, analysis_id: ready ? analysis.id : null },
      {
        onSuccess: (p) => {
          toast('Property added');
          // Pittu's quick questions, documents checklist and care plan.
          router.replace(`/properties/${p.id}/pittu`);
        },
        onError: (err) => {
          setErrors(fieldErrors(err));
          setFormError(errorMessage(err, "Couldn't save the property. Please try again."));
          scrollRef.current?.scrollTo({ y: 0, animated: true });
        },
      },
    );
  };

  const discard = async () => {
    const ok = await dialog.confirm({
      title: 'Discard this property?',
      message: 'The uploaded deed will be removed too.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep going',
      tone: 'danger',
    });
    if (!ok) return;
    await api<void>(`/properties/${propertyId}`, { method: 'DELETE' }).catch(() => undefined);
    router.dismissTo('/');
  };

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: ready ? 'Check the details' : 'Add property' }} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {ready ? (
          <View style={styles.found}>
            <View style={styles.foundIcon}>
              <Icon name="check" size={20} color={accents.teal.fg} strokeWidth={3} />
            </View>
            <View style={styles.flex}>
              <Text style={typography.title}>We found these details</Text>
              <Text style={typography.small}>Check them, fix anything that’s off, and save.</Text>
            </View>
          </View>
        ) : (
          <Banner
            tone="info"
            message={
              ANALYSIS_ERROR_LABELS[analysis?.error_code ?? 'failed'] ??
              ANALYSIS_ERROR_LABELS.failed!
            }
          />
        )}

        {unsure.length ? (
          <View style={styles.check}>
            <Icon name="warning" size={16} color={colors.warning} />
            <Text style={[typography.small, styles.flex, { color: colors.warning }]}>
              Please double-check: {unsure.map((f) => FIELD_LABELS[f]).join(', ')} — part of it was
              hard to read.
            </Text>
          </View>
        ) : null}
        {formError ? <Banner message={formError} /> : null}

        <PropertyForm values={values} errors={errors} onChange={onChange} />

        {extras.length ? (
          <Card style={styles.extras}>
            <Text style={typography.heading}>More from your deed</Text>
            {extras.map((e) => (
              <View key={e.key} style={styles.extraRow}>
                <Text style={[typography.small, styles.extraLabel]}>{e.label}</Text>
                <Text style={[typography.bodyStrong, styles.flex]}>{e.value}</Text>
              </View>
            ))}
            <Text style={typography.caption}>Kept with your property’s records.</Text>
          </Card>
        ) : null}

        <Text
          style={[typography.caption, styles.center, styles.link]}
          onPress={() => void discard()}
        >
          Discard this property
        </Text>
      </ScrollView>
      <Footer>
        <Button
          title={ready ? 'Looks right — add property' : 'Add property'}
          onPress={save}
          loading={finish.isPending}
        />
      </Footer>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center' },
  reading: { flex: 1, alignItems: 'center', padding: space.xl, paddingTop: 56, gap: space.md },
  readingIcon: {
    width: 92,
    height: 92,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  steps: { alignSelf: 'stretch', gap: space.xs, marginTop: space.sm },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 8 },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: space.lg, paddingTop: space.xs, gap: space.lg, paddingBottom: space.xxl },
  found: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  foundIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: accents.teal.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: space.md,
  },
  extras: { gap: space.sm },
  extraRow: { flexDirection: 'row', gap: space.md },
  extraLabel: { width: 118 },
  link: { color: colors.danger, fontWeight: '700', paddingVertical: space.sm },
});
