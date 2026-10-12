import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import {
  DOCUMENT_TYPE_LABELS,
  STORAGE_BUCKETS,
  documentShareSchema,
  formatFileSize,
  type DocumentShare,
  type DocumentType,
} from '@propittu/shared';
import { audit } from '../audit.js';
import { auth } from '../auth.js';
import { env } from '../env.js';
import { HttpError, must, notFound, ok, uuidParam } from '../errors.js';
import { notify } from '../notify.js';
import { assertOwnsProperty } from '../ownership.js';
import { serviceClient } from '../supabase.js';

/**
 * Share documents safely. The owner picks documents and gets a private link
 * that expires (1, 7 or 30 days) and can be revoked; whoever has it opens a
 * simple page and downloads the files (each download link lasts 5 minutes).
 * Openings and downloads are logged; the first opening tells the owner.
 *
 *   POST   /properties/:id/shares     {label, document_ids, days}
 *   GET    /properties/:id/shares
 *   DELETE /shares/:id                revoke
 *   GET    /s/:token                  the recipient's page (public)
 *   GET    /s/:token/:documentId      a download (public; redirects)
 */
export const sharesRouter = Router();
export const sharePagesRouter = Router();

const base = () => env.PUBLIC_API_URL ?? 'https://propittu-api.vercel.app';

sharesRouter.post('/properties/:id/shares', async (req, res) => {
  const ctx = auth(req);
  const propertyId = uuidParam(req.params.id, 'Property');
  await assertOwnsProperty(ctx.db, ctx.accountId, propertyId);
  const input = documentShareSchema.parse(req.body);
  const docs = must<{ id: string }[]>(
    await ctx.db
      .from('property_documents')
      .select('id')
      .eq('property_id', propertyId)
      .eq('upload_status', 'ready')
      .in('id', input.document_ids),
  );
  if (docs.length !== new Set(input.document_ids).size)
    throw new HttpError(
      400,
      'VALIDATION_FAILED',
      'Some of those documents are not on this property',
    );
  const token = randomBytes(24).toString('base64url');
  const row = must<{ id: string }>(
    await ctx.db
      .from('document_shares')
      .insert({
        account_id: ctx.accountId,
        property_id: propertyId,
        token,
        label: input.label,
        document_ids: docs.map((d) => d.id),
        expires_at: new Date(Date.now() + input.days * 86_400_000).toISOString(),
        created_by: ctx.userId,
      })
      .select('id')
      .single(),
  );
  await audit(
    ctx,
    'documents.shared',
    { type: 'document_share', id: row.id },
    {
      documents: docs.length,
      days: input.days,
    },
  );
  ok(res, { id: row.id, url: `${base()}/s/${token}` }, 201);
});

sharesRouter.get('/properties/:id/shares', async (req, res) => {
  const { db, accountId } = auth(req);
  const propertyId = uuidParam(req.params.id, 'Property');
  await assertOwnsProperty(db, accountId, propertyId);
  const rows = must<
    {
      id: string;
      label: string;
      token: string;
      document_ids: string[];
      expires_at: string;
      revoked_at: string | null;
      created_at: string;
    }[]
  >(
    await db
      .from('document_shares')
      .select('id, label, token, document_ids, expires_at, revoked_at, created_at')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })
      .limit(30),
  );
  const { data: views } = rows.length
    ? await db
        .from('document_share_views')
        .select('share_id, kind, created_at')
        .in(
          'share_id',
          rows.map((r) => r.id),
        )
    : { data: [] };
  const v = (views ?? []) as { share_id: string; kind: string; created_at: string }[];
  const data: DocumentShare[] = rows.map((r) => {
    const mine = v.filter((x) => x.share_id === r.id);
    const opened = mine.filter((x) => x.kind === 'opened');
    return {
      id: r.id,
      label: r.label,
      url: `${base()}/s/${r.token}`,
      document_count: r.document_ids.length,
      expires_at: r.expires_at,
      revoked_at: r.revoked_at,
      created_at: r.created_at,
      opened: opened.length,
      downloaded: mine.filter((x) => x.kind === 'downloaded').length,
      last_opened_at:
        opened
          .map((x) => x.created_at)
          .sort()
          .at(-1) ?? null,
    };
  });
  ok(res, data);
});

sharesRouter.delete('/shares/:id', async (req, res) => {
  const ctx = auth(req);
  const id = uuidParam(req.params.id, 'Share');
  const row = must<{ id: string } | null>(
    await ctx.db
      .from('document_shares')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .is('revoked_at', null)
      .select('id')
      .maybeSingle(),
  );
  if (!row) throw notFound('Share');
  await audit(ctx, 'documents.share_revoked', { type: 'document_share', id });
  ok(res, { id });
});

