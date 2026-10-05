import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MAX_VIDEOS_PER_PROPERTY, formatFileSize, type PropertyVideo } from '@propittu/shared';
import { useDeleteVideo, useInvalidateProperty } from '@/api/queries';
import { playVideo, prepareVideo, uploadVideo } from '@/api/uploads';
import { errorMessage } from '@/lib/errors';
import { pickVideo } from '@/lib/pickPhotos';
import { colors, radius, space, typography } from '@/theme';
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

  const openActions = (video: PropertyVideo) => {
    Alert.alert('Video', undefined, [
      {
        text: 'Play',
        onPress: () =>
          void playVideo(video).catch((err) =>
            Alert.alert("Couldn't play the video", errorMessage(err)),
          ),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deleteVideo.mutate(video.id, {
            onError: (err) => Alert.alert("Couldn't delete the video", errorMessage(err)),
          }),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
            onPress={() => openActions(video)}
            style={[styles.tile, styles.videoTile]}
            accessibilityRole="button"
            accessibilityLabel="Property video"
          >
            <Ionicons name="play-circle" size={36} color={colors.onPrimary} />
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
            <Ionicons name="videocam-outline" size={26} color={colors.primary} />
            <Text style={styles.addText}>Add video</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <Text style={typography.caption}>Up to 60 seconds and 50 MB per video.</Text>
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
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addText: { fontSize: 13, fontWeight: '600', color: colors.primary },
});
