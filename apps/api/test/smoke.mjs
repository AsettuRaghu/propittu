// API security smoke test — PRODUCT_SPEC.md §31, §34, §41.
//
//   npm run test:api
//
// Boots the real API against a FAKE Supabase that publishes a JWKS and
// records every PostgREST request, then checks that:
//   - forged / expired / wrong-issuer / wrong-audience / anon tokens are rejected
//   - every database call carries the USER'S OWN JWT (so RLS applies)
//   - client-supplied user_id is ignored in favour of the token identity
//   - validation and file-type/size limits reject bad input
//
// Needs no Supabase project and no network. RLS itself is covered by
// npm run test:rls against real Postgres.
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

const SB_PORT = 54400, API_PORT = 54401;
const SB_URL = `http://127.0.0.1:${SB_PORT}`;
const API = `http://127.0.0.1:${API_PORT}`;
const PUBLISHABLE = 'sb_publishable_test_0123456789abcdef';
const USER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACCOUNT = 'acc0000a-0000-0000-0000-00000000000a';
// A signed-in user with no account membership (should be refused).
const ORPHAN = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const { publicKey, privateKey } = await generateKeyPair('ES256');
const { privateKey: rogueKey } = await generateKeyPair('ES256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' };

const seen = [];
const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.url === '/auth/v1/.well-known/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ keys: [jwk] }));
    }
    if (req.url.startsWith('/rest/v1/')) {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, apikey: req.headers.apikey, body: body ? JSON.parse(body) : null });
      const single = (req.headers.accept || '').includes('vnd.pgrst.object');
      if (req.method === 'HEAD') { res.writeHead(200, { 'content-range': '*/3' }); return res.end(); }
      // User → Account resolution (M1): only USER has a membership.
      if (req.url.startsWith('/rest/v1/account_members')) {
        const row = req.url.includes(`user_id=eq.${USER}`) ? { account_id: ACCOUNT, role: 'owner' } : null;
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify(single ? row : row ? [row] : []));
      }
      if (req.url.startsWith('/rest/v1/accounts')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ id: ACCOUNT, status: 'active' }));
      }
      if (req.method === 'POST' && req.url.startsWith('/rest/v1/audit_events')) {
        res.writeHead(201);
        return res.end();
      }
      if (req.url.startsWith('/rest/v1/rpc/keepalive')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify('2026-01-01T00:00:00+00:00'));
      }
      if (req.method === 'POST' && req.url.startsWith('/rest/v1/properties')) {
        const row = { id: '11111111-1111-1111-1111-111111111111', created_at: 'now', updated_at: 'now', ...JSON.parse(body) };
        res.writeHead(201, { 'content-type': 'application/json' });
        return res.end(JSON.stringify(single ? row : [row]));
      }
      res.writeHead(200, { 'content-type': 'application/json', 'content-range': '*/3' });
      return res.end(single ? 'null' : '[]');
    }
    res.writeHead(404); res.end();
  });
});
await new Promise((r) => fake.listen(SB_PORT, '127.0.0.1', r));

// SMOKE_TARGET=bundle tests the built Vercel bundle (what actually ships)
// instead of the TypeScript source. `npm run test:bundle` builds it first.
const CRON_SECRET = 'smoke-test-cron-secret-0123456789';
const target = process.env.SMOKE_TARGET === 'bundle'
  ? ['node', ['test/serve-bundle.mjs']]
  : ['npx', ['tsx', 'src/index.ts']];
console.log(`Target: ${process.env.SMOKE_TARGET === 'bundle' ? 'Vercel bundle (.vercel/output)' : 'TypeScript source'}\n`);
const api = spawn(target[0], target[1], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: { ...process.env, SUPABASE_URL: SB_URL, SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE, PORT: String(API_PORT), NODE_ENV: 'production', LOG_LEVEL: 'silent', CRON_SECRET },
  stdio: ['ignore', 'inherit', 'inherit'],
});
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`${API}/health`)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 150));
}

const iss = `${SB_URL}/auth/v1`;
const mint = (opts = {}) => {
  const claims = { role: 'authenticated', phone: '919876543210', ...(opts.claims || {}) };
  return new SignJWT(claims).setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setSubject(opts.sub ?? USER).setIssuer(opts.iss ?? iss).setAudience(opts.aud ?? 'authenticated')
    .setIssuedAt().setExpirationTime(opts.exp ?? '1h').sign(opts.key ?? privateKey);
};
const call = async (path, { token, method = 'GET', body, raw } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body || raw ? { 'content-type': 'application/json' } : {}) },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
};