/* ---- The recipient's side (public, no login) ---- */

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} · Propittu</title>
<style>
:root{--text:#14182F;--muted:#5B6178;--primary:#4338CA;--bg:#F7F8FC;--card:#FFFFFF;--line:#E6E8F0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:640px;margin:0 auto;padding:28px 18px 56px}.brand{color:var(--primary);font-weight:800;font-size:20px;margin-bottom:20px}
h1{font-size:24px;line-height:1.25;margin:0 0 6px}.sub{color:var(--muted);font-size:14px}
.list{margin-top:20px;background:var(--card);border:1px solid var(--line);border-radius:16px}
.doc{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border-top:1px solid var(--line)}
.doc:first-child{border-top:0}.doc b{display:block}.btn{background:var(--primary);color:#fff;text-decoration:none;padding:8px 14px;border-radius:10px;font-weight:600;font-size:14px;white-space:nowrap}
.note{margin-top:20px;color:var(--muted);font-size:13px}
</style></head><body><main><div class="brand">Propittu</div>${body}</main></body></html>`;
}

async function liveShare(token: string) {
  const db = serviceClient;
  if (!db || !/^[A-Za-z0-9_-]{24,64}$/.test(token)) return null;
  const { data } = await db
    .from('document_shares')
    .select(
      'id, account_id, property_id, label, document_ids, expires_at, revoked_at, property:properties(name)',
    )
    .eq('token', token)
    .maybeSingle();
  if (!data || data.revoked_at || Date.parse(data.expires_at as string) < Date.now()) return null;
  return data as unknown as {
    id: string;
    account_id: string;
    property_id: string;
    label: string;
    document_ids: string[];
    expires_at: string;
    property: { name: string } | null;
  };
}

const device = (ua: string | undefined) => (ua ?? '').replace(/\s+/g, ' ').slice(0, 120) || null;

sharePagesRouter.get('/s/:token', async (req, res) => {
  const share = await liveShare(String(req.params.token));
  res.set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex');
  if (!share) {
    res
      .status(410)
      .type('html')
      .send(
        page(
          'Link no longer available',
          '<h1>This link has expired</h1><p class="sub">Ask the owner for a new one.</p>',
        ),
      );
    return;
  }
  const db = serviceClient!;
  const { data: docs } = await db
    .from('property_documents')
    .select('id, document_type, file_name, file_size')
    .in('id', share.document_ids)
    .eq('property_id', share.property_id)
    .eq('upload_status', 'ready');
  const { count } = await db
    .from('document_share_views')
    .select('id', { count: 'exact', head: true })
    .eq('share_id', share.id)
    .eq('kind', 'opened');
  await db
    .from('document_share_views')
    .insert({ share_id: share.id, kind: 'opened', device: device(req.get('user-agent')) });
  if (!count) notify({ type: 'share.opened', shareId: share.id });
  const rows = (
    (docs ?? []) as {
      id: string;
      document_type: DocumentType;
      file_name: string;
      file_size: number;
    }[]
  )
    .map(
      (d) =>
        `<div class="doc"><div><b>${esc(DOCUMENT_TYPE_LABELS[d.document_type] ?? 'Document')}</b><span class="sub">${esc(d.file_name)} · ${esc(formatFileSize(d.file_size))}</span></div><a class="btn" href="/s/${esc(String(req.params.token))}/${d.id}">Download</a></div>`,
    )
    .join('');
  res.type('html').send(
    page(
      share.label,
      `<h1>${esc(share.property?.name ?? 'Property documents')}</h1>
<p class="sub">Shared with you: ${esc(share.label)} · available until ${esc(new Date(share.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }))}</p>
<div class="list">${rows || '<div class="doc">No documents.</div>'}</div>
<p class="note">The owner can see when this page is opened and can stop sharing at any time. Please don’t forward this link.</p>`,
    ),
  );
});

sharePagesRouter.get('/s/:token/:documentId', async (req, res) => {
  const share = await liveShare(String(req.params.token));
  const documentId = String(req.params.documentId);
  if (!share || !share.document_ids.includes(documentId)) {
    res.status(410).type('html').send(page('Not available', '<h1>This link has expired</h1>'));
    return;
  }
  const db = serviceClient!;
  const { data: doc } = await db
    .from('property_documents')
    .select('storage_path, file_name')
    .eq('id', documentId)
    .eq('property_id', share.property_id)
    .maybeSingle();
  if (!doc) {
    res.status(404).type('html').send(page('Not found', '<h1>Document not found</h1>'));
    return;
  }
  const { data: signed } = await db.storage
    .from(STORAGE_BUCKETS.documents)
    .createSignedUrl(doc.storage_path as string, 300, { download: doc.file_name as string });
  if (!signed?.signedUrl) {
    res.status(503).type('html').send(page('Try again', '<h1>Please try again in a moment</h1>'));
    return;
  }
  await db.from('document_share_views').insert({
    share_id: share.id,
    kind: 'downloaded',
    document_id: documentId,
    device: device(req.get('user-agent')),
  });
  res.set('Cache-Control', 'no-store').redirect(302, signed.signedUrl);
});
