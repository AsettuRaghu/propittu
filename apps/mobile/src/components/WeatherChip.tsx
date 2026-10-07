import { Pressable, StyleSheet, Text } from 'react-native';
import { WEATHER_LABELS, type SiteWeather } from '@propittu/shared';
import { useSiteWeather } from '@/api/weather';
import { colors, font, radius } from '@/theme';
import { dialog } from './Dialog';
import { Icon, type IconName } from './Icon';

/** Our weather condition → icon (day and night where it matters). */
function weatherIcon(w: SiteWeather): IconName {
  switch (w.condition) {
    case 'clear':
      return w.is_day ? 'weather-clear' : 'weather-clear-night';
    case 'partly_cloudy':
      return w.is_day ? 'weather-partly' : 'weather-partly-night';
    case 'cloudy':
      return 'weather-cloudy';
    case 'fog':
      return 'weather-fog';
    case 'drizzle':
      return 'weather-drizzle';
    case 'rain':
      return 'weather-rain';
    case 'storm':
      return 'weather-storm';
    case 'snow':
      return 'weather-snow';
  }
}

/** What the weather means for the site, in a friendly sentence. */
function weatherNote(w: SiteWeather): string {
  const t = `${w.temp_c}°`;
  const hot = w.temp_c >= 38 ? ' It’s a hot one — go early if you’re visiting.' : '';
  switch (w.condition) {
    case 'clear':
      return w.is_day
        ? `Clear skies and ${t} — a lovely day at your site.${hot}`
        : `A clear, calm night at your site — ${t}.`;
    case 'partly_cloudy':
      return `${t} with a few clouds — pleasant at your site, and it’s breathing well.${hot}`;
    case 'cloudy':
      return `Overcast and ${t} — calm and comfortable at your site.`;
    case 'fog':
      return `Misty at your site right now (${t}). Visibility is low if you’re heading there.`;
    case 'drizzle':
      return `A light drizzle at your site, ${t} — the land is getting a drink.`;
    case 'rain':
      return `It’s raining at your site (${t}). Worth checking for standing water once it clears.`;
    case 'storm':
      return `Thunderstorms around your site (${t}). Best to hold off visiting until it passes.`;
    case 'snow':
      return `Snow at your site, ${t}.`;
  }
}

/**
 * "28° · Partly cloudy" at the property's site. Renders nothing without a
 * pin, while loading, or if weather is unavailable — it never takes space
 * it can't fill. `tone="light"` for use over photos; `size="lg"` on the
 * property page. Tapping it says what the weather means for the site.
 */
export function WeatherChip({
  lat,
  lon,
  name,
  tone = 'default',
  size = 'md',
  showLabel = false,
}: {
  lat: number | null;
  lon: number | null;
  /** The property, for the tap's message. */
  name: string;
  tone?: 'default' | 'light';
  size?: 'md' | 'lg';
  showLabel?: boolean;
}) {
  const { data } = useSiteWeather(lat, lon);
  if (!data) return null;
  const light = tone === 'light';
  const lg = size === 'lg';
  return (
    <Pressable
      onPress={() =>
        void dialog.alert({
          title: `Weather at ${name}`,
          message: weatherNote(data),
        })
      }
      hitSlop={6}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.chip,
        light && styles.chipLight,
        lg && styles.chipLg,
        pressed && styles.pressed,
      ]}
      accessibilityLabel={`${data.temp_c} degrees, ${WEATHER_LABELS[data.condition]}`}
    >
      <Icon
        name={weatherIcon(data)}
        size={lg ? 20 : 17}
        color={light ? '#FFFFFF' : colors.textMuted}
      />
      <Text style={[styles.text, lg && styles.textLg, light && styles.textLight]}>
        {data.temp_c}°{showLabel ? ` · ${WEATHER_LABELS[data.condition]}` : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipLight: {
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipLg: { paddingHorizontal: 12, paddingVertical: 6 },
  pressed: { opacity: 0.75 },
  text: { fontSize: font(15), fontWeight: '700', color: colors.textMuted },
  textLg: { fontSize: font(16) },
  textLight: { color: '#FFFFFF' },
});
