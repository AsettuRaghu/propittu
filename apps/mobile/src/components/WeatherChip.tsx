import { StyleSheet, Text, View } from 'react-native';
import { WEATHER_LABELS, type SiteWeather } from '@propittu/shared';
import { useSiteWeather } from '@/api/weather';
import { colors, font, radius, space } from '@/theme';
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

/**
 * "28° · Partly cloudy" at the property's site. Renders nothing without a
 * pin, while loading, or if weather is unavailable — it never takes space
 * it can't fill. `tone="light"` for use over photos.
 */
export function WeatherChip({
  lat,
  lon,
  tone = 'default',
  showLabel = false,
}: {
  lat: number | null;
  lon: number | null;
  tone?: 'default' | 'light';
  showLabel?: boolean;
}) {
  const { data } = useSiteWeather(lat, lon);
  if (!data) return null;
  const light = tone === 'light';
  return (
    <View
      style={[styles.chip, light && styles.chipLight]}
      accessibilityLabel={`${data.temp_c} degrees, ${WEATHER_LABELS[data.condition]}`}
    >
      <Icon name={weatherIcon(data)} size={14} color={light ? '#FFFFFF' : colors.textMuted} />
      <Text style={[styles.text, light && styles.textLight]}>
        {data.temp_c}°{showLabel ? ` · ${WEATHER_LABELS[data.condition]}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipLight: {
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
  },
  text: { fontSize: font(13), fontWeight: '700', color: colors.textMuted },
  textLight: { color: '#FFFFFF' },
});
