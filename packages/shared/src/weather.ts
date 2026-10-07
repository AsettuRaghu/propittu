/**
 * Weather at a property's site (GET /weather), from MET Norway's free
 * Locationforecast API (CC BY 4.0 — the app shows the credit). The API asks
 * with the pin rounded to ~1 km and caches until MET's Expires header.
 */

export const WEATHER_CONDITIONS = [
  'clear',
  'partly_cloudy',
  'cloudy',
  'fog',
  'drizzle',
  'rain',
  'storm',
  'snow',
] as const;
export type WeatherCondition = (typeof WEATHER_CONDITIONS)[number];

export const WEATHER_LABELS: Record<WeatherCondition, string> = {
  clear: 'Clear',
  partly_cloudy: 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Foggy',
  drizzle: 'Drizzle',
  rain: 'Rain',
  storm: 'Thunderstorm',
  snow: 'Snow',
};

export interface SiteWeather {
  temp_c: number;
  condition: WeatherCondition;
  /** False at night (MET symbols end in _night). */
  is_day: boolean;
}

/** MET Norway symbol_code (e.g. "lightrainshowers_day") → our small set of conditions. */
export function conditionFromSymbol(symbol: string): {
  condition: WeatherCondition;
  is_day: boolean;
} {
  const s = symbol.toLowerCase();
  const is_day = !s.endsWith('_night');
  const condition: WeatherCondition = s.includes('thunder')
    ? 'storm'
    : s.includes('snow') || s.includes('sleet')
      ? 'snow'
      : s.includes('drizzle')
        ? 'drizzle'
        : s.includes('rain')
          ? 'rain'
          : s.includes('fog')
            ? 'fog'
            : s.startsWith('partlycloudy') || s.startsWith('fair')
              ? 'partly_cloudy'
              : s.startsWith('cloudy')
                ? 'cloudy'
                : 'clear';
  return { condition, is_day };
}

/** ~1 km: enough for the weather, and no precise location leaves our server. */
export const roundCoordinate = (n: number) => Math.round(n * 100) / 100;
