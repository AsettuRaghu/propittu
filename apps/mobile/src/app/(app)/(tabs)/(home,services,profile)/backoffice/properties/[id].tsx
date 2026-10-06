import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPE_LABELS,
  formatFileSize,
  PROPERTY_TYPE_LABELS,
  staffCan,
  type DocumentStatus,
  type PropertyDocument,
} from '@propittu/shared';
import { PullRefresh } from '@/components/PullRefresh';
import { useBoDocumentStatus, useBoProperty } from '@/api/backoffice';
import { useMe } from '@/api/queries';
import { openDocument } from '@/api/uploads';
import { ErrorState, LoadingState } from '@/components/States';
import { Badge, Button, Card, Chips, KeyValue, SectionTitle, type Tone } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatArea, formatDate } from '@/lib/format';
import { signedImage } from '@/lib/image';
import { radius, space, typography } from '@/theme';
import { showAlert } from '@/lib/alert';

const DOC_TONES: Record<DocumentStatus, Tone> = {
  uploaded: 'neutral',
  under_review: 'warning',
  verified: 'success',
  rejected: 'danger',
};

/** Backoffice: a customer's property, photos and document review (M3/M9). */
export default function BackofficePropertyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending, error, refetch } = useBoProperty(id);
  const me = useMe();

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const { property } = data;
  const canReview = staffCan(me.data?.staff_role, 'documents.review');
  const address = [property.address_line, property.city, property.state, property.pincode]
    .filter(Boolean)
    .join(', ');

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<PullRefresh onRefresh={() => refetch()} />}
    >
      <Card style={styles.card}>
        <Text style={typography.heading}>{property.name}</Text>
        <KeyValue label="Type" value={PROPERTY_TYPE_LABELS[property.property_type]} />
        <KeyValue label="Address" value={address || null} />
        <KeyValue label="Area" value={formatArea(property.area_value, property.area_unit)} />
        <KeyValue label="Survey number" value={property.survey_number} />
        <KeyValue label="Khata number" value={property.khata_number} />
        <KeyValue
          label="Map pin"
          value={
            property.latitude !== null && property.longitude !== null
              ? `${property.latitude.toFixed(5)}, ${property.longitude.toFixed(5)} (${property.location_source ?? 'unknown'})`
              : null
          }
        />
        {property.latitude !== null && property.longitude !== null ? (
          <Button
            title="Open in Maps"
            variant="secondary"
            icon="map"
            onPress={() =>
              void WebBrowser.openBrowserAsync(
                `https://maps.google.com/?q=${property.latitude},${property.longitude}`,
              )
            }
          />
        ) : null}
      </Card>

      {data.photos.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle title={`Photos (${data.photos.length})`} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}
          >
            {data.photos.map((p) =>
              p.url ? (
                <Pressable
                  key={p.id}
                  onPress={() => void WebBrowser.openBrowserAsync(p.url as string)}
                >
                  <Image source={signedImage(p.url)} style={styles.photo} contentFit="cover" />
                </Pressable>
              ) : null,
            )}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionTitle title={`Documents (${data.documents.length})`} />
        {data.documents.map((d) => (
          <DocumentRow key={d.id} document={d} canReview={canReview} />
        ))}
        {data.documents.length === 0 ? <Text style={typography.small}>No documents.</Text> : null}
      </View>
    </ScrollView>
  );
}

function DocumentRow({ document, canReview }: { document: PropertyDocument; canReview: boolean }) {
  const setStatus = useBoDocumentStatus();

  const open = () =>
    openDocument(document, true)
      .then((result) => {
        if (result.kind === 'image') void WebBrowser.openBrowserAsync(result.url);
      })
      .catch((err) => showAlert("Couldn't open the document", errorMessage(err)));

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Text style={[typography.bodyStrong, styles.flex]} numberOfLines={1}>
          {DOCUMENT_TYPE_LABELS[document.document_type]}
        </Text>
        <Badge label={DOCUMENT_STATUS_LABELS[document.status]} tone={DOC_TONES[document.status]} />
      </View>
      <Text style={typography.small}>
        {document.file_name} · {formatFileSize(document.file_size)} ·{' '}
        {formatDate(document.created_at)}
      </Text>
      {document.description ? <Text style={typography.small}>{document.description}</Text> : null}
      <Button title="Open" variant="secondary" icon="document" onPress={() => void open()} />
      {canReview ? (
        <Chips
          options={DOCUMENT_STATUSES.map((s) => ({ value: s, label: DOCUMENT_STATUS_LABELS[s] }))}
          value={document.status}
          onChange={(status) =>
            setStatus.mutate(
              { id: document.id, status },
              { onError: (err) => showAlert("Couldn't update", errorMessage(err)) },
            )
          }
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl },
  card: { gap: space.md },
  section: { gap: space.sm },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  flex: { flex: 1 },
  strip: { gap: space.sm },
  photo: { width: 120, height: 120, borderRadius: radius.md },
});
