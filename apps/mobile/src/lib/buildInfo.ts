import * as Updates from 'expo-updates';

/**
 * Where the running JavaScript came from, shown at the bottom of Profile:
 *   "Local (laptop)"                — Expo dev server on the Mac (__DEV__)
 *   "Published version · 6 Oct …"   — EAS Update from Expo's servers
 */
function describe(): string {
  if (__DEV__) return 'Local (laptop)';
  try {
    const at = Updates.createdAt;
    if (at) {
      const day = at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      const time = at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      return `Published version · ${day}, ${time}`;
    }
  } catch {
    // expo-updates metadata unavailable — still a published bundle.
  }
  return 'Published version';
}

export const BUILD_LABEL = describe();
