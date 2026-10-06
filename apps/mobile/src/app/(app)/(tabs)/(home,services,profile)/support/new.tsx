import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  createTicketSchema,
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
import { Banner, Button, Chips } from '@/components/ui';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { colors, space, typography } from '@/theme';

const NONE = 'none';

/** Raise a support ticket: subject, category, what happened, optional property/request. */
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
  const [propertyId, setPropertyId] = useState<string>(params.propertyId ?? NONE);
  const [requestId, setRequestId] = useState<string>(params.requestId ?? NONE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const submit = () => {
    const parsed = createTicketSchema.safeParse({
      subject,
      category: category ?? undefined,
      description,
      property_id: propertyId === NONE ? null : propertyId,
      service_request_id: requestId === NONE ? null : requestId,
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
        toast(`Ticket ${t.reference} raised`);
        router.replace(`/support/${t.id}`);
      },
      onError: (err) => setErrors(fieldErrors(err)),
    });
  };

  const recentRequests = (requests.data ?? []).slice(0, 6);

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

        <View style={styles.block}>
          <Text style={styles.label}>Category</Text>
          <Chips
            options={TICKET_CATEGORIES.map((c) => ({ value: c, label: TICKET_CATEGORY_LABELS[c] }))}
            value={category}
            onChange={setCategory}
          />
          {errors.category ? <Text style={styles.error}>{errors.category}</Text> : null}
        </View>

        <TextField
          label="What happened?"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={4000}
          placeholder="Tell us what you expected and what you saw."
          error={errors.description}
        />

        {(properties.data ?? []).length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.label}>
              Related property <Text style={typography.caption}>· optional</Text>
            </Text>
            <Chips
              options={[
                { value: NONE, label: 'None' },
                ...(properties.data ?? []).map((p) => ({ value: p.id, label: p.name })),
              ]}
              value={propertyId}
              onChange={setPropertyId}
            />
          </View>
        ) : null}

        {recentRequests.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.label}>
              Related service request <Text style={typography.caption}>· optional</Text>
            </Text>
            <Chips
              options={[
                { value: NONE, label: 'None' },
                ...recentRequests.map((r) => ({
                  value: r.id,
                  label: `${r.service.name} · ${r.reference}`,
                })),
              ]}
              value={requestId}
              onChange={setRequestId}
            />
          </View>
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
