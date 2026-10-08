import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { dialog, toast } from '@/components/Dialog';
import { errorMessage } from '@/lib/errors';
import type {
  CreatePropertyInput,
  DocumentAnalysis,
  DraftProperty,
  LegalCheck,
  PittuState,
  Property,
  PropertyValue,
  WatchItem,
} from '@propittu/shared';
import { api } from './client';
import { keys } from './queries';

/**
 * Pittu (document reading). The app never decides anything: it starts a
 * reading, watches its status and sends what the customer confirmed. Only
 * used when GET /me says features.document_reading — otherwise the app
 * shows the normal flow and never mentions Pittu.
 */

const aiKeys = {
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
    // While Pittu is reading a deed, check back so Home updates by itself.
    refetchInterval: (q) =>
      q.state.data?.some((d) => d.status === 'queued' || d.status === 'reading') ? 5000 : false,
  });

/** Refreshes "Waiting for you" (a deed was added, or its reading moved on). */
export function useRefreshDrafts() {
  const qc = useQueryClient();
  return useCallback(() => void qc.invalidateQueries({ queryKey: aiKeys.drafts }), [qc]);
}

/**
 * Removes an unfinished deed set-up (the draft and its uploaded deed), and
 * refreshes "Waiting for you" so it disappears straight away.
 */
export function useRemoveDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/properties/${id}`, { method: 'DELETE' }),
    onSettled: () => void qc.invalidateQueries({ queryKey: aiKeys.drafts }),
  });
}

/** Asks first, then removes the draft. Resolves true once it is gone. */
export async function confirmRemoveDraft(
  remove: ReturnType<typeof useRemoveDraft>,
  id: string,
): Promise<boolean> {
  const ok = await dialog.confirm({
    title: 'Remove this unfinished property?',
    message: 'The uploaded sale deed is removed too. You can always add the property again.',
    confirmLabel: 'Remove',
    cancelLabel: 'Keep it',
    tone: 'danger',
  });
  if (!ok) return false;
  try {
    await remove.mutateAsync(id);
    toast('Removed');
    return true;
  } catch (err) {
    void dialog.alert({ title: 'Couldn’t remove it', message: errorMessage(err), tone: 'danger' });
    return false;
  }
}

/** PIN code, city and state of the deed's village — when the deed doesn't say. */
export const usePlaceSuggestion = (propertyId: string, enabled: boolean) =>
  useQuery({
    queryKey: ['properties', propertyId, 'place-suggestion'] as const,
    queryFn: () =>
      api<{
        pincode: string | null;
        city: string | null;
        state: string | null;
        near: string;
      } | null>(`/properties/${propertyId}/place-suggestion`),
    enabled,
    staleTime: Infinity,
    retry: false,
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

/* ---- Pittu Watch, Value and Legal (all checked by the team first) ---- */

/** News about the property's area that the team approved, newest first. */
export const usePropertyNews = (propertyId: string) =>
  useQuery({
    queryKey: ['properties', propertyId, 'news'] as const,
    queryFn: () => api<WatchItem[]>(`/properties/${propertyId}/watch`),
    staleTime: 10 * 60_000,
  });

/** What the owner paid and the government value today. */
export const usePropertyValue = (propertyId: string) =>
  useQuery({
    queryKey: ['properties', propertyId, 'value'] as const,
    queryFn: () => api<PropertyValue>(`/properties/${propertyId}/value`),
    staleTime: 10 * 60_000,
  });

/** Records checks the team has shared with the owner, newest first. */
export const useLegalChecks = (propertyId: string) =>
  useQuery({
    queryKey: ['properties', propertyId, 'legal-checks'] as const,
    queryFn: () => api<LegalCheck[]>(`/properties/${propertyId}/legal-checks`),
    staleTime: 10 * 60_000,
  });
