import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MAX_VIDEOS_PER_PROPERTY, formatFileSize, type PropertyVideo } from '@propittu/shared';
import { useDeleteVideo, useInvalidateProperty } from '@/api/queries';
import { playVideo, prepareVideo, uploadVideo } from '@/api/uploads';
import { errorMessage } from '@/lib/errors';
import { pickVideo } from '@/lib/pickPhotos';
import { accents, colors, radius, space, typography } from '@/theme';
import { dialog, toast } from './Dialog';
import { Icon } from './Icon';
import { Banner, ProgressBar } from './ui';

/** Property videos: add, play, delete (M3). */
export function VideoSection({
  propertyId,
  videos,
}: {
  propertyId: string;
  videos: PropertyVideo[];
}) {
  const invalidate = useInvalidateProperty();
  const deleteVideo = useDeleteVideo(propertyId);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canAdd = videos.length < MAX_VIDEOS_PER_PROPERTY;

  const addVideo = async () => {
    if (progress !== null || !canAdd) return;
    setError(null);
    const asset = await pickVideo();
    if (!asset) return;
    try {
      const file = prepareVideo(asset);
      setProgress(0);
      await uploadVideo(propertyId, file, setProgress);
      invalidate(propertyId);
    } catch (err) {
      setError(errorMessage(err, "The video couldn't be uploaded. Please try again."));
    } finally {
      setProgress(null);
    }
  };

  const openActions = async (video: PropertyVideo) => {
    const choice = await dialog.actions({
      title: 'Video',
      actions: [
        { label: 'Play', value: 'play' as const, icon: 'play' },
        { label: 'Delete video', value: 'delete' as const, icon: 'delete', tone: 'danger' },
      ],
    });
    if (choice === 'play') {
      await playVideo(video).catch((err) =>
        dialog.alert({
          title: "Couldn't play the video",
          message: errorMessage(err),
          tone: 'danger',
        }),
      );
    } else if (choice === 'delete') {
      deleteVideo.mutate(video.id, {
        onSuccess: () => toast('Video deleted'),
        onError: (err) =>
          void dialog.alert({
            title: "Couldn't delete the video",
            message: errorMessage(err),
            tone: 'danger',
          }),
      });
    }
  };

  return (
    <View style={styles.section}>
      {error ? <Banner message={error} /> : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        {videos.map((video) => (
          <Pressable
            key={video.id}
            onPress={() => void openActions(video)}
            style={[styles.tile, styles.videoTile]}
            accessibilityRole="button"
            accessibilityLabel="Property video"
          >
            <Icon name="play-circle" size={34} color={colors.onPrimary} />
            <Text style={styles.meta}>
              {video.duration_seconds ? `${Math.round(video.duration_seconds)}s · ` : ''}
              {formatFileSize(video.file_size)}
            </Text>
          </Pressable>
        ))}
        {progress !== null ? (
          <View style={[styles.tile, styles.uploading]}>
            <Text style={typography.caption}>Uploading {Math.round(progress * 100)}%</Text>
            <ProgressBar progress={progress} />
          </View>
        ) : canAdd ? (
          <Pressable
            onPress={addVideo}
            style={[styles.tile, styles.addTile]}
            accessibilityRole="button"
            accessibilityLabel="Add a video"
          >
            <Icon name="video" size={24} color={accents.rose.fg} />
            <Text style={styles.addText}>Add video</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const TILE = 104;

const styles = StyleSheet.create({
  section: { gap: space.sm },
  strip: { gap: space.sm },
  tile: { width: TILE, height: TILE, borderRadius: radius.md },
  videoTile: {
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  meta: { fontSize: 11, color: colors.onPrimary },
  uploading: {
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
    padding: space.md,
    gap: space.sm,
  },
  addTile: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: accents.rose.fg,
    backgroundColor: accents.rose.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addText: { fontSize: 13, fontWeight: '700', color: accents.rose.fg },
});
