import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
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

export interface WeatherFlashContent {
  emoji: string;
  text: string;
}

/** What the weather means for the site — a light, friendly line. */
function weatherFlash(w: SiteWeather): WeatherFlashContent {
  const t = `${w.temp_c}°`;
  if (w.temp_c >= 38) return { emoji: '🥵', text: `${t} — your site is sunbathing. Visit early!` };
  switch (w.condition) {
    case 'clear':
      return w.is_day
        ? { emoji: '☀️', text: `Sunny and ${t} — your site is soaking it up` }
        : { emoji: '🌙', text: `A clear, calm night at your site — ${t}` };
    case 'partly_cloudy':
      return { emoji: '⛅', text: `${t} and pleasant — your site is breathing easy` };
    case 'cloudy':
      return { emoji: '☁️', text: `Overcast and ${t} — cool and comfy at your site` };
    case 'fog':
      return { emoji: '🌫️', text: `Misty at your site (${t}) — mysterious!` };
    case 'drizzle':
      return { emoji: '🌦️', text: `A light drizzle, ${t} — your land is having a drink` };
    case 'rain':
      return { emoji: '🌧️', text: `Raining at your site (${t}) — nature’s watering the plot` };
    case 'storm':
      return { emoji: '⛈️', text: `Stormy at your site (${t}) — best to visit another day` };
    case 'snow':
      return { emoji: '❄️', text: `Snow at your site, ${t}!` };
  }
}

/**
 * "28° · Partly cloudy" at the property's site. Renders nothing without a
 * pin, while loading, or if weather is unavailable — it never takes space
 * it can't fill. `tone="light"` for use over photos; `size="lg"` on the
 * property page. Tapping it hands a friendly line to `onPress` (the cover
 * shows it as a flash that fades away).
 */
export function WeatherChip({
  lat,
  lon,
  tone = 'default',
  size = 'md',
  showLabel = false,
  onPress,
}: {
  lat: number | null;
  lon: number | null;
  tone?: 'default' | 'light';
  size?: 'md' | 'lg';
  showLabel?: boolean;
  onPress?: (flash: WeatherFlashContent) => void;
}) {
  const { data } = useSiteWeather(lat, lon);
  if (!data) return null;
  const light = tone === 'light';
  const lg = size === 'lg';
  return (
    <Pressable
      onPress={onPress ? () => onPress(weatherFlash(data)) : undefined}
      disabled={!onPress}
      hitSlop={6}
      accessibilityRole={onPress ? 'button' : undefined}
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

/** A friendly bubble that pops up over the photo, lingers, and fades away by itself. */
export function WeatherFlash({
  content,
  onDone,
}: {
  content: WeatherFlashContent;
  onDone: () => void;
}) {
  const [show] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const run = Animated.sequence([
      Animated.spring(show, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
      Animated.delay(2400),
      Animated.timing(show, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]);
    run.start(({ finished }) => finished && onDone());
    return () => run.stop();
  }, [show, onDone]);
  return (
    <View style={styles.flashWrap} pointerEvents="none">
      <Animated.View
        style={[
          styles.flash,
          {
            opacity: show,
            transform: [{ scale: show.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
          },
        ]}
      >
        <Text style={styles.emoji}>{content.emoji}</Text>
        <Text style={styles.flashText}>{content.text}</Text>
      </Animated.View>
    </View>
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
  flashWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  flash: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    maxWidth: 300,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  emoji: { fontSize: font(30) },
  flashText: { flexShrink: 1, fontSize: font(14.5), fontWeight: '700', color: colors.text },
});
