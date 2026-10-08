import { z } from 'zod';
import { ALLOWED_DOCUMENT_MIME_TYPES, MAX_DOCUMENT_BYTES } from './constants';
import { uuidSchema } from './schemas';

/** Help & Support: tickets between customers and the Backoffice. */

export const SUPPORT_EMAIL = 'contact@propittu.com';

export const TICKET_CATEGORIES = [
  'account',
  'plan_billing',
  'property',
  'documents',
  'service_request',
  'app_issue',
  'other',
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  account: 'Account',
  plan_billing: 'Plan & billing',
  property: 'Property',
  documents: 'Documents',
  service_request: 'Service request',
  app_issue: 'App problem',
  other: 'Something else',
};

export const TICKET_STATUSES = [
  'open',
  'in_progress',
  'waiting_on_customer',
  'resolved',
  'closed',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting_on_customer: 'Awaiting your reply',
  resolved: 'Resolved',
  closed: 'Closed',
};
export const OPEN_TICKET_STATUSES: TicketStatus[] = ['open', 'in_progress', 'waiting_on_customer'];

/**
 * What the team works with: Open (not answered yet), In progress, Resolved.
 * Older statuses fold in: "awaiting customer" counts as in progress and
 * "closed" as resolved.
 */
export const STAFF_TICKET_STATUSES = ['open', 'in_progress', 'resolved'] as const;
export type StaffTicketStatus = (typeof STAFF_TICKET_STATUSES)[number];
export const ticketStage = (s: TicketStatus): StaffTicketStatus =>
  s === 'waiting_on_customer' ? 'in_progress' : s === 'closed' ? 'resolved' : s;

/** Our reply promise, shown next to the reply box. */
export const SUPPORT_REPLY_PROMISE = 'We’ll reply within 1–3 working days.';

/** Internal codes (PR-000146, ST-000012) are for staff; customers see names. */
export const withoutCodes = (text: string) =>
  text.replace(/\s*[·:-]?\s*\b(PR|ST|ORD)-\d{3,}\b/g, '').trim() || text;

/** The small note above the reply box: whose turn it is (null once resolved). */
export function ticketWaitingNote(t: {
  status: TicketStatus;
}): { tone: 'info' | 'warning'; text: string } | null {
  if (t.status === 'waiting_on_customer') {
    return { tone: 'warning', text: 'We need a reply from you to carry on.' };
  }
  return OPEN_TICKET_STATUSES.includes(t.status)
    ? { tone: 'info', text: SUPPORT_REPLY_PROMISE }
    : null;
}

export interface SupportAttachment {
  id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  /** Short-lived signed URL. */
  url: string | null;
}

export interface SupportMessage {
  id: string;
  author_type: 'customer' | 'staff';
  body: string;
  created_at: string;
  attachments: SupportAttachment[];
}

export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

export const attachmentIntentSchema = z.object({
  message_id: uuidSchema,
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.enum(ALLOWED_DOCUMENT_MIME_TYPES, { message: 'Use a PDF, JPG or PNG file' }),
  file_size: z.number().int().positive().max(MAX_DOCUMENT_BYTES, 'Files must be under 10 MB'),
});

export interface SupportTicket {
  id: string;
  reference: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  created_at: string;
  last_message_at: string;
  resolved_at: string | null;
  /** Our team replied since the customer last opened the ticket. */
  has_new_reply: boolean;
  /** The customer wrote last and it is not resolved: it needs a reply from us. */
  awaiting_staff: boolean;
  property: { id: string; name: string } | null;
  service_request: { id: string; reference: string; service: { name: string } | null } | null;
}

export interface SupportTicketDetail extends SupportTicket {
  messages: SupportMessage[];
}

export interface BackofficeTicket extends SupportTicket {
  account_id: string;
  customer_phone: string | null;
  customer_name: string | null;
}

export interface BackofficeTicketDetail extends BackofficeTicket {
  messages: SupportMessage[];
}

export const createTicketSchema = z.object({
  /** Optional: the app asks only for category + the issue; see ticketSubject(). */
  subject: z.string().trim().min(3).max(120).optional(),
  category: z.enum(TICKET_CATEGORIES, { message: 'Choose a category' }),
  description: z.string().trim().min(5, 'Explain the issue in a few words').max(4000),
  property_id: uuidSchema.nullable().optional(),
  service_request_id: uuidSchema.nullable().optional(),
});
export type CreateTicketInput = z.input<typeof createTicketSchema>;

/** A ticket's title: the given subject, or the start of the issue (≤ 60 chars, whole words). */
export function ticketSubject(input: { subject?: string; description: string }): string {
  if (input.subject) return input.subject;
  const text = input.description.replace(/\s+/g, ' ').trim();
  if (text.length <= 60) return text;
  const cut = text.slice(0, 60);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 30 ? cut.lastIndexOf(' ') : 60)}…`;
}

export const ticketMessageSchema = z.object({
  body: z.string().trim().min(1, 'Write a message').max(4000),
});

export const ticketStatusSchema = z.object({ status: z.enum(TICKET_STATUSES) });

export const updateProfileSchema = z.object({
  full_name: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().min(2, 'Enter your name').max(120).nullable(),
  ),
});
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;

/** POST /me/delete — the customer types DELETE to confirm. */
export const deleteAccountSchema = z.object({
  confirm: z.literal('DELETE', { message: 'Type DELETE to confirm' }),
});
