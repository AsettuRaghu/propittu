import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ALLOWED_DOCUMENT_MIME_TYPES, MAX_ATTACHMENTS_PER_MESSAGE } from '@propittu/shared';
import {
  prepareDocument,
  preparePhoto,
  uploadTicketAttachment,
  type LocalFile,
} from '@/api/uploads';
import { errorMessage } from '@/lib/errors';
import { pickPhotos } from '@/lib/pickPhotos';
import { colors, radius, space } from '@/theme';
import { dialog } from './Dialog';
import { Icon } from './Icon';

type Props = { files: LocalFile[]; onChange: (files: LocalFile[]) => void; disabled?: boolean };

/** Adds photos / PDFs to a message (up to 5): the "Attach" sheet and pickers. */
export function useAttachmentAdder({ files, onChange, disabled = false }: Props) {
  const room = MAX_ATTACHMENTS_PER_MESSAGE - files.length;

  const add = async () => {
    if (room <= 0 || disabled) return;
    const choice = await dialog.actions({
      title: 'Attach',
      actions: [
        {
          label: 'Photo',
          value: 'photo' as const,
          icon: 'camera',
          description: 'Take or choose photos',
        },
        {
          label: 'File',
          value: 'file' as const,
          icon: 'document',
          description: 'PDF, JPG or PNG up to 10 MB',
        },
      ],
    });
    if (!choice) return;
    try {
      if (choice === 'photo') {
        const assets = await pickPhotos(room);
        const prepared = await Promise.all(assets.map((a) => preparePhoto(a)));
        onChange(
          [
            ...files,
            ...prepared.map((f, i) => ({ ...f, name: `photo-${files.length + i + 1}.jpg` })),
          ].slice(0, MAX_ATTACHMENTS_PER_MESSAGE),
        );
      } else {
        await new Promise((r) => setTimeout(r, 350));
        const result = await DocumentPicker.getDocumentAsync({
          type: [...ALLOWED_DOCUMENT_MIME_TYPES],
          copyToCacheDirectory: true,
          multiple: false,
        });
        const asset = result.canceled ? undefined : result.assets[0];
        if (asset)
          onChange([...files, prepareDocument(asset)].slice(0, MAX_ATTACHMENTS_PER_MESSAGE));
      }
    } catch (err) {
      void dialog.alert({
        title: "Couldn't add the file",
        message: errorMessage(err),
        tone: 'danger',
      });
    }
  };

  return { add, room };
}

/** Thumbnails of the files picked so far, each removable. */
export function AttachmentPreviews({ files, onChange, disabled = false }: Props) {
  if (files.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
    >
      {files.map((f, i) => (
        <View key={`${f.uri}-${i}`} style={styles.item}>
          {f.mimeType.startsWith('image/') ? (
            <Image source={{ uri: f.uri }} style={styles.thumb} contentFit="cover" />
          ) : (
            <View style={[styles.thumb, styles.doc]}>
              <Icon name="document" size={18} color={colors.primary} />
              <Text style={styles.docName} numberOfLines={1}>
                {f.name}
              </Text>
            </View>
          )}
          {!disabled ? (
            <Pressable
              onPress={() => onChange(files.filter((_, j) => j !== i))}
              hitSlop={8}
              style={styles.remove}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${f.name}`}
            >
              <Icon name="close" size={11} color="#FFFFFF" strokeWidth={3} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

/** Uploads picked files onto a message; returns how many failed. */
export async function uploadAll(
  scope: 'support' | 'backoffice',
  ticketId: string,
  messageId: string,
  files: LocalFile[],
): Promise<number> {
  let failed = 0;
  for (const f of files) {
    try {
      await uploadTicketAttachment(scope, ticketId, messageId, f);
    } catch {
      failed += 1;
    }
  }
  return failed;
}

const styles = StyleSheet.create({
  strip: { gap: space.sm },
  item: { width: 64, height: 64 },
  thumb: { width: 64, height: 64, borderRadius: radius.sm },
  doc: {
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    gap: 2,
  },
  docName: { fontSize: 9, fontWeight: '600', color: colors.primary },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
