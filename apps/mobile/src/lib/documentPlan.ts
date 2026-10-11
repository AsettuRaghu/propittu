import { useMemo } from 'react';
import {
  DOCUMENT_GROUPS,
  DOCUMENT_TYPE_LABELS,
  documentLabel,
  documentPlan,
  inBengaluruCity,
  type DocumentNeed,
  type DocumentType,
} from '@propittu/shared';
import { usePittu } from '@/api/ai';

/**
 * This property's document plan (shared rules: documents.ts) — which papers
 * matter for it and why, named the way its state names them — plus a
 * label for any other type. Undefined until Pittu's context has loaded.
 */
export function useDocumentPlan(propertyId: string) {
  const { data } = usePittu(propertyId);
  return useMemo(() => {
    if (!data) return undefined;
    const place = { state: data.context.state, bengaluru_city: inBengaluruCity(data.context) };
    const plan: DocumentNeed[] = documentPlan(data.context, data.answers);
    const label = (t: DocumentType) => documentLabel(t, place) || DOCUMENT_TYPE_LABELS[t];
    const groupOf = (t: DocumentType) => DOCUMENT_GROUPS.find((g) => g.types.includes(t))?.label;
    return { plan, label, groupOf };
  }, [data]);
}
