import * as DocumentPicker from 'expo-document-picker';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { TextField } from '@/components/Field';
import { Icon } from '@/components/Icon';
import { FormSection } from '@/components/PropertyForm';
import { Banner, Button, Card, IconTile, ProgressBar } from '@/components/ui';
import { DOCUMENT_TYPE_VISUALS } from '@/lib/icons';
import { errorMessage } from '@/lib/errors';
import { accents, colors, radius, shadow, space, typography } from '@/theme';

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
  const { id, type } = useLocalSearchParams<{ id: string; type?: string }>();
  const invalidate = useInvalidateProperty();
  const [documentType, setDocumentType] = useState<DocumentType | null>(
    (DOCUMENT_TYPES as readonly string[]).includes(type ?? '') ? (type as DocumentType) : null,
  );
  const [description, setDescription] = useState('');
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
      await uploadDocument(
        id,
        documentType,
        file,
        (progress) => setStatus({ kind: 'uploading', progress }),
        description,
      );
      invalidate(id);
      setStatus({ kind: 'done' });
    } catch (err) {
      setStatus({
        kind: 'error',
        message: errorMessage(err, 'The upload failed. Please try again.'),
      });
    }
  };

  if (status.kind === 'done') {
    return (
      <View style={styles.done}>
        <Stack.Screen options={{ title: 'Document saved', headerBackVisible: false }} />
        <View style={styles.doneIcon}>
          <Icon name="check" size={40} color={colors.success} strokeWidth={2.5} />
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
              setDescription('');
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
        <FormSection icon="folder" accent="amber" title="What is it?">
          <View style={styles.typeGrid}>
            {DOCUMENT_TYPES.map((t) => {
              const selected = documentType === t;
              const v = DOCUMENT_TYPE_VISUALS[t];
              return (
                <Pressable
                  key={t}
                  onPress={() => !uploading && setDocumentType(t)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={[
                    styles.typeTile,
                    selected && {
                      borderColor: accents[v.accent].fg,
                      backgroundColor: accents[v.accent].bg,
                    },
                  ]}
                >
                  <IconTile icon={v.icon} accent={v.accent} size={34} solid={selected} />
                  <Text style={styles.typeLabel} numberOfLines={1}>
                    {DOCUMENT_TYPE_LABELS[t]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </FormSection>

        <FormSection
          icon="attach"
          accent="indigo"
          title="Choose the file"
          subtitle={`PDF, JPG or PNG · up to ${formatFileSize(MAX_DOCUMENT_BYTES)}`}
        >
          {file ? (
            <Card flat style={styles.fileCard}>
              <Icon
                name={file.mimeType === 'application/pdf' ? 'document' : 'image'}
                size={24}
                color={colors.primary}
              />
              <View style={styles.fileBody}>
                <Text style={typography.bodyStrong} numberOfLines={1}>
                  {file.name}
                </Text>
                <Text style={typography.caption}>{formatFileSize(file.size)}</Text>
              </View>
              {!uploading ? <Button title="Change" variant="ghost" onPress={chooseFile} /> : null}
            </Card>
          ) : (
            <Button title="Choose file" variant="secondary" icon="attach" onPress={chooseFile} />
          )}
          {fileError ? <Banner message={fileError} /> : null}
        </FormSection>

        <FormSection icon="document" accent="slate" title="Description">
          <TextField
            label="Description"
            optional
            multiline
            maxLength={500}
            placeholder="e.g. Original registered sale deed, 2018"
            value={description}
            onChangeText={setDescription}
            editable={!uploading}
          />
        </FormSection>
      </ScrollView>

      <Footer>
        {status.kind === 'uploading' ? (
          <View style={styles.progress}>
            <Text style={typography.small}>Uploading… {Math.round(status.progress * 100)}%</Text>
            <ProgressBar progress={status.progress} />
          </View>
        ) : null}
        {status.kind === 'error' ? <Banner message={status.message} /> : null}
        <Button
          title={status.kind === 'error' ? 'Try again' : 'Upload'}
          icon="upload"
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
  content: { padding: space.lg, paddingTop: space.xs, gap: space.lg, paddingBottom: space.xxl },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  typeTile: {
    width: '48.5%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.text },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surfaceMuted,
    ...shadow,
  },
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
