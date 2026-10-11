import { router } from 'expo-router';
import type { ReactNode } from 'react';
import type { DocumentType } from '@propittu/shared';
import { useDocuments } from '@/api/queries';
import { useDocumentPlan } from '@/lib/documentPlan';
import { DOCUMENT_TYPE_VISUALS } from '@/lib/icons';
import { Button, ListGroup, ListRow } from './ui';

/**
 * The property's file: the key documents for THIS property (a flat, a plot,
 * a house; its state; rented or not), each with why it matters and an
 * Upload button while missing — then, folded away, the others worth keeping
 * and anything else already added. Named the way the state names them.
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
  const docs = useDocumentPlan(propertyId);
  if (!docs) return null;
  const counts = new Map<DocumentType, number>();
  for (const d of data ?? []) counts.set(d.document_type, (counts.get(d.document_type) ?? 0) + 1);

  const upload = (type: DocumentType) =>
    router.push({ pathname: '/properties/[id]/add-document', params: { id: propertyId, type } });

  const row = (type: DocumentType, why: string | null) => {
    const count = counts.get(type) ?? 0;
    const v = DOCUMENT_TYPE_VISUALS[type];
    return (
      <ListRow
        key={type}
        icon={v.icon}
        accent={v.accent}
        title={docs.label(type)}
        subtitle={count === 0 ? (why ?? 'Not added yet') : count === 1 ? 'Added' : `${count} added`}
        subtitleLines={2}
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
  };

  const key = docs.plan.filter((d) => d.key);
  const planned = new Set(docs.plan.map((d) => d.type));
  const others = [
    ...docs.plan.filter((d) => !d.key).map((d) => ({ type: d.type, why: d.why })),
    ...[...counts.keys()].filter((t) => !planned.has(t)).map((type) => ({ type, why: null })),
  ];
  const haveKey = key.filter((d) => counts.has(d.type)).length;
  const haveOthers = others.filter((d) => counts.has(d.type)).length;

  return (
    <>
      <ListGroup title={`Documents · ${haveKey} of ${key.length}`} plain action={action}>
        {key.map((d) => row(d.type, d.why))}
      </ListGroup>
      {others.length ? (
        <ListGroup
          title={`Also worth keeping${haveOthers ? ` · ${haveOthers} added` : ''}`}
          plain
          collapsible
          initiallyOpen={false}
        >
          {others.map((d) => row(d.type, d.why))}
        </ListGroup>
      ) : null}
    </>
  );
}
