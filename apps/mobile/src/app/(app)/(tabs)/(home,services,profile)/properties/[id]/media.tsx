import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useProperty } from '@/api/queries';
import { PhotoSection } from '@/components/PhotoSection';
import { PullRefresh } from '@/components/PullRefresh';
import { ErrorState, LoadingState } from '@/components/States';
import { VideoSection } from '@/components/VideoSection';
import { ListGroup } from '@/components/ui';
import { space } from '@/theme';

/**
 * A property's photos and videos on one page — the shortcut from the Home
 * card's photo count and from the property page, like Documents.
 * Add, view and delete work here exactly as on the property page.
 */
export default function MediaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: property, isPending, error, refetch } = useProperty(id);

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<PullRefresh onRefresh={() => refetch()} />}
    >
      <Stack.Screen options={{ title: property.name }} />
      <ListGroup title={`Photos · ${property.photos.length}`} plain>
        <View style={styles.inner}>
          <PhotoSection propertyId={property.id} photos={property.photos} />
        </View>
      </ListGroup>
      <ListGroup title={`Videos · ${property.videos.length}`} plain>
        <View style={styles.inner}>
          <VideoSection propertyId={property.id} videos={property.videos} />
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
