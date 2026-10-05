import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
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
import { useDeleteDocument, useDocuments } from '@/api/queries';
import { openDocument } from '@/api/uploads';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Button, Card } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { colors, radius, space, typography } from '@/theme';

/** A property's documents: view, open, delete (PRODUCT_SPEC.md §8.3, §20). */
export default function DocumentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending, error, refetch, isRefetching } = useDocuments(id);
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
      Alert.alert("Couldn't open this document", errorMessage(err));
    } finally {
      setOpening(null);
    }
  };

  const confirmDelete = (doc: PropertyDocument) => {
    Alert.alert(`Delete "${doc.file_name}"?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deleteDocument.mutate(doc.id, {
            onError: (err) => Alert.alert("Couldn't delete the document", errorMessage(err)),
          }),
      },
    ]);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={addDocument} hitSlop={12} accessibilityLabel="Add document">
              <Ionicons name="add" size={28} color={colors.primary} />
            </Pressable>
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
          contentContainerStyle={data.length === 0 ? styles.empty : styles.list}
          ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <Card onPress={() => void open(item)} style={styles.row}>
              <View style={styles.icon}>
                <Ionicons
                  name={
                    item.mime_type === 'application/pdf' ? 'document-text-outline' : 'image-outline'
                  }
                  size={22}
                  color={colors.primary}
                />
              </View>
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
                <Text style={typography.caption}>
                  {formatFileSize(item.file_size)} · {formatDate(item.created_at)} ·{' '}
                  {DOCUMENT_STATUS_LABELS[item.status]}
                </Text>
              </View>
              {opening === item.id ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Pressable
                  onPress={() => confirmDelete(item)}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${item.file_name}`}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.textSubtle} />
                </Pressable>
              )}
            </Card>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="folder-open-outline"
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
              <Ionicons name="close" size={28} color="#FFFFFF" />
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
  list: { padding: space.lg },
  empty: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  viewer: { flex: 1, backgroundColor: '#000000' },
  viewerBar: { flexDirection: 'row', justifyContent: 'flex-end', padding: space.lg },
  viewerImage: { flex: 1 },
});
