import { useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  formatFileSize,
  type DocumentType,
  type InboxDocument,
} from '@propittu/shared';
import { useDiscardInbox, useEmailInbox, useFileInbox, useProperties } from '@/api/queries';
import { toast } from '@/components/Dialog';
import { Select } from '@/components/Select';
import { ErrorState, LoadingState } from '@/components/States';
import { Banner, Button, ListGroup } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { colors, radius, space, typography } from '@/theme';

/**
 * Email documents to Pittu: the owner's private address, and documents
 * that arrived waiting to be filed under a property (with one property they
 * are filed straight away). Pittu reads each one once it's filed.
 */
export default function InboxScreen() {
  const { data, isPending, error, refetch } = useEmailInbox();
  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      {data.address ? (
        <View style={styles.address}>
          <Text style={typography.caption}>Your Propittu email address</Text>
          <Text style={styles.addressText} selectable>
            {data.address}
          </Text>
          <Text style={typography.small}>
            Forward tax receipts, notices, bills and agreements here (PDF or photos, up to about 3
            MB an email). Pittu files them and reads them. Keep it private — anyone with this
            address can send you documents.
          </Text>
          <Button
            title="Share the address"
            icon="share"
            size="sm"
            variant="secondary"
            onPress={() => void Share.share({ message: data.address! })}
          />
        </View>
      ) : (
        <Banner
          tone="info"
          icon="mail"
          message="Emailing documents to Pittu is coming soon — for now, add them under Documents."
        />
      )}
      <ListGroup title={`To file · ${data.waiting.length}`} plain>
        {data.waiting.length ? (
          data.waiting.map((d) => <ToFile key={d.id} doc={d} />)
        ) : (
          <Text style={[typography.small, styles.inner]}>Nothing waiting.</Text>
        )}
      </ListGroup>
    </ScrollView>
  );
}

function ToFile({ doc }: { doc: InboxDocument }) {
  const properties = useProperties();
  const file = useFileInbox();
  const discard = useDiscardInbox();
  const [propertyId, setPropertyId] = useState<string | null>(doc.guess_property_id);
  const [type, setType] = useState<DocumentType>(doc.guess_type ?? 'other');
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <View style={[styles.inner, styles.item]}>
      <Text style={typography.bodyStrong} numberOfLines={1}>
        {doc.file_name}
      </Text>
      <Text style={typography.caption}>
        {[doc.subject, formatFileSize(doc.file_size), formatDateTime(doc.received_at)]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      <Select
        variant="flat"
        label="Property"
        placeholder="Which property?"
        value={propertyId}
        options={(properties.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
        onChange={setPropertyId}
      />
      <Select
        variant="flat"
        label="What it is"
        value={type}
        options={DOCUMENT_TYPES.map((t) => ({ value: t, label: DOCUMENT_TYPE_LABELS[t] }))}
        onChange={(t) => t && setType(t)}
      />
      {problem ? <Banner message={problem} /> : null}
      <View style={styles.row}>
        <Button
          title="File it"
          size="sm"
          disabled={!propertyId}
          loading={file.isPending}
          onPress={() =>
            file.mutate(
              { id: doc.id, property_id: propertyId!, document_type: type },
              {
                onSuccess: () => toast('Filed — Pittu is reading it'),
                onError: (err) => setProblem(errorMessage(err)),
              },
            )
          }
        />
        <Button title="Discard" size="sm" variant="ghost" onPress={() => discard.mutate(doc.id)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.xs, gap: space.xl, paddingBottom: space.xxl },
  address: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'flex-start',
  },
  addressText: { fontSize: 16, fontWeight: '700', color: colors.primary },
  inner: { paddingHorizontal: 14, paddingVertical: space.xs },
  item: { gap: space.sm, paddingBottom: space.md },
  row: { flexDirection: 'row', gap: space.sm },
});