let failed = 0;
const check = (cond, label, extra) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra !== undefined ? '  → ' + JSON.stringify(extra) : ''}`);
  if (!cond) failed++;
};

try {
  const valid = await mint();

  let r = await call('/health');
  check(r.status === 200 && r.json.data.status === 'ok', 'GET /health → 200 ok', r);

  r = await call('/me');
  check(r.status === 401 && r.json.error.code === 'UNAUTHENTICATED', 'no token → 401 UNAUTHENTICATED', r);

  r = await call('/me', { token: 'garbage' });
  check(r.status === 401, 'malformed token → 401', r);

  r = await call('/me', { token: await mint({ key: rogueKey }) });
  check(r.status === 401, 'token signed by a foreign key → 401 (signature verified)', r);

  r = await call('/me', { token: await mint({ exp: Math.floor(Date.now() / 1000) - 60 }) });
  check(r.status === 401 && /expired/i.test(r.json.error.message), 'expired token → 401 "session expired"', r);

  r = await call('/me', { token: await mint({ iss: 'https://evil.example/auth/v1' }) });
  check(r.status === 401, 'wrong issuer → 401', r);

  r = await call('/me', { token: await mint({ aud: 'anon' }) });
  check(r.status === 401, 'wrong audience → 401', r);

  r = await call('/me', { token: await mint({ claims: { role: 'anon' } }) });
  check(r.status === 401, 'role=anon token → 401', r);

  r = await call('/route-that-does-not-exist');
  check(r.status === 401, 'unknown route without auth → 401 (route existence not revealed)', r);

  seen.length = 0;
  r = await call('/me', { token: valid });
  check(r.status === 200 && r.json.data.id === USER, 'valid token → GET /me 200 with id from token', r);
  check(r.json?.data?.phone === '+919876543210', 'phone normalised to E.164 from token', r.json?.data);
  check(r.json?.data?.property_count === 3, 'counts read from PostgREST content-range', r.json?.data);
  check(seen.length >= 3 && seen.every((s) => s.auth === `Bearer ${valid}`),
    'EVERY PostgREST call carried the USER\'S JWT (RLS applies on the API path)', seen.map((s) => s.auth?.slice(0, 20)));
  check(seen.every((s) => s.apikey === PUBLISHABLE), 'apikey header is the publishable key', seen.map((s) => s.apikey));
  check(r.json?.data?.account?.id === ACCOUNT && r.json.data.account.role === 'owner', '/me returns the Account resolved server-side (M1)', r.json?.data?.account);
  check(r.json?.data?.staff_role === null, '/me: a customer is not staff', r.json?.data?.staff_role);

  r = await call('/me', { token: await mint({ sub: ORPHAN }) });
  check(r.status === 403 && r.json.error.code === 'FORBIDDEN', 'valid login with no Account membership → 403', r);

  r = await call('/properties/not-a-uuid', { token: valid });
  check(r.status === 404 && r.json.error.code === 'NOT_FOUND', 'malformed id → 404 NOT_FOUND', r);

  r = await call('/properties/22222222-2222-2222-2222-222222222222', { token: valid });
  check(r.status === 404, 'property not visible (RLS/ownership) → 404', r);

  r = await call('/properties', { token: valid, method: 'POST', body: { property_type: 'castle' } });
  check(r.status === 400 && r.json.error.code === 'VALIDATION_FAILED' && r.json.error.details?.name && r.json.error.details?.property_type,
    'invalid body → 400 with per-field details', r.json);

  r = await call('/properties', { token: valid, method: 'POST', raw: '{not json' });
  check(r.status === 400 && r.json.error.code === 'VALIDATION_FAILED', 'malformed JSON → 400', r);

  r = await call('/properties', { token: valid, method: 'POST', body: { property_type: 'land', name: 'x', pincode: '012345' } });
  check(r.status === 400 && r.json.error.details?.pincode, 'invalid PIN code → 400 on pincode', r.json);

  seen.length = 0;
  r = await call('/properties', {
    token: valid, method: 'POST',
    body: { property_type: 'land', name: '  My Hyderabad Plot  ', city: '', pincode: '500001', area_value: 2400, area_unit: 'sqft',
            user_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', account_id: 'acc0000b-0000-0000-0000-00000000000b', id: 'evil' },
  });
  const insert = seen.find((s) => s.method === 'POST' && s.url.startsWith('/rest/v1/properties'));
  const auditEvent = seen.find((s) => s.method === 'POST' && s.url.startsWith('/rest/v1/audit_events'));
  check(r.status === 201, 'POST /properties → 201', r);
  check(insert?.body?.user_id === USER, 'client-supplied user_id IGNORED; token identity used (§31)', insert?.body);
  check(insert?.body?.account_id === ACCOUNT, 'forged account_id IGNORED; Account resolved from the token (M10)', insert?.body);
  check(insert && !('id' in insert.body), 'client-supplied id stripped', insert?.body);
  check(auditEvent?.body?.action === 'property.created' && auditEvent.body.account_id === ACCOUNT && auditEvent.body.actor_user_id === USER, 'audit event recorded for the property creation (M11)', auditEvent?.body);
  check(insert?.body?.name === 'My Hyderabad Plot', 'name trimmed', insert?.body?.name);
  check(insert?.body?.city === null, 'empty optional field stored as null', insert?.body?.city);

  r = await call('/properties/11111111-1111-1111-1111-111111111111/documents/intent', {
    token: valid, method: 'POST', body: { document_type: 'sale_deed', file_name: 'a.exe', mime_type: 'application/x-msdownload', file_size: 10 } });
  check(r.status === 400 && r.json.error.details?.mime_type, 'unsupported document type → 400 (§21)', r.json);

  r = await call('/properties/11111111-1111-1111-1111-111111111111/documents/intent', {
    token: valid, method: 'POST', body: { document_type: 'sale_deed', file_name: 'big.pdf', mime_type: 'application/pdf', file_size: 11 * 1024 * 1024 } });
  check(r.status === 400 && r.json.error.details?.file_size, 'document over 10 MB → 400 (§21)', r.json);

  r = await call('/service-requests', { token: valid, method: 'POST', body: { property_id: 'x', service_id: 'y', description: '' } });
  check(r.status === 400 && r.json.error.details?.description, 'empty service request → 400', r.json);

  r = await call('/cron/keepalive');
  check(r.status === 401, 'keep-alive cron without the cron secret → 401', r);
  const cron = await fetch(`${API}/cron/keepalive`, { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  const cronBody = await cron.json();
  check(cron.status === 200 && cronBody.data.database_time, 'keep-alive cron with the secret → touches the database', cronBody);
} finally {
  api.kill('SIGTERM');
  fake.close();
}

console.log(failed === 0 ? '\nALL API SMOKE CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
