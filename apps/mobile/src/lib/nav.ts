import { router } from 'expo-router';

/**
 * Switch to the Services tab (Browse, or My requests) — not a copy of it
 * inside the current tab, so the tab bar shows where you are. `at` makes
 * each tap count even if the tab was already open on the other view.
 */
export function openServicesTab(view: 'browse' | 'requests' = 'browse') {
  router.navigate({
    pathname: '/(services)/services',
    params: { tab: view, at: String(Date.now()) },
  });
}
