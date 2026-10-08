import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { LogBox } from 'react-native';
import type { Reminder } from '@propittu/shared';

/**
 * Reminders on this phone, scheduled by the app itself (local
 * notifications) — no server, no store build needed. Opt-in: the owner
 * taps "Remind me" once. Rebuilt from "Coming up" whenever Home loads:
 *
 *   dated items      3 days before and on the day, at 9 am
 *   weekly digest    Sundays 10 am, when anything is coming up
 *   tax season       2 April 10 am, when a property's tax is open
 */

const KEY = 'propittu.phone-reminders';

// Expo Go warns that server push needs a development build. We only use
// on-phone (local) reminders, which work there, so the warning is noise.
LogBox.ignoreLogs(['expo-notifications']);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function phoneRemindersOn(): Promise<boolean> {
  try {
    if ((await AsyncStorage.getItem(KEY)) !== 'on') return false;
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Asks once; true when reminders can be shown on this phone. */
export async function turnOnPhoneReminders(): Promise<boolean> {
  const { granted } = await Notifications.requestPermissionsAsync();
  if (granted) await AsyncStorage.setItem(KEY, 'on').catch(() => undefined);
  return granted;
}

const at = (date: Date, hour: number) => {
  const d = new Date(date);
  d.setHours(hour, 0, 0, 0);
  return d;
};

/** Replaces this app's scheduled reminders with ones for the current list. */
export async function syncPhoneReminders(list: Reminder[]): Promise<void> {
  if (!(await phoneRemindersOn())) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  const now = Date.now();
  const once = (title: string, body: string, when: Date) =>
    when.getTime() > now
      ? Notifications.scheduleNotificationAsync({
          content: { title, body },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
        })
      : Promise.resolve();

  const jobs: Promise<unknown>[] = [];
  for (const r of list) {
    if (!r.due_date) continue;
    const due = new Date(`${r.due_date}T00:00:00`);
    const before = new Date(due.getTime() - 3 * 24 * 3600_000);
    const where = r.property_name ? ` · ${r.property_name}` : '';
    jobs.push(once(r.title + where, 'Coming up in 3 days. ' + r.detail, at(before, 9)));
    jobs.push(once(r.title + where, 'Due today. ' + r.detail, at(due, 9)));
  }
  if (list.length > 0) {
    jobs.push(
      Notifications.scheduleNotificationAsync({
        content: {
          title: 'Your properties this week',
          body: `${list.length} thing${list.length === 1 ? '' : 's'} coming up — tap to see them.`,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: 1,
          hour: 10,
          minute: 0,
        },
      }),
    );
  }
  if (list.some((r) => r.kind === 'tax')) {
    const d = new Date();
    const april = new Date(d.getMonth() >= 3 ? d.getFullYear() + 1 : d.getFullYear(), 3, 2, 10);
    jobs.push(
      once('Property tax season', 'A new financial year — time to pay property tax.', april),
    );
  }
  await Promise.all(jobs);
}
