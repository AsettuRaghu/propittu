import { Image } from 'expo-image';
import { useImperativeHandle, useState, type Ref } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MAX_PHOTOS_PER_PROPERTY, type PropertyPhoto } from '@propittu/shared';
import { useDeletePhoto, useInvalidateProperty } from '@/api/queries';
import { preparePhoto, uploadPhoto } from '@/api/uploads';
import { errorMessage } from '@/lib/errors';
import { signedImage } from '@/lib/image';
import { pickPhotos } from '@/lib/pickPhotos';
import { accents, colors, radius, space, typography } from '@/theme';
import { dialog, toast } from './Dialog';
import { Icon } from './Icon';
import { Banner, Button, ProgressBar } from './ui';

/** Lets a parent start "add photos" (e.g. the profile-completion chip). */
export interface PhotoSectionHandle {
  add: () => void;
}

/** Property photo gallery with add, view and delete (PRODUCT_SPEC.md §8.2, §19). */
export function PhotoSection({
  propertyId,
  photos,
  ref,
}: {
  propertyId: string;
  photos: PropertyPhoto[];
  ref?: Ref<PhotoSectionHandle>;
}) {
  const invalidate = useInvalidateProperty();
  const deletePhoto = useDeletePhoto(propertyId);
  const [upload, setUpload] = useState<{ index: number; total: number; progress: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<PropertyPhoto | null>(null);
  const remaining = MAX_PHOTOS_PER_PROPERTY - photos.length;

  const addPhotos = async () => {
    if (upload || remaining <= 0) return;
    const picked = await pickPhotos(remaining);
    if (picked.length === 0) return;

    setError(null);
    let failed = 0;
    let lastError: unknown = null;
    for (const [index, asset] of picked.entries()) {
      setUpload({ index, total: picked.length, progress: 0 });
      try {
        const file = await preparePhoto(asset);
        await uploadPhoto(propertyId, file, (progress) =>
          setUpload({ index, total: picked.length, progress }),
        );
      } catch (err) {
        failed += 1;
        lastError = err;
      }
    }
    setUpload(null);
    invalidate(propertyId);
    if (failed > 0) {
      setError(
        `${failed} of ${picked.length} ${picked.length === 1 ? 'photo' : 'photos'} couldn't be uploaded. ${errorMessage(lastError)}`,
      );
    }
  };

  useImperativeHandle(ref, () => ({ add: () => void addPhotos() }));

  const confirmDelete = async (photo: PropertyPhoto) => {
    setViewing(null);
    const ok = await dialog.confirm({
      title: 'Delete this photo?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete photo',
      tone: 'danger',
      icon: 'delete',
    });
    if (!ok) return;
    deletePhoto.mutate(photo.id, {
      onSuccess: () => toast('Photo deleted'),
      onError: (err) =>
        void dialog.alert({
          title: "Couldn't delete the photo",
          message: errorMessage(err),
          tone: 'danger',
        }),
    });
  };

  return (
    <View style={styles.section}>
      {error ? <Banner message={error} /> : null}

      {photos.length === 0 && !upload ? (
        <Pressable onPress={addPhotos} style={styles.emptyTile} accessibilityRole="button">
          <Icon name="camera" size={26} color={accents.sky.fg} />
          <Text style={styles.emptyText}>Add photos of this property</Text>
        </Pressable>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
        >
          {photos.map((photo) => (
            <Pressable
              key={photo.id}
              onPress={() => setViewing(photo)}
              accessibilityRole="imagebutton"
              accessibilityLabel={photo.caption ?? 'Property photo'}
            >
              {photo.url ? (
                <Image
                  source={signedImage(photo.url)}
                  style={styles.thumb}
                  contentFit="cover"
                  transition={150}
                />
              ) : (
                <View style={[styles.thumb, styles.thumbMissing]}>
                  <Icon name="image" size={24} color={colors.textSubtle} />
                </View>
              )}
            </Pressable>
          ))}
          {upload ? (
            <View style={[styles.thumb, styles.uploading]}>
              <Text style={typography.caption}>
                {upload.index + 1}/{upload.total}
              </Text>
              <ProgressBar progress={upload.progress} />
            </View>
          ) : remaining > 0 ? (
            <Pressable
              onPress={addPhotos}
              style={[styles.thumb, styles.addTile]}
              accessibilityRole="button"
              accessibilityLabel="Add photos"
            >
              <Icon name="add" size={26} color={accents.sky.fg} />
            </Pressable>
          ) : null}
        </ScrollView>
      )}

      <Modal
        visible={viewing !== null}
        animationType="fade"
        onRequestClose={() => setViewing(null)}
        presentationStyle="fullScreen"
      >
        <SafeAreaView style={styles.viewer}>
          <View style={styles.viewerBar}>
            <Pressable onPress={() => setViewing(null)} hitSlop={12} accessibilityLabel="Close">
              <Icon name="close" size={26} color="#FFFFFF" />
            </Pressable>
          </View>
          {viewing?.url ? (
            <Image
              source={signedImage(viewing.url)}
              style={styles.viewerImage}
              contentFit="contain"
            />
          ) : null}
          <View style={styles.viewerActions}>
            <Button
              title="Delete photo"
              variant="danger"
              icon="delete"
              loading={deletePhoto.isPending}
              onPress={() => viewing && void confirmDelete(viewing)}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const THUMB = 104;

const styles = StyleSheet.create({
  section: { gap: space.md },
  strip: { gap: space.sm },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.md },
  thumbMissing: {
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploading: {
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
    padding: space.md,
    gap: space.sm,
  },
  addTile: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: accents.sky.fg,
    backgroundColor: accents.sky.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTile: {
    height: THUMB,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: accents.sky.fg,
    backgroundColor: accents.sky.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  emptyText: { fontSize: 14, fontWeight: '700', color: accents.sky.fg },
  viewer: { flex: 1, backgroundColor: '#000000' },
  viewerBar: { flexDirection: 'row', justifyContent: 'flex-end', padding: space.lg },
  viewerImage: { flex: 1 },
  viewerActions: { padding: space.lg },
});
