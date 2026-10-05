import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  MAX_DOCUMENT_BYTES,
  formatFileSize,
  type DocumentType,
} from '@propittu/shared';
import { useInvalidateProperty } from '@/api/queries';
import { prepareDocument, uploadDocument, type LocalFile } from '@/api/uploads';
import { Footer } from '@/components/Footer';
import { Banner, Button, Card, OptionList, ProgressBar, SectionTitle } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { colors, radius, space, typography } from '@/theme';

type Status =
  | { kind: 'idle' }
  | { kind: 'uploading'; progress: number }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

/**
 * Add Document (PRODUCT_SPEC.md §21):
 * select type → choose file → upload (with progress) → saved.
 * Unsupported types and oversized files are rejected before upload.
 */
export default function AddDocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const invalidate = useInvalidateProperty();
  const [documentType, setDocumentType] = useState<DocumentType | null>(null);
  const [file, setFile] = useState<LocalFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const uploading = status.kind === 'uploading';

  const chooseFile = async () => {
    setFileError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: [...ALLOWED_DOCUMENT_MIME_TYPES],
      copyToCacheDirectory: true,
      multiple: false,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    try {
      setFile(prepareDocument(asset));
      if (status.kind === 'error') setStatus({ kind: 'idle' });
    } catch (err) {
      setFile(null);
      setFileError(errorMessage(err));
    }
  };

  const upload = async () => {
    if (!documentType || !file || uploading) return;
    setStatus({ kind: 'uploading', progress: 0 });
    try {
      await uploadDocument(id, documentType, file, (progress) =>
        setStatus({ kind: 'uploading', progress }),
      );
      invalidate(id);
      setStatus({ kind: 'done' });
    } catch (err) {
      setStatus({ kind: 'error', message: errorMessage(err, 'The upload failed. Please try again.') });
    }
  };

  if (status.kind === 'done') {
    return (
      <View style={styles.done}>
        <Stack.Screen options={{ title: 'Document saved', headerBackVisible: false }} />
        <View style={styles.doneIcon}>
          <Ionicons name="checkmark" size={40} color={colors.success} />
        </View>
        <Text style={typography.title}>Document saved</Text>
        <Text style={[typography.small, styles.center]}>
          {documentType ? DOCUMENT_TYPE_LABELS[documentType] : ''} · {file?.name}
        </Text>
        <View style={styles.doneActions}>
          <Button title="Done" onPress={() => router.back()} />
          <Button
            title="Add another document"
            variant="ghost"
            onPress={() => {
              setDocumentType(null);
              setFile(null);
              setStatus({ kind: 'idle' });
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerBackVisible: !uploading, gestureEnabled: !uploading }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <SectionTitle title="1. Document type" />
          <OptionList
            options={DOCUMENT_TYPES.map((t) => ({ value: t, label: DOCUMENT_TYPE_LABELS[t] }))}
            value={documentType}
            onChange={(t) => !uploading && setDocumentType(t)}
          />
        </View>

        <View style={styles.section}>
          <SectionTitle title="2. File" />
          <Text style={typography.small}>
            PDF, JPG or PNG, up to {formatFileSize(MAX_DOCUMENT_BYTES)}.
          </Text>
          {file ? (
            <Card style={styles.fileCard}>
              <Ionicons
                name={file.mimeType === 'application/pdf' ? 'document-text-outline' : 'image-outline'}
                size={24}
                color={colors.primary}
              />
              <View style={styles.fileBody}>
                <Text style={typography.bodyStrong} numberOfLines={1}>
                  {file.name}
                </Text>
                <Text style={typography.caption}>{formatFileSize(file.size)}</Text>
              </View>
              {!uploading ? (
                <Button title="Change" variant="ghost" onPress={chooseFile} />
              ) : null}
            </Card>
          ) : (
            <Button
              title="Choose file"
              variant="secondary"
              icon="attach-outline"
              onPress={chooseFile}
            />
          )}
          {fileError ? <Banner message={fileError} /> : null}
        </View>
      </ScrollView>

      <Footer>
        {status.kind === 'uploading' ? (
          <View style={styles.progress}>
            <Text style={typography.small}>
              Uploading… {Math.round(status.progress * 100)}%
            </Text>
            <ProgressBar progress={status.progress} />
          </View>
        ) : null}
        {status.kind === 'error' ? <Banner message={status.message} /> : null}
        <Button
          title={status.kind === 'error' ? 'Try again' : 'Upload'}
          icon="cloud-upload-outline"
          onPress={upload}
          loading={uploading}
          disabled={!documentType || !file}
        />
      </Footer>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl },
  section: { gap: space.md },
  fileCard: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  fileBody: { flex: 1, gap: 2 },
  progress: { gap: space.xs },
  done: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    gap: space.md,
  },
  doneIcon: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    backgroundColor: colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneActions: { alignSelf: 'stretch', gap: space.sm, marginTop: space.lg },
  center: { textAlign: 'center' },
});
