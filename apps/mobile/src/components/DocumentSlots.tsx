import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPES, type DocumentType } from '@propittu/shared';
import { useDocuments } from '@/api/queries';
import { DOCUMENT_TYPE_VISUALS } from '@/lib/icons';
import { Button, ListGroup, ListRow } from './ui';

/**
 * One row per document type: what's added, and an Upload button for what
 * isn't. A filled row opens the property's documents; an empty one uploads
 * straight into that type. Owners see at a glance what is still missing.
 */
export function DocumentSlots({
  propertyId,
  action,
}: {
  propertyId: string;
  /** On the right of the "Documents" heading (e.g. "All documents"). */
  action?: ReactNode;
}) {
  const { data } = useDocuments(propertyId);
  const counts = new Map<DocumentType, number>();
  for (const d of data ?? []) counts.set(d.document_type, (counts.get(d.document_type) ?? 0) + 1);

  const upload = (type: DocumentType) =>
    router.push({ pathname: '/properties/[id]/add-document', params: { id: propertyId, type } });

  const rows = DOCUMENT_TYPES.map((type) => {
    const count = counts.get(type) ?? 0;
    const v = DOCUMENT_TYPE_VISUALS[type];
    return (
      <ListRow
        key={type}
        icon={v.icon}
        accent={v.accent}
        title={DOCUMENT_TYPE_LABELS[type]}
        subtitle={count === 0 ? 'Not added yet' : count === 1 ? 'Added' : `${count} added`}
        right={
          count === 0 ? (
            <Button title="Upload" size="sm" variant="secondary" onPress={() => upload(type)} />
          ) : undefined
        }
        showChevron={count > 0}
        onPress={() =>
          count > 0 ? router.push(`/properties/${propertyId}/documents`) : upload(type)
        }
      />
    );
  });
  return (
    <ListGroup title="Documents" plain action={action}>
      {rows}
    </ListGroup>
  );
}
