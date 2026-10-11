import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  DISPUTE_REPORT_SOURCES,
  DISPUTE_REPORT_SOURCE_LABELS,
  disputeReportSchema,
  type DisputeReportSource,
} from '@propittu/shared';
import { useReportDispute } from '@/api/ai';
import { toast } from '@/components/Dialog';
import { TextField } from '@/components/Field';
import { Footer } from '@/components/Footer';
import { FormSection } from '@/components/FormSection';
import { PropertyContext } from '@/components/PropertyContext';
import { Select } from '@/components/Select';
import { Banner, Button } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { space, typography } from '@/theme';

/**
 * "I've heard about a dispute": owners often hear first — from the builder,
 * a call from someone claiming the land, a notice. Our team looks into it
 * (court registers, the builder) and replies on the Records check; if it's
 * confirmed, every Propittu owner in the project is told.
 */
export default function ReportDisputeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const report = useReportDispute(id);
  const [source, setSource] = useState<DisputeReportSource | null>(null);
  const [details, setDetails] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const send = () => {
    setProblem(null);
    const parsed = disputeReportSchema.safeParse({ source, details });
    if (!parsed.success) {
      setProblem(
        source
          ? (parsed.error.issues[0]?.message ?? 'Check the details')
          : 'Choose where you heard it',
      );
      return;
    }
    report.mutate(parsed.data, {
      onSuccess: () => {
        toast('Thanks — our team will look into it');
        router.back();
      },
      onError: (err) => setProblem(errorMessage(err)),
    });
  };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <PropertyContext propertyId={id} />
        <Text style={typography.small}>
          Tell us what you’ve heard — a case, someone claiming the land, a notice. We check the
          court registers and ask the builder, and reply here. Nothing is shared with anyone else
          unless our team confirms it.
        </Text>
        <FormSection title="Where did you hear it?">
          <Select
            variant="flat"
            label="Where you heard it"
            placeholder="Choose one"
            value={source}
            options={DISPUTE_REPORT_SOURCES.map((s) => ({
              value: s,
              label: DISPUTE_REPORT_SOURCE_LABELS[s],
            }))}
            onChange={setSource}
          />
        </FormSection>
        <FormSection title="What did you hear?">
          <TextField
            variant="flat"
            hideLabel
            label="What you heard"
            value={details}
            onChangeText={setDetails}
            multiline
            maxLength={2000}
            placeholder="e.g. The builder said a family claims part of the project land and has gone to court. A man called owners asking them to contact him."
          />
        </FormSection>
        {problem ? <Banner message={problem} /> : null}
      </ScrollView>
      <Footer>
        <Button title="Send to our team" icon="arrow" onPress={send} loading={report.isPending} />
      </Footer>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, paddingTop: space.xs, gap: space.lg, paddingBottom: space.xxl },
});
