import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  formatFileSize,
  type PropertyDocument,
} from '@propittu/shared';
import { PullRefresh } from '@/components/PullRefresh';
import { useDeleteDocument, useDocuments } from '@/api/queries';
import { openDocument } from '@/api/uploads';
import { dialog, toast } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { PropertyContext } from '@/components/PropertyContext';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Badge, Button, Card, IconButton, IconTile, type Tone } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { DOCUMENT_TYPE_VISUALS } from '@/lib/icons';
import { colors, space, typography } from '@/theme';

const DOC_TONES: Record<PropertyDocument['status'], Tone> = {
  uploaded: 'neutral',
  under_review: 'warning',
  verified: 'success',
  rejected: 'danger',
};

/** A property's documents: view, open, delete (PRODUCT_SPEC.md §8.3, §20). */
export default function DocumentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending, error, refetch } = useDocuments(id);
  const deleteDocument = useDeleteDocument(id);
  const [opening, setOpening] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const addDocument = () => router.push(`/properties/${id}/add-document`);

  const open = async (doc: PropertyDocument) => {
    if (opening) return;
    setOpening(doc.id);
    try {
      const result = await openDocument(doc);
      if (result.kind === 'image') setImageUrl(result.url);
    } catch (err) {
      void dialog.alert({
        title: "Couldn't open this document",
        message: errorMessage(err),
        tone: 'danger',
      });
    } finally {
      setOpening(null);
    }
  };

  const confirmDelete = async (doc: PropertyDocument) => {
    const ok = await dialog.confirm({
      title: 'Delete this document?',
      message: `"${doc.file_name}" will be permanently deleted.`,
      confirmLabel: 'Delete document',
      tone: 'danger',
      icon: 'delete',
    });
    if (!ok) return;
    deleteDocument.mutate(doc.id, {
      onSuccess: () => toast('Document deleted'),
      onError: (err) =>
        void dialog.alert({
          title: "Couldn't delete the document",
          message: errorMessage(err),
          tone: 'danger',
        }),
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton icon="add" label="Add document" onPress={addDocument} size={36} />
          ),
        }}
      />
      {isPending ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(d) => d.id}
          ListHeaderComponent={
            <View style={styles.context}>
              <PropertyContext propertyId={id} />
            </View>
          }
          contentContainerStyle={data.length === 0 ? styles.empty : styles.list}
          ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
          refreshControl={<PullRefresh onRefresh={() => refetch()} />}
          renderItem={({ item }) => (
            <Card onPress={() => void open(item)} style={styles.row}>
              <IconTile
                icon={DOCUMENT_TYPE_VISUALS[item.document_type].icon}
                accent={DOCUMENT_TYPE_VISUALS[item.document_type].accent}
                size={44}
              />
              <View style={styles.body}>
                <Text style={typography.bodyStrong}>
                  {DOCUMENT_TYPE_LABELS[item.document_type]}
                </Text>
                <Text style={typography.small} numberOfLines={1}>
                  {item.file_name}
                </Text>
                {item.description ? (
                  <Text style={typography.small} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
                <View style={styles.metaRow}>
                  <Text style={typography.caption}>
                    {formatFileSize(item.file_size)} · {formatDate(item.created_at)}
                  </Text>
                  <Badge
                    label={DOCUMENT_STATUS_LABELS[item.status]}
                    tone={DOC_TONES[item.status]}
                  />
                </View>
              </View>
              {opening === item.id ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Pressable
                  onPress={() => void confirmDelete(item)}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${item.file_name}`}
                >
                  <Icon name="delete" size={19} color={colors.textSubtle} />
                </Pressable>
              )}
            </Card>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="folder"
              accent="amber"
              title="No documents yet"
              message="Keep sale deeds, tax receipts and other papers for this property in one place."
              action={<Button title="Add Document" icon="add" onPress={addDocument} />}
            />
          }
        />
      )}

      <Modal
        visible={imageUrl !== null}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setImageUrl(null)}
      >
        <SafeAreaView style={styles.viewer}>
          <View style={styles.viewerBar}>
            <Pressable onPress={() => setImageUrl(null)} hitSlop={12} accessibilityLabel="Close">
              <Icon name="close" size={26} color="#FFFFFF" />
            </Pressable>
          </View>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.viewerImage} contentFit="contain" />
          ) : null}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  context: { paddingBottom: space.md },
  list: { padding: space.lg },
  empty: { flexGrow: 1, padding: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  body: { flex: 1, gap: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  viewer: { flex: 1, backgroundColor: '#000000' },
  viewerBar: { flexDirection: 'row', justifyContent: 'flex-end', padding: space.lg },
  viewerImage: { flex: 1 },
});
