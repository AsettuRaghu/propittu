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
  property: { id: string; name: string } | null;
  service_request: { id: string; reference: string } | null;
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
  subject: z.string().trim().min(3, 'Add a short subject').max(120),
  category: z.enum(TICKET_CATEGORIES, { message: 'Choose a category' }),
  description: z.string().trim().min(5, 'Tell us a little more').max(4000),
  property_id: uuidSchema.nullable().optional(),
  service_request_id: uuidSchema.nullable().optional(),
});
export type CreateTicketInput = z.input<typeof createTicketSchema>;

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
