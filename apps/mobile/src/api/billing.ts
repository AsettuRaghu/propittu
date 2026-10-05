import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { AppState, Platform } from 'react-native';
import type { BackofficeOrder, CheckoutSession, Order } from '@propittu/shared';
import { api } from './client';

/**
 * Payments (M7). The app opens the provider's hosted page (UPI / cards) and
 * then asks the API for the order status. The API decides "paid" from the
 * provider's signed webhook or its own server-to-server check — never from
 * anything the app says.
 */

export const billingKeys = {
  orders: ['billing', 'orders'] as const,
  boPayments: ['backoffice', 'payments'] as const,
};

export const useOrders = () =>
  useQuery({ queryKey: billingKeys.orders, queryFn: () => api<Order[]>('/billing/orders') });

export const useBoPayments = () =>
  useQuery({
    queryKey: billingKeys.boPayments,
    queryFn: () => api<BackofficeOrder[]>('/backoffice/payments'),
    staleTime: 0,
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Android's custom tab returns immediately; wait until the app is back in front. */
function backInForeground(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  return new Promise((resolve) => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        sub.remove();
        resolve();
      }
    });
  });
}

/** Opens the payment page, then polls the order until it is paid (or we give up). */
async function payInBrowser(session: CheckoutSession): Promise<Order> {
  await WebBrowser.openBrowserAsync(session.checkout_url, {
    dismissButtonStyle: 'done',
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
  });
  await backInForeground();
  let order = session.order;
  for (let attempt = 0; attempt < 6; attempt++) {
    order = await api<Order>(`/billing/orders/${session.order.id}/refresh`, { method: 'POST' });
    if (order.status === 'paid') return order;
    await sleep(2000);
  }
  return order;
}

function useRefreshAfterPayment() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['me'] });
    void qc.invalidateQueries({ queryKey: ['account-plan'] });
    void qc.invalidateQueries({ queryKey: ['billing'] });
    void qc.invalidateQueries({ queryKey: ['service-requests'] });
    void qc.invalidateQueries({ queryKey: ['services'] });
  };
}

export function usePlanCheckout() {
  const refresh = useRefreshAfterPayment();
  return useMutation({
    mutationFn: async (planCode: string) =>
      payInBrowser(
        await api<CheckoutSession>('/billing/checkout', {
          method: 'POST',
          body: { plan_code: planCode },
        }),
      ),
    onSettled: refresh,
  });
}

export function useServiceCheckout(requestId: string) {
  const refresh = useRefreshAfterPayment();
  return useMutation({
    mutationFn: async () =>
      payInBrowser(
        await api<CheckoutSession>(`/billing/service-requests/${requestId}/checkout`, {
          method: 'POST',
        }),
      ),
    onSettled: refresh,
  });
}
