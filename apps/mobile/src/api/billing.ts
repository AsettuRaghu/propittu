import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { AppState, Platform } from 'react-native';
import type {
  BackofficeOrder,
  CheckedOrder,
  CheckoutSession,
  Order,
  PlanQuote,
} from '@propittu/shared';
import { dialog, toast } from '@/components/Dialog';
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

/** Price, upgrade credit and the period buying this plan now would give. */
export const fetchPlanQuote = (planCode: string) =>
  api<PlanQuote>(`/billing/quote?plan_code=${encodeURIComponent(planCode)}`);

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

/**
 * Opens the payment page; when the customer is back, asks the API where the
 * checkout stands. Nothing attempted → the order is closed at once ("Not
 * completed"); a payment in progress → a few short checks for the capture.
 */
async function payInBrowser(session: CheckoutSession): Promise<CheckedOrder> {
  await WebBrowser.openBrowserAsync(session.checkout_url, {
    dismissButtonStyle: 'done',
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
  });
  await backInForeground();
  const path = `/billing/orders/${session.order.id}`;
  let order = await api<CheckedOrder>(`${path}/refresh`, { method: 'POST' });
  if (order.checkout_state === 'not_started') {
    return api<CheckedOrder>(`${path}/abandon`, { method: 'POST' });
  }
  for (let attempt = 0; attempt < 4 && order.checkout_state === 'in_progress'; attempt++) {
    await sleep(2000);
    order = await api<CheckedOrder>(`${path}/refresh`, { method: 'POST' });
  }
  return order;
}

/** What to tell the customer once they are back from the payment page. */
export function showPaymentOutcome(order: CheckedOrder, paidMessage: string): void {
  if (order.checkout_state === 'paid') {
    void dialog.alert({
      title: 'Payment received',
      message: paidMessage,
      tone: 'success',
      icon: 'celebrate',
      buttonLabel: 'Great',
    });
  } else if (order.checkout_state === 'in_progress') {
    void dialog.alert({
      title: 'Confirming your payment',
      message: 'If you approved it in your UPI or bank app, it updates here within a minute.',
      icon: 'clock',
    });
  } else {
    toast('Payment not completed — no money was taken', 'info');
  }
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
