import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AccountPlanState,
  AiSummary,
  StaffPropertyReach,
  PropertyReview,
  PropertyReviewStatus,
  ReviewListItem,
  AuditEntry,
  BackofficeAccount,
  BackofficeAccountDetail,
  BackofficeProperty,
  BackofficeRequest,
  BackofficeRequestDetail,
  DocumentStatus,
  OutcomeInput,
  PropertyDocument,
  PropertySlot,
  ServiceFulfilment,
  StaffRequestUpdateInput,
  StaffService,
  UpdateServiceInput,
  VisitReportInput,
} from '@propittu/shared';
import { api } from './client';

/**
 * Backoffice (M9) reads and writes. Only staff can reach these routes;
 * for anyone else the API answers 404.
 */

export type RequestFilter = 'open' | 'all' | 'requested' | 'completed' | 'cancelled';

export const boKeys = {
  all: ['backoffice'] as const,
  requests: (filter: RequestFilter) => ['backoffice', 'requests', filter] as const,
  request: (id: string) => ['backoffice', 'request', id] as const,
  accounts: (q: string) => ['backoffice', 'accounts', q] as const,
  account: (id: string) => ['backoffice', 'account', id] as const,
  property: (id: string) => ['backoffice', 'property', id] as const,
  services: ['backoffice', 'services'] as const,
};

export const useBoRequests = (filter: RequestFilter) =>
  useQuery({
    queryKey: boKeys.requests(filter),
    queryFn: () => api<BackofficeRequest[]>(`/backoffice/requests?status=${filter}`),
    staleTime: 0,
  });

export const useBoRequest = (id: string) =>
  useQuery({
    queryKey: boKeys.request(id),
    queryFn: () => api<BackofficeRequestDetail>(`/backoffice/requests/${id}`),
    staleTime: 0,
  });

export const useBoAccounts = (q: string) =>
  useQuery({
    queryKey: boKeys.accounts(q),
    queryFn: () => api<BackofficeAccount[]>(`/backoffice/accounts?q=${encodeURIComponent(q)}`),
  });

export const useBoAccount = (id: string) =>
  useQuery({
    queryKey: boKeys.account(id),
    queryFn: () => api<BackofficeAccountDetail>(`/backoffice/accounts/${id}`),
    staleTime: 0,
  });

export const useBoActivity = (accountId: string, kind: 'events' | 'changes') =>
  useQuery({
    queryKey: ['backoffice', 'activity', accountId, kind],
    queryFn: () => api<AuditEntry[]>(`/backoffice/accounts/${accountId}/activity?kind=${kind}`),
    staleTime: 0,
  });

export const useBoSlots = (accountId: string) =>
  useQuery({
    queryKey: ['backoffice', 'slots', accountId],
    queryFn: () => api<PropertySlot[]>(`/backoffice/accounts/${accountId}/slots`),
    staleTime: 0,
  });

export function useBoReleaseSlot() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ slotId, reason }: { slotId: string; reason: string }) =>
      api<{ released: boolean }>(`/backoffice/slots/${slotId}/release`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: refresh,
  });
}

export const useBoProperty = (id: string) =>
  useQuery({
    queryKey: boKeys.property(id),
    queryFn: () => api<BackofficeProperty>(`/backoffice/properties/${id}`),
  });

/* ---- Where we serve: per-property exceptions (coverage itself is managed in the web portal) ---- */

export function useBoReachException(propertyId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (reason: string | null) =>
      api<StaffPropertyReach | null>(`/backoffice/properties/${propertyId}/reach-exception`, {
        method: reason === null ? 'DELETE' : 'POST',
        body: reason === null ? undefined : { reason },
      }),
    onSuccess: refresh,
  });
}

/* ---- Pittu (AI): usage, cost, failures, Review list ---- */

export const useBoAiSummary = () =>
  useQuery({
    queryKey: ['backoffice', 'ai', 'summary'],
    queryFn: () => api<AiSummary>('/backoffice/ai/summary'),
  });

export const useBoReviews = (status: PropertyReviewStatus) =>
  useQuery({
    queryKey: ['backoffice', 'ai', 'reviews', status],
    queryFn: () => api<ReviewListItem[]>(`/backoffice/ai/reviews?status=${status}`),
  });

export function useBoRetryReading() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (analysisId: string) =>
      api<{ queued: boolean }>(`/backoffice/ai/analyses/${analysisId}/retry`, { method: 'POST' }),
    onSuccess: refresh,
  });
}

