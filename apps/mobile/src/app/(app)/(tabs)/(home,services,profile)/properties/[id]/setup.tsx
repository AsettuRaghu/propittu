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
import {
  confirmRemoveDraft,
  startAnalysis,
  useAnalysis,
  useFinishSetup,
  usePlaceSuggestion,
  useRefreshDrafts,
  useRemoveDraft,
} from '@/api/ai';
import { useProperty } from '@/api/queries';
import { ApiError } from '@/api/client';
import { toast } from '@/components/Dialog';
import { Footer } from '@/components/Footer';
import { DeedReading } from '@/components/DeedReading';
import { DuplicateDeed } from '@/components/DuplicateDeed';
import { LoadingState } from '@/components/States';
import {
  FormSection,
  PropertyForm,
  emptyPropertyForm,
  propertyToForm,
  validatePropertyForm,
  type PropertyFormValues,
} from '@/components/PropertyForm';
import { Banner, Button, KeyValue, LinkButton } from '@/components/ui';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { space, typography } from '@/theme';

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

/**
 * Pittu: reading the deed (a running commentary), what it found (revealed
 * line by line), then the pre-filled form to check. The draft becomes
 * a real property only when the customer confirms; every edit is recorded
 * against what Pittu found (the improvement signal).
 */
export default function PropertySetupScreen() {
  const { id, doc } = useLocalSearchParams<{ id: string; doc?: string }>();
  const analysis = useAnalysis(doc);
  const started = useRef(false);
  const [elapsed, setElapsed] = useState(0);
  const [sawReading, setSawReading] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [addAnyway, setAddAnyway] = useState(false);

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

  // Home's "Waiting for you" follows the reading (reading → ready, with its name).
  const refreshDrafts = useRefreshDrafts();
  const status = a?.status;
  useEffect(() => {
    if (status) refreshDrafts();
  }, [status, refreshDrafts]);
  // Still loading what we know: not the same as reading (don't replay the commentary).
  const notStarted = analysis.error instanceof ApiError && analysis.error.status === 404;
  if (doc && !a && !notStarted && !analysis.error) return <LoadingState />;
  const reading = !!doc && (notStarted || a?.status === 'queued' || a?.status === 'reading');

  // Seen reading in this visit? Then the findings are revealed before the form.
  if (reading && !sawReading) setSawReading(true);

  // One page from reading to findings: the same element, so it carries on.
  const readingPage = (result: Parameters<typeof DeedReading>[0]['result']) => (
    <>
      <Stack.Screen options={{ title: result ? 'Pittu’s findings' : 'Reading your deed' }} />
      <DeedReading elapsed={elapsed} result={result} onContinue={() => setRevealed(true)} />
    </>
  );
  if (reading) return readingPage(null);

  // The same deed is already in the locker: say so before anything else.
  if (a?.status === 'ready' && a.duplicate_of && !addAnyway) {
    return (
      <>
        <Stack.Screen options={{ title: 'Already in your locker' }} />
        <DuplicateDeed
          draftId={id}
          existing={a.duplicate_of}
          onAddAnyway={() => {
            setAddAnyway(true);
            setRevealed(true);
          }}
        />
      </>
    );
  }
  // Added anyway, with nothing read (the deed was never read for that property): start from it.
  if (a?.status === 'ready' && a.duplicate_of && a.facts.length === 0) {
    return <SeededReview propertyId={id} analysis={a} from={a.duplicate_of.id} />;
  }

  if (sawReading && !revealed && a?.status === 'ready' && a.facts.length > 0) {
    return readingPage({ prefill: prefillFromFacts(a.facts), facts: a.facts });
  }

  return <Review key={a?.id ?? 'manual'} propertyId={id} analysis={a ?? null} />;
}

/** "Add as a new property" for a deed already in the locker: start from that property's details. */
function SeededReview({
  propertyId,
  analysis,
  from,
}: {
  propertyId: string;
  analysis: DocumentAnalysis;
  from: string;
}) {
  const { data } = useProperty(from);
  if (!data) return <LoadingState />;
  return (
    <Review
      propertyId={propertyId}
      analysis={analysis}
      seed={{ ...propertyToForm(data), name: '' }}
    />
  );
}

function Review({
  propertyId,
  analysis,
  seed,
}: {
  propertyId: string;
  analysis: DocumentAnalysis | null;
  seed?: PropertyFormValues;
}) {
  const ready = analysis?.status === 'ready';
  const facts: PropertyFact[] = ready ? analysis.facts : [];
  const prefill = prefillFromFacts(facts);
  const [values, setValues] = useState<PropertyFormValues>(
    () =>
      seed ?? {
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
      },
  );
  // No PIN code in the deed: suggest the one of its village (the customer checks it).
  const suggestion = usePlaceSuggestion(propertyId, ready && !seed && !prefill.pincode);
  const [suggestedNear, setSuggestedNear] = useState<string | null | undefined>(undefined);
  if (suggestion.data !== undefined && suggestedNear === undefined) {
    const sg = suggestion.data;
    setSuggestedNear(sg?.pincode ? sg.near : null);
    if (sg?.pincode) {
      setValues((v) => ({
        ...v,
        pincode: v.pincode || sg.pincode || '',
        city: v.city || sg.city || '',
        state: v.state || sg.state || '',
      }));
    }
  }
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const finish = useFinishSetup(propertyId);
  const removeDraft = useRemoveDraft();
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

  // Remove this unfinished property (draft + deed) — it leaves Home too.
  const discard = async () => {
    if (await confirmRemoveDraft(removeDraft, propertyId)) router.dismissTo('/');
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
          <View style={styles.head}>
            <Text style={typography.title}>Check the details</Text>
            <Text style={typography.small}>
              Pittu filled these in from your deed. Fix anything that’s off, then save.
            </Text>
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
          <Banner
            tone="warning"
            icon="warning"
            message={`Please double-check: ${unsure.map((f) => FIELD_LABELS[f]).join(', ')} — part of it was hard to read.`}
          />
        ) : null}
        {suggestedNear ? (
          <Banner
            tone="info"
            icon="pin"
            message={`The deed has no PIN code, so we used the one for ${suggestedNear}. Please check it.`}
          />
        ) : null}
        {formError ? <Banner message={formError} /> : null}

        <PropertyForm values={values} errors={errors} onChange={onChange} />

        {extras.length ? (
          <FormSection title="More from your deed" subtitle="Kept with your property’s records.">
            {extras.map((e) => (
              <KeyValue key={e.key} label={e.label} value={e.value} />
            ))}
          </FormSection>
        ) : null}

        <View style={styles.discard}>
          <LinkButton
            title="Remove this unfinished property"
            tone="danger"
            onPress={() => void discard()}
          />
        </View>
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
  content: { padding: space.lg, paddingTop: space.md, gap: space.xl, paddingBottom: space.xxl },
  head: { gap: space.xs },
  discard: { alignItems: 'center' },
});
