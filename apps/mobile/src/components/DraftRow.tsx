import { router } from 'expo-router';
import type { DraftProperty } from '@propittu/shared';
import { confirmRemoveDraft, useRemoveDraft } from '@/api/ai';
import { IconButton, ListRow } from './ui';

/** One waiting deed, named the way Pittu read it, picking up where it was left. */
/* Used on Home ("Waiting for you") and on the Add property start screen. */
export function DraftRow({ draft: d }: { draft: DraftProperty }) {
  const remove = useRemoveDraft();
  const open = () =>
    router.push({
      pathname: '/properties/[id]/setup',
      params: { id: d.id, doc: d.document_id ?? '' },
    });
  const { accent, title, subtitle } = d.duplicate_of
    ? {
        accent: 'violet' as const,
        title: `Already in your locker: ${d.duplicate_of.name}`,
        subtitle: 'Same sale deed — open it, or add it as a new property',
      }
    : d.status === 'ready'
      ? {
          accent: 'teal' as const,
          title: d.name ?? 'Your new property',
          subtitle: 'Pittu has read your deed — check the details and save',
        }
      : d.status === 'failed'
        ? {
            accent: 'amber' as const,
            title: 'Pittu couldn’t read this deed',
            subtitle: 'Fill in the details yourself — it’s quick',
          }
        : {
            accent: 'indigo' as const,
            title: 'Pittu is reading your deed…',
            subtitle: 'It’ll be ready here in a minute',
          };
  return (
    <ListRow
      icon="deed"
      accent={accent}
      title={title}
      subtitle={subtitle}
      subtitleLines={2}
      onPress={open}
      showChevron={false}
      right={
        <IconButton
          icon="close"
          label="Remove this unfinished property"
          variant="plain"
          size={32}
          onPress={() => void confirmRemoveDraft(remove, d.id)}
        />
      }
    />
  );
}
