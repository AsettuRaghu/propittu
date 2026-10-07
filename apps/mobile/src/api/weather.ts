import { useQuery } from '@tanstack/react-query';
import { roundCoordinate, type SiteWeather } from '@propittu/shared';
import { api } from './client';

/** Weather at a pinned site (null when there's no pin). Refreshed every 30 minutes at most. */
export function useSiteWeather(lat: number | null, lon: number | null) {
  const rlat = lat === null ? null : roundCoordinate(lat);
  const rlon = lon === null ? null : roundCoordinate(lon);
  return useQuery({
    queryKey: ['weather', rlat, rlon],
    queryFn: () => api<SiteWeather>(`/weather?lat=${rlat}&lon=${rlon}`),
    enabled: rlat !== null && rlon !== null,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: false,
  });
}
