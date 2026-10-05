import { logger } from './logger.js';

/**
 * Notifications (M8) — intentionally NOT implemented in V1.
 *
 * This is the single extension point: business code reports WHAT happened;
 * a future notification service decides WHO is told and HOW (push, SMS,
 * email, WhatsApp). Today it only logs, so nothing is scattered across
 * M1–M7 that would have to be found and rewired later.
 */
export type NotificationEvent =
  | { type: 'service_request.status_changed'; requestId: string; status: string }
  | { type: 'visit_report.published'; requestId: string }
  | { type: 'payment.received'; orderId: string | null };

export function notify(event: NotificationEvent): void {
  logger.info({ notification: event }, 'notification (not delivered: M8 deferred)');
}
