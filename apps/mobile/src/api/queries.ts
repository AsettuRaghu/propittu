import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  PincodeInfo,
  PropertyReach,
  AccountPlanState,
  CatalogueService,
  CreatePropertyInput,
  CreateServiceRequestInput,
  Me,
  Property,
  PropertyDetail,
  PropertyDocument,
  DocumentType,
  LocalHelp,
  UrgentKind,
  CareSchedule,
  DocumentShare,
  DocumentShareInput,
  Inbox,
  NameLink,
  PropertySummary,
  PublicPlan,
  ServiceRequest,
  ServiceRequestDetail,
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
    enabled: !!id,
  });

export const useDocuments = (propertyId: string) =>
  useQuery({
    queryKey: keys.documents(propertyId),
    queryFn: () => api<PropertyDocument[]>(`/properties/${propertyId}/documents`),
    // While Pittu reads a just-uploaded document, check back so its line appears.
    refetchInterval: (q) =>
      q.state.data?.some((d) => d.pittu?.status === 'reading') ? 4000 : false,
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

/** File a document under another type (e.g. Pittu says it's really the sale deed). */
export function useMoveDocument(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, type }: { id: string; type: DocumentType }) =>
      api<PropertyDocument>(`/documents/${id}`, { method: 'PATCH', body: { document_type: type } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.documents(propertyId) });
      void qc.invalidateQueries({ queryKey: keys.property(propertyId), exact: true });
    },
  });
}

/**
 * The owner confirms a name on a document is (or isn't) the deed's buyer;
 * Pittu re-checks every document in the account with it.
 */
export function useSaveNameLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (link: NameLink) => api<NameLink>('/name-links', { method: 'POST', body: link }),
    onSuccess: () =>
      void qc.invalidateQueries({
        predicate: (q) => q.queryKey[0] === 'properties' && q.queryKey[2] === 'documents',
      }),
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

/** Place, district and state for a PIN code, from India's PIN directory (null when not found). */
export const usePincode = (pin: string) =>
  useQuery({
    queryKey: ['pincode', pin],
    enabled: /^[1-9][0-9]{5}$/.test(pin),
    staleTime: Infinity,
    retry: false,
    queryFn: () => api<PincodeInfo>(`/pincodes/${pin}`).catch(() => null),
  });

/* ---- Documents sent by email ---- */

/** Documents sent by email: the owner's address and what's waiting to be filed. */
export const useEmailInbox = () =>
  useQuery({ queryKey: ['inbox'] as const, queryFn: () => api<Inbox>('/inbox') });

export function useFileInbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; property_id: string; document_type: DocumentType }) =>
      api<{ document_id: string }>(`/inbox/${v.id}/file`, {
        method: 'POST',
        body: { property_id: v.property_id, document_type: v.document_type },
      }),
    onSuccess: (_r, v) => {
      void qc.invalidateQueries({ queryKey: ['inbox'] });
      void qc.invalidateQueries({ queryKey: keys.documents(v.property_id) });
    },
  });
}

export function useDiscardInbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/inbox/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['inbox'] }),
  });
}

/* ---- Sharing documents safely ---- */

const sharesKey = (propertyId: string) => ['properties', propertyId, 'shares'] as const;

export const useShares = (propertyId: string) =>
  useQuery({
    queryKey: sharesKey(propertyId),
    queryFn: () => api<DocumentShare[]>(`/properties/${propertyId}/shares`),
  });

export function useCreateShare(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DocumentShareInput) =>
      api<{ id: string; url: string }>(`/properties/${propertyId}/shares`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: sharesKey(propertyId) }),
  });
}

export function useRevokeShare(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/shares/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: sharesKey(propertyId) }),
  });
}

/* ---- Care schedule ---- */

const careKey = (propertyId: string) => ['properties', propertyId, 'care'] as const;

export const useCareSchedules = (propertyId: string) =>
  useQuery({
    queryKey: careKey(propertyId),
    queryFn: () => api<CareSchedule[]>(`/properties/${propertyId}/care-schedules`),
  });

export function useCareMutations(propertyId: string) {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: careKey(propertyId) });
  return {
    add: useMutation({
      mutationFn: (input: { service_id: string; every_months: number; next_on: string }) =>
        api<CareSchedule>(`/properties/${propertyId}/care-schedules`, {
          method: 'POST',
          body: input,
        }),
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: ({ id, ...patch }: { id: string; active?: boolean }) =>
        api<CareSchedule>(`/care-schedules/${id}`, { method: 'PATCH', body: patch }),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api(`/care-schedules/${id}`, { method: 'DELETE' }),
      onSuccess: done,
    }),
  };
}

/* ---- Something's wrong at my property ---- */

export const useLocalHelp = (propertyId: string) =>
  useQuery({
    queryKey: ['properties', propertyId, 'local-help'] as const,
    queryFn: () => api<LocalHelp>(`/properties/${propertyId}/local-help`),
    staleTime: 24 * 3600_000,
  });

export function useSendUrgent(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { kind: UrgentKind; details: string }) =>
      api<ServiceRequest>(`/properties/${propertyId}/urgent`, { method: 'POST', body: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.serviceRequests }),
  });
}
