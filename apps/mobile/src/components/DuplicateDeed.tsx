import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRemoveDraft } from '@/api/ai';
import { accents, space, typography } from '@/theme';
import { Footer } from './Footer';
import { Icon } from './Icon';
import { Button } from './ui';

/**
 * Pittu recognised this deed: it's already with a property in the locker
 * (same file, or the same registration number) — so nothing was spent
 * reading it again. Open that property (this attempt is cleared away), or
 * add it as a separate property if it really is a different one.
 */
export function DuplicateDeed({
  draftId,
  existing,
  onAddAnyway,
}: {
  draftId: string;
  existing: { id: string; name: string };
  onAddAnyway: () => void;
}) {
  const remove = useRemoveDraft();
  const busy = remove.isPending;
  // This attempt isn't needed: clear it, then show the property it belongs to.
  const openExisting = async () => {
    await remove.mutateAsync(draftId).catch(() => undefined);
    router.dismissTo('/');
    router.push(`/properties/${existing.id}`);
  };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.icon}>
          <Icon name="deed" size={40} color={accents.violet.fg} strokeWidth={1.7} />
        </View>
        <View style={styles.head}>
          <Text style={[typography.title, styles.center]}>Already in your locker</Text>
          <Text style={[typography.body, styles.center]}>
            This is the same sale deed as <Text style={styles.strong}>{existing.name}</Text>, so
            there’s nothing new to add.
          </Text>
          <Text style={[typography.small, styles.center]}>
            If it really is a different property, you can still add it separately.
          </Text>
        </View>
      </ScrollView>
      <Footer>
        <Button
          title={`Open ${existing.name}`}
          onPress={() => void openExisting()}
          loading={busy}
        />
        <Button
          title="Add as a new property"
          variant="ghost"
          onPress={onAddAnyway}
          disabled={busy}
        />
      </Footer>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  strong: { fontWeight: '800' },
  content: { padding: space.xl, paddingTop: 56, gap: space.xl },
  head: { gap: space.sm },
  icon: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: accents.violet.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
