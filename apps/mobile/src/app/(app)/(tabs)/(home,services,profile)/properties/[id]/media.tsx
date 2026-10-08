import { Stack, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useProperty } from '@/api/queries';
import { dialog } from '@/components/Dialog';
import { PhotoSection, type PhotoSectionHandle } from '@/components/PhotoSection';
import { PropertyContext } from '@/components/PropertyContext';
import { PullRefresh } from '@/components/PullRefresh';
import { ErrorState, LoadingState } from '@/components/States';
import { VideoSection, type VideoSectionHandle } from '@/components/VideoSection';
import { IconButton, ListGroup } from '@/components/ui';
import { space } from '@/theme';

/**
 * A property's photos and videos on one page — same pattern as Documents:
 * the header names the page, + adds, and a quiet line says whose they are.
 */
export default function MediaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: property, isPending, error, refetch } = useProperty(id);
  const photos = useRef<PhotoSectionHandle>(null);
  const videos = useRef<VideoSectionHandle>(null);

  const add = async () => {
    const choice = await dialog.actions({
      title: 'Add to this property',
      actions: [
        { label: 'Photos', value: 'photo' as const, icon: 'camera' as const },
        { label: 'A video', value: 'video' as const, icon: 'video' as const },
      ],
    });
    if (!choice) return;
    if (choice === 'photo') photos.current?.add();
    else videos.current?.add();
  };

  const header = (
    <Stack.Screen
      options={{
        headerRight: () => (
          <IconButton
            icon="add"
            label="Add photos or a video"
            onPress={() => void add()}
            size={36}
          />
        ),
      }}
    />
  );
  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<PullRefresh onRefresh={() => refetch()} />}
    >
      {header}
      <PropertyContext propertyId={property.id} />
      <ListGroup title={`Photos · ${property.photos.length}`} plain>
        <View style={styles.inner}>
          <PhotoSection ref={photos} propertyId={property.id} photos={property.photos} />
        </View>
      </ListGroup>
      <ListGroup title={`Videos · ${property.videos.length}`} plain>
        <View style={styles.inner}>
          <VideoSection ref={videos} propertyId={property.id} videos={property.videos} />
        </View>
      </ListGroup>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.md, gap: space.xl, paddingBottom: space.xxl },
  // Same 14 pt inset as list rows, so content lines up under each heading.
  inner: { paddingHorizontal: 14, paddingVertical: space.xs },
});
