/**
 * Expo Go prints two warnings when expo-notifications loads: server push
 * needs a development build. We only use on-phone (local) reminders, which
 * work in Expo Go, and store builds never print them. Development only;
 * imported first in the root layout so it runs before expo-notifications.
 */
if (__DEV__) {
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    const first = typeof args[0] === 'string' ? args[0] : '';
    if (first.includes('expo-notifications')) return;
    warn(...args);
  };
}

export {};