export function useBoReviewDecision(propertyId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: { status: PropertyReviewStatus; note?: string }) =>
      api<PropertyReview>(`/backoffice/properties/${propertyId}/review`, {
        method: 'POST',
        body,
      }),
    onSuccess: refresh,
  });
}

export const useBoServices = () =>
  useQuery({
    queryKey: boKeys.services,
    queryFn: () => api<StaffService[]>('/backoffice/services'),
  });

/* ------------------------------------------------------------------ *
 * Writes — each refreshes the Backoffice views and the staff member's
 * own customer views (the same data may appear in both).
 * ------------------------------------------------------------------ */

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: boKeys.all });
    void qc.invalidateQueries({ queryKey: ['service-requests'] });
    void qc.invalidateQueries({ queryKey: ['services'] });
  };
}

export function useBoUpdateRequest(id: string) {
  const qc = useQueryClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: StaffRequestUpdateInput) =>
      api<BackofficeRequestDetail>(`/backoffice/requests/${id}/status`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: (detail) => {
      qc.setQueryData(boKeys.request(id), detail);
      refresh();
    },
  });
}

export function useBoSaveReport(id: string) {
  const qc = useQueryClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: VisitReportInput) =>
      api<BackofficeRequestDetail>(`/backoffice/requests/${id}/report`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: (detail) => {
      qc.setQueryData(boKeys.request(id), detail);
      refresh();
    },
  });
}

/** Shared shape for request mutations that answer with the fresh detail. */
/** Set or change the quote of an extra service request. */
export const useBoSetRequestPrice = (id: string) =>
  useRequestMutation(id, (price_paise: number) =>
    api<BackofficeRequestDetail>(`/backoffice/requests/${id}/price`, {
      method: 'POST',
      body: { price_paise },
    }),
  );

function useRequestMutation<T>(id: string, fn: (input: T) => Promise<BackofficeRequestDetail>) {
  const qc = useQueryClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: fn,
    onSuccess: (detail) => {
      qc.setQueryData(boKeys.request(id), detail);
      refresh();
    },
  });
}

/** "Need info from you": asks in the request's support thread. */
export const useBoAskCustomer = (id: string) =>
  useRequestMutation(id, (message: string) =>
    api<BackofficeRequestDetail>(`/backoffice/requests/${id}/ask`, {
      method: 'POST',
      body: { message },
    }),
  );

export const useBoSetFulfilment = (id: string) =>
  useRequestMutation(id, (fulfilment: ServiceFulfilment) =>
    api<BackofficeRequestDetail>(`/backoffice/requests/${id}/fulfilment`, {
      method: 'POST',
      body: { fulfilment },
    }),
  );

export const useBoSaveOutcome = (id: string) =>
  useRequestMutation(id, (input: OutcomeInput) =>
    api<BackofficeRequestDetail>(`/backoffice/requests/${id}/outcome`, {
      method: 'PUT',
      body: input,
    }),
  );

export function useBoDeleteOutcomeFile(requestId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (fileId: string) =>
      api<void>(`/backoffice/requests/${requestId}/outcome/files/${fileId}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
}

export function useBoDeleteMedia(requestId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (mediaId: string) =>
      api<void>(`/backoffice/requests/${requestId}/report/media/${mediaId}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
}

export function useBoAccountStatus(accountId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (status: 'active' | 'suspended') =>
      api<BackofficeAccount>(`/backoffice/accounts/${accountId}/status`, {
        method: 'POST',
        body: { status },
      }),
    onSuccess: refresh,
  });
}

export function useBoGrantPlan(accountId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: { plan_code: string; days?: number }) =>
      api<AccountPlanState>(`/backoffice/accounts/${accountId}/plan`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: refresh,
  });
}

/** Adds days to whatever is in force (a paid plan stays paid). */
export function useBoExtendPlan(accountId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (days: number) =>
      api<AccountPlanState>(`/backoffice/accounts/${accountId}/plan/extend`, {
        method: 'POST',
        body: { days },
      }),
    onSuccess: refresh,
  });
}

export function useBoEndPlan(accountId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: () =>
      api<AccountPlanState>(`/backoffice/accounts/${accountId}/plan/end`, { method: 'POST' }),
    onSuccess: refresh,
  });
}

export function useBoDocumentStatus() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: DocumentStatus }) =>
      api<PropertyDocument>(`/backoffice/documents/${id}/status`, {
        method: 'POST',
        body: { status },
      }),
    onSuccess: refresh,
  });
}

export function useBoUpdateService(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: UpdateServiceInput) =>
      api<StaffService>(`/backoffice/services/${id}`, { method: 'PATCH', body: input }),
    onSuccess: refresh,
  });
}
