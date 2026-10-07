import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  createTicketSchema,
  OPEN_REQUEST_STATUSES,
  requestStatusLabel,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  toFieldErrors,
  type TicketCategory,
} from '@propittu/shared';
import { useProperties, useServiceRequests } from '@/api/queries';
import { useCreateTicket } from '@/api/support';
import type { LocalFile } from '@/api/uploads';
import { AttachmentPicker, uploadAll } from '@/components/AttachmentPicker';
import { toast } from '@/components/Dialog';
import { TextField } from '@/components/Field';
import { Footer } from '@/components/Footer';
import { Select } from '@/components/Select';
import { Banner, Button } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { colors, space, typography } from '@/theme';

/** Raise a support ticket: subject, category, the issue, and optionally a property / request. */
export default function NewTicketScreen() {
  const params = useLocalSearchParams<{
    category?: string;
    subject?: string;
    requestId?: string;
    propertyId?: string;
  }>();
  const properties = useProperties();
  const requests = useServiceRequests();
  const create = useCreateTicket();

  const [subject, setSubject] = useState(params.subject ?? '');
  const [category, setCategory] = useState<TicketCategory | null>(
    (TICKET_CATEGORIES as readonly string[]).includes(params.category ?? '')
      ? (params.category as TicketCategory)
      : null,
  );
  const [description, setDescription] = useState('');
  const [propertyId, setPropertyId] = useState<string | null>(params.propertyId ?? null);
  const [requestId, setRequestId] = useState<string | null>(params.requestId ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [since] = useState(() => Date.now() - 30 * 86_400_000);
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const submit = () => {
    const parsed = createTicketSchema.safeParse({
      subject,
      category: category ?? undefined,
      description,
      property_id: propertyId,
      service_request_id: requestId,
    });
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    create.mutate(parsed.data, {
      onSuccess: async (t) => {
        const first = t.messages[0];
        if (files.length && first) {
          setUploading(true);
          const failed = await uploadAll('support', t.id, first.id, files);
          setUploading(false);
          if (failed)
            toast(`${failed} file${failed === 1 ? '' : 's'} couldn't be uploaded`, 'danger');
        }
        toast('Ticket raised — we’ll reply here');
        router.replace(`/support/${t.id}`);
      },
      onError: (err) => setErrors(fieldErrors(err)),
    });
  };

  // Open requests, plus those closed in the last 30 days.
  const relevantRequests = (requests.data ?? []).filter(
    (r) =>
      OPEN_REQUEST_STATUSES.includes(r.status) ||
      new Date(r.completed_at ?? r.cancelled_at ?? r.updated_at).getTime() >= since,
  );

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {create.error && !Object.keys(errors).length ? (
          <Banner message={errorMessage(create.error)} />
        ) : null}

        <TextField
          label="Subject"
          value={subject}
          onChangeText={setSubject}
          placeholder="e.g. Area shown is wrong"
          maxLength={120}
          error={errors.subject}
        />

        <Select
          label="Category"
          value={category}
          options={TICKET_CATEGORIES.map((c) => ({ value: c, label: TICKET_CATEGORY_LABELS[c] }))}
          onChange={setCategory}
          error={errors.category}
        />

        <TextField
          label="Explain the issue"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={4000}
          placeholder="Tell us what you need help with — the more detail, the faster we can help."
          error={errors.description}
        />

        {(properties.data ?? []).length > 0 ? (
          <Select
            label="Property"
            optional
            value={propertyId}
            noneLabel="Not about a specific property"
            options={(properties.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
            onChange={setPropertyId}
          />
        ) : null}

        {relevantRequests.length > 0 ? (
          <Select
            label="Service request"
            optional
            value={requestId}
            noneLabel="Not about a service request"
            options={relevantRequests.map((r) => ({
              value: r.id,
              label: r.service.name,
              description: [
                r.property?.name,
                requestStatusLabel(r.status, r.fulfilment),
                formatDate(r.created_at),
              ]
                .filter(Boolean)
                .join(' · '),
            }))}
            onChange={setRequestId}
          />
        ) : null}

        <View style={styles.block}>
          <Text style={styles.label}>
            Photos or files <Text style={typography.caption}>· optional, up to 5</Text>
          </Text>
          <AttachmentPicker
            files={files}
            onChange={setFiles}
            disabled={create.isPending || uploading}
          />
        </View>
      </ScrollView>
      <Footer>
        <Button
          title="Raise ticket"
          icon="arrow"
          onPress={submit}
          loading={create.isPending || uploading}
        />
      </Footer>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  block: { gap: space.sm },
  label: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  error: { fontSize: 13, color: colors.danger, fontWeight: '600' },
});
