import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  PropertyReach,
  AccountPlanState,
  CatalogueService,
  CreatePropertyInput,
  CreateServiceRequestInput,
  Me,
  Property,
  PropertyDetail,
  PropertyDocument,
  PropertySummary,
  PublicPlan,
  ServiceRequest,
  ServiceRequestDetail,
  UpdateDocumentInput,
  UpdatePropertyInput,
} from '@propittu/shared';
import { api } from './client';

/**
 * Every server read and write in the app. Screens never call api() for
 * data directly, so caching and invalidation live in exactly one place.
 */

export const keys = {
  me: ['me'] as const,
  properties: ['properties'] as const,
  property: (id: string) => ['properties', id] as const,
  documents: (propertyId: string) => ['properties', propertyId, 'documents'] as const,
  services: ['services'] as const,
  serviceRequests: ['service-requests'] as const,
  serviceRequestsFor: (propertyId: string) => ['service-requests', { propertyId }] as const,
  serviceRequest: (id: string) => ['service-requests', id] as const,
  plans: ['plans'] as const,
  accountPlan: ['account-plan'] as const,
};

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api<Me>('/me') });

export const useProperties = (enabled = true) =>
  useQuery({
    queryKey: keys.properties,
    queryFn: () => api<PropertySummary[]>('/properties'),
    enabled,
  });

/* Plans (M5/M6) — available even in Limited Access. */
export const usePlans = () =>
  useQuery({
    queryKey: keys.plans,
    queryFn: () => api<PublicPlan[]>('/plans'),
    staleTime: 60 * 60 * 1000,
  });

export const useAccountPlan = () =>
  useQuery({
    queryKey: keys.accountPlan,
    queryFn: () => api<AccountPlanState>('/account/plan'),
    staleTime: 0, // Usage changes with every upload.
  });

export const useProperty = (id: string) =>
  useQuery({
    queryKey: keys.property(id),
    queryFn: () => api<PropertyDetail>(`/properties/${id}`),
  });

export const useDocuments = (propertyId: string) =>
  useQuery({
    queryKey: keys.documents(propertyId),
    queryFn: () => api<PropertyDocument[]>(`/properties/${propertyId}/documents`),
  });

export const useServices = (enabled = true) =>
  useQuery({
    enabled,
    queryKey: keys.services,
    // Included/Extra depends on the Plan and usage, so it is not cached long.
    queryFn: () => api<CatalogueService[]>('/services'),
  });

export const useServiceRequests = (propertyId?: string) =>
  useQuery({
    queryKey: propertyId ? keys.serviceRequestsFor(propertyId) : keys.serviceRequests,
    queryFn: () =>
      api<ServiceRequest[]>(
        propertyId ? `/service-requests?property_id=${propertyId}` : '/service-requests',
      ),
  });

export const useServiceRequest = (id: string) =>
  useQuery({
    queryKey: keys.serviceRequest(id),
    queryFn: () => api<ServiceRequestDetail>(`/service-requests/${id}`),
  });

export function useCancelServiceRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<ServiceRequestDetail>(`/service-requests/${id}/cancel`, { method: 'POST' }),
    onSuccess: (request) => {
      qc.setQueryData(keys.serviceRequest(id), request);
      void qc.invalidateQueries({ queryKey: keys.serviceRequests });
      void qc.invalidateQueries({ queryKey: keys.services });
      void qc.invalidateQueries({ queryKey: keys.accountPlan });
    },
  });
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

export function useCreateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePropertyInput) =>
      api<Property>('/properties', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.properties });
      void qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

export function useUpdateProperty(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePropertyInput) =>
      api<Property>(`/properties/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      // Prefix match: the list, this property and its documents.
      void qc.invalidateQueries({ queryKey: keys.properties });
      void qc.invalidateQueries({ queryKey: keys.serviceRequests });
    },
  });
}

export function useDeleteProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/properties/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: keys.property(id) });
      void qc.invalidateQueries({ queryKey: keys.properties });
      void qc.invalidateQueries({ queryKey: keys.serviceRequests });
      void qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

export function useDeleteDocument(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => api<void>(`/documents/${documentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.documents(propertyId) });
      void qc.invalidateQueries({ queryKey: keys.property(propertyId), exact: true });
      void qc.invalidateQueries({ queryKey: keys.properties, exact: true });
    },
  });
}

export function useUpdateDocument(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDocumentInput }) =>
      api<PropertyDocument>(`/documents/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.documents(propertyId) });
      void qc.invalidateQueries({ queryKey: keys.property(propertyId), exact: true });
    },
  });
}

export function useDeleteVideo(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (videoId: string) => api<void>(`/videos/${videoId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.property(propertyId), exact: true });
      void qc.invalidateQueries({ queryKey: keys.properties, exact: true });
    },
  });
}

export function useDeletePhoto(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) => api<void>(`/photos/${photoId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.property(propertyId), exact: true });
      void qc.invalidateQueries({ queryKey: keys.properties, exact: true });
    },
  });
}

export function useCreateServiceRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateServiceRequestInput) =>
      api<ServiceRequestDetail>('/service-requests', { method: 'POST', body: input }),
    onSuccess: (request) => {
      qc.setQueryData(keys.serviceRequest(request.id), request);
      void qc.invalidateQueries({ queryKey: keys.services });
      void qc.invalidateQueries({ queryKey: keys.accountPlan });
      void qc.invalidateQueries({ queryKey: keys.serviceRequests });
      void qc.invalidateQueries({ queryKey: keys.properties });
      void qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

/** "Tell me when you arrive" for a property our team cannot visit yet. */
export function useReachInterest(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<PropertyReach | null>(`/properties/${propertyId}/reach-interest`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.property(propertyId), exact: true });
      void qc.invalidateQueries({ queryKey: keys.properties, exact: true });
    },
  });
}

/** After an upload finishes, refresh everything that shows counts or photos. */
export function useInvalidateProperty() {
  const qc = useQueryClient();
  return (propertyId: string) => {
    void qc.invalidateQueries({ queryKey: keys.documents(propertyId) });
    void qc.invalidateQueries({ queryKey: keys.property(propertyId), exact: true });
    void qc.invalidateQueries({ queryKey: keys.properties, exact: true });
  };
}
