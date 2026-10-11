import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { usePittu } from '@/api/ai';
import { PropertyContext } from '@/components/PropertyContext';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { TitleTimeline } from '@/components/TitleTimeline';
import { space, typography } from '@/theme';

/**
 * The property's story: who owned it before, and how it came to the owner,
 * exactly as the sale deed recites it. Nothing here is checked against
 * government records — that's the records check.
 */
export default function PropertyHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending, error, refetch } = usePittu(id);
  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  const events = data.story?.history ?? [];
  if (!events.length) {
    return (
      <EmptyState
        icon="deed"
        title="No history in the deed"
        message="This sale deed doesn’t tell the story of earlier owners."
      />
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <PropertyContext propertyId={id} />
      <TitleTimeline events={events} />
      <Text style={typography.caption}>
        As your sale deed tells it. Earlier deeds and the Encumbrance Certificate can confirm each
        step.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.xs, gap: space.lg, paddingBottom: space.xxl },
});
