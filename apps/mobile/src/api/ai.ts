import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePropertyInput,
  DocumentAnalysis,
  DraftProperty,
  PittuState,
  Property,
} from '@propittu/shared';
import { api } from './client';
import { keys } from './queries';

/**
 * Pittu (document reading). The app never decides anything: it starts a
 * reading, watches its status and sends what the customer confirmed. Only
 * used when GET /me says features.document_reading — otherwise the app
 * shows the normal flow and never mentions Pittu.
 */

export const aiKeys = {
  analysis: (documentId: string) => ['analysis', documentId] as const,
  drafts: ['properties', 'drafts'] as const,
};

/** Creates the placeholder property the deed is stored against. */
export const createDraftProperty = () => api<Property>('/properties/draft', { method: 'POST' });

/** Starts (or returns the saved) reading of a document. */
export const startAnalysis = (documentId: string) =>
  api<DocumentAnalysis>(`/documents/${documentId}/analysis`, { method: 'POST' });

/** Reading status; checks every 3 s while Pittu is still reading. */
export const useAnalysis = (documentId: string | undefined) =>
  useQuery({
    queryKey: aiKeys.analysis(documentId ?? ''),
    queryFn: () => api<DocumentAnalysis>(`/documents/${documentId}/analysis`),
    enabled: !!documentId,
    staleTime: 0,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'queued' || s === 'reading' ? 3000 : false;
    },
  });

export const useDraftProperties = (enabled = true) =>
  useQuery({
    queryKey: aiKeys.drafts,
    queryFn: () => api<DraftProperty[]>('/properties/drafts'),
    enabled,
  });

/** The customer confirms: the draft becomes a real property. */
export function useFinishSetup(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { property: CreatePropertyInput; analysis_id: string | null }) =>
      api<Property>(`/properties/${propertyId}/setup`, { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.properties });
      void qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

/* ---- Pittu guided setup ---- */

export const pittuKey = (propertyId: string) => ['properties', propertyId, 'pittu'] as const;

export const usePittu = (propertyId: string) =>
  useQuery({
    queryKey: pittuKey(propertyId),
    queryFn: () => api<PittuState>(`/properties/${propertyId}/pittu`),
    staleTime: 0,
  });

export function useAnswerPittu(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ question, answer }: { question: string; answer: string }) =>
      api<PittuState>(`/properties/${propertyId}/pittu/answers/${question}`, {
        method: 'PUT',
        body: { answer },
      }),
    onSuccess: (state) => qc.setQueryData(pittuKey(propertyId), state),
  });
}
