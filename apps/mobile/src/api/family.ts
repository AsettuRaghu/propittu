import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback } from 'react';
import type { AccountPeople, SaleReadyStep, SuccessionStep } from '@propittu/shared';
import { setCurrentAccount } from '@/lib/currentAccount';
import { api } from './client';
import { keys } from './queries';

const peopleKey = ['account', 'people'] as const;

/** Who can see the account, open invitations and nominees (owner only). */
export const usePeople = (enabled: boolean) =>
  useQuery({
    queryKey: peopleKey,
    queryFn: () => api<AccountPeople>('/account/people'),
    enabled,
  });

function useAccountMutation<T>(fn: (input: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: peopleKey });
      void qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

export const useInvite = () =>
  useAccountMutation((input: { name: string; phone: string; relation: string | null }) =>
    api<{ id: string }>('/account/invites', { method: 'POST', body: input }),
  );
export const useRevokeInvite = () =>
  useAccountMutation((id: string) => api(`/account/invites/${id}`, { method: 'DELETE' }));
export const useRemoveMember = () =>
  useAccountMutation((userId: string) => api(`/account/members/${userId}`, { method: 'DELETE' }));
export const useAddNominee = () =>
  useAccountMutation(
    (input: { name: string; relation: string | null; phone: string | null; note: string | null }) =>
      api<{ id: string }>('/account/nominees', { method: 'POST', body: input }),
  );
export const useRemoveNominee = () =>
  useAccountMutation((id: string) => api(`/account/nominees/${id}`, { method: 'DELETE' }));

/** Switches the app to another of the person's accounts (own or family's). */
export function useSwitchAccount() {
  const qc = useQueryClient();
  return useCallback(
    async (accountId: string) => {
      await setCurrentAccount(accountId);
      qc.clear();
      router.replace('/');
    },
    [qc],
  );
}

export function useAnswerInvite() {
  const switchTo = useSwitchAccount();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      api<{ account_id: string; accepted: boolean }>(`/me/invites/${id}`, {
        method: 'POST',
        body: { accept },
      }),
    onSuccess: (r) =>
      r.accepted ? void switchTo(r.account_id) : void qc.invalidateQueries({ queryKey: keys.me }),
  });
}

export function useLeaveAccount() {
  const switchTo = useSwitchAccount();
  return useMutation({
    mutationFn: (accountId: string) =>
      api('/account/leave', { method: 'POST', body: { account_id: accountId } }),
    onSuccess: async () => {
      await setCurrentAccount(null);
      void switchTo('');
    },
  });
}

/** "Ready for your family": what heirs would need for this property. */
export const useSuccession = (propertyId: string) =>
  useQuery({
    queryKey: ['properties', propertyId, 'succession'] as const,
    queryFn: () =>
      api<{ steps: SuccessionStep[]; done: number; process: string }>(
        `/properties/${propertyId}/succession`,
      ),
  });

/** Get sale-ready: what buyers and banks will ask for, and what's missing. */
export const useSaleReady = (propertyId: string) =>
  useQuery({
    queryKey: ['properties', propertyId, 'sale-ready'] as const,
    queryFn: () =>
      api<{ steps: SaleReadyStep[]; done: number; note: string | null }>(
        `/properties/${propertyId}/sale-ready`,
      ),
  });
