import { useQuery } from '@tanstack/react-query';
import type { Reminder } from '@propittu/shared';
import { api } from './client';

export const remindersKey = ['reminders'] as const;

/** "Coming up" across the account's properties (GET /reminders). */
export const useReminders = (enabled = true) =>
  useQuery({
    queryKey: remindersKey,
    queryFn: () => api<Reminder[]>('/reminders'),
    enabled,
    staleTime: 5 * 60_000,
  });
