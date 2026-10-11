import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import type { AppNotification } from '@propittu/shared';
import { forgetPushToken, savePushToken, useInbox } from '@/api/notifications';

/**
 * Notifications on the phone (server side: apps/api/src/notify.ts).
 *
 *  - Push: this phone's Expo push token is sent to our server, which pushes
 *    every new notification. Works in a real app build; Expo Go can't
 *    receive server push, so there the next two keep owners informed.
 *  - While the app is open, a new item in the inbox also pops up as a
 *    notification on the phone.
 *  - Tapping a notification opens the screen it is about.
 */

let registered = false;
let thisPhone: string | null = null;

async function registerForPush(): Promise<void> {
  if (registered || Platform.OS === 'web') return;
  registered = true;
  try {
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) return;
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
        ?.projectId ?? undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    await savePushToken(token, Platform.OS);
    thisPhone = token;
  } catch {
    // Expo Go (no server push) or no network: the inbox still works.
  }
}

/** Asks for permission once (from Profile or the bell), then registers this phone. */
export async function turnOnNotifications(): Promise<boolean> {
  const { granted } = await Notifications.requestPermissionsAsync();
  if (granted) {
    registered = false;
    await registerForPush();
  }
  return granted;
}

/** Signing out: this phone stops getting the account's notifications. */
export async function forgetThisPhone(): Promise<void> {
  const token = thisPhone;
  thisPhone = null;
  registered = false;
  if (token) await forgetPushToken(token).catch(() => undefined);
}

/** Whether the owner has allowed notifications on this phone. */
export async function notificationsAllowed(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

const go = (url: unknown) => {
  if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
};

/** Mounted once for a signed-in owner: push registration, taps, and pop-ups for new items. */
export function useNotifications() {
  const inbox = useInbox();
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    void registerForPush();
    const sub = Notifications.addNotificationResponseReceivedListener((r) =>
      go(r.notification.request.content.data?.url),
    );
    // Opened from a notification while the app was closed.
    void Notifications.getLastNotificationResponseAsync().then((r) =>
      r ? go(r.notification.request.content.data?.url) : undefined,
    );
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const items = inbox.data?.items;
    if (!items) return;
    if (!seen.current) {
      // First load: everything already there counts as seen.
      seen.current = new Set(items.map((i) => i.id));
      return;
    }
    const fresh = items.filter((i: AppNotification) => !seen.current!.has(i.id) && !i.read_at);
    for (const n of fresh) {
      seen.current.add(n.id);
      void Notifications.scheduleNotificationAsync({
        content: { title: n.title, body: n.body ?? undefined, data: { url: n.url } },
        trigger: null,
      }).catch(() => undefined);
    }
  }, [inbox.data]);
}
