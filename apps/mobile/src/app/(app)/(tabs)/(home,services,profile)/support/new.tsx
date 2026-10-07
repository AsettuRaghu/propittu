import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
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
import { AttachmentPreviews, uploadAll, useAttachmentAdder } from '@/components/AttachmentPicker';
import { toast } from '@/components/Dialog';
import { TextField } from '@/components/Field';
import { Footer } from '@/components/Footer';
import { Select } from '@/components/Select';
import { Banner, Button, ListGroup, ListRow } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { TICKET_CATEGORY_ICONS } from '@/lib/icons';
import { space } from '@/theme';

/**
 * Raise a support ticket, flat like Profile: headed sections with their
 * content indented — what it's about (required), the issue (required),
 * what it relates to and any photos or files (optional).
 */
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

  // A subject only arrives from other screens (e.g. a request); the form itself doesn't ask.
  const subject = params.subject;
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
  const attach = useAttachmentAdder({ files, onChange: setFiles });
  const [uploading, setUploading] = useState(false);

  const submit = () => {
    const parsed = createTicketSchema.safeParse({
      subject: subject || undefined,
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

  const props = properties.data ?? [];
  const busy = create.isPending || uploading;

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

        <ListGroup title="What is it about?" plain>
          <View style={styles.inner}>
            <Select
              variant="flat"
              label="Category"
              placeholder="Choose a category"
              value={category}
              options={TICKET_CATEGORIES.map((c) => ({
                value: c,
                label: TICKET_CATEGORY_LABELS[c],
                icon: TICKET_CATEGORY_ICONS[c],
              }))}
              onChange={setCategory}
              error={errors.category}
            />
          </View>
        </ListGroup>

        <ListGroup title="Explain the issue" plain>
          <View style={styles.inner}>
            <TextField
              variant="flat"
              label="Explain the issue"
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={4000}
              placeholder="What do you need help with? The more detail, the faster we can help."
              error={errors.description}
            />
          </View>
        </ListGroup>

        {props.length > 0 || relevantRequests.length > 0 ? (
          <ListGroup title="Related to (optional)" plain>
            <View style={styles.inner}>
              {props.length > 0 ? (
                <Select
                  variant="flat"
                  label="Property"
                  value={propertyId}
                  noneLabel="Not about a specific property"
                  options={props.map((p) => ({ value: p.id, label: p.name }))}
                  onChange={setPropertyId}
                />
              ) : null}
              {relevantRequests.length > 0 ? (
                <Select
                  variant="flat"
                  label="Service request"
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
            </View>
          </ListGroup>
        ) : null}

        <ListGroup title="Photos or files (optional)" plain>
          {attach.room > 0 ? (
            <ListRow
              icon="attach"
              title={files.length ? `Add more (${attach.room} left)` : 'Add photos or files'}
              subtitle="Up to 5 · PDF, JPG or PNG"
              onPress={() => (busy ? undefined : void attach.add())}
            />
          ) : null}
          {files.length > 0 ? (
            <View style={styles.inner}>
              <AttachmentPreviews files={files} onChange={setFiles} disabled={busy} />
            </View>
          ) : null}
        </ListGroup>
      </ScrollView>
      <Footer>
        <Button title="Raise ticket" icon="arrow" onPress={submit} loading={busy} />
      </Footer>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, paddingTop: space.md, gap: space.xl, paddingBottom: space.xxl },
  // Same 14 pt inset as list rows, so content lines up under each heading.
  inner: { paddingHorizontal: 14, paddingVertical: space.xs, gap: space.lg },
});
