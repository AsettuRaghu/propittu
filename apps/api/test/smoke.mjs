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
import { createHmac } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

const SB_PORT = 54400,
  API_PORT = 54401;
const SB_URL = `http://127.0.0.1:${SB_PORT}`;
const API = `http://127.0.0.1:${API_PORT}`;
const PUBLISHABLE = 'sb_publishable_test_0123456789abcdef';
const USER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACCOUNT = 'acc0000a-0000-0000-0000-00000000000a';
// A signed-in user with no account membership (should be refused).
const ORPHAN = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
// Staff (M9): an operations user and a support user, each with their own Account.
const STAFF_OPS = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STAFF_SUP = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
// A member of a suspended Account.
const SUSPENDED = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// Plan in force for every Account in the fake (M5/M6), switched per test.
const ALL_FEATURES = [
  'property_profile',
  'document_upload',
  'photo_upload',
  'video_upload',
  'service_requests',
];
const benefits = (features, limits, included = []) => [
  ...features.map((code) => ({ kind: 'feature', code, value: null, period: null })),
  ...Object.entries(limits).map(([code, value]) => ({ kind: 'limit', code, value, period: null })),
  ...included,
];
const PLANS = {
  trial: {
    code: 'trial',
    name: 'Free Trial',
    source: 'trial',
    benefits: benefits(
      ALL_FEATURES,
      {
        max_properties: 5,
        max_documents_per_property: 50,
        max_photos_per_property: 100,
        max_videos_per_property: 10,
        max_storage_mb: 2048,
      },
      [{ kind: 'included_service', code: 'property_visit', value: 2, period: 'year' }],
    ),
  },
  basic: {
    code: 'basic',
    name: 'Basic',
    source: 'payment',
    benefits: benefits(ALL_FEATURES, {
      max_properties: 1,
      max_documents_per_property: 10,
      max_photos_per_property: 20,
      max_videos_per_property: 2,
      max_storage_mb: 512,
    }),
  },
  nophotos: {
    code: 'nophotos',
    name: 'Docs Only',
    source: 'staff',
    benefits: benefits(
      ALL_FEATURES.filter((f) => f !== 'photo_upload'),
      {},
    ),
  },
};
let planMode = 'trial';

// Services (M4) in the fake: a visit (Included in Trial/Plus), an extra-only
// inspection, and a service that is neither Included nor sold as an Extra.
const SVC = {
  visit: { id: '5e000000-0000-0000-0000-000000000001', code: 'property_visit', name: 'Property Visit', category: 'property_care', description: '', sort_order: 100, price_paise: 99900, is_extra_available: true },
  inspect: { id: '5e000000-0000-0000-0000-000000000002', code: 'site_inspection', name: 'Site Inspection', category: 'property_care', description: '', sort_order: 110, price_paise: 149900, is_extra_available: true },
  closed: { id: '5e000000-0000-0000-0000-000000000003', code: 'legal_only', name: 'Legal Only', category: 'other', description: '', sort_order: 900, price_paise: null, is_extra_available: false },
};
let visitsLeft = 1;
let reqStatus = 'requested';
const REQ_ID = '5f000000-0000-0000-0000-000000000001';
const reqRow = () => ({
  id: REQ_ID, reference: 'PR-000200', status: reqStatus, description: 'Visit please', coverage: 'included', price_paise: null,
  preferred_date: null, scheduled_for: null, status_note: null, confirmed_at: null, completed_at: null, cancelled_at: null, cancelled_by: null,
  created_at: 'now', updated_at: 'now', account_id: ACCOUNT, user_id: USER,
  service: { id: SVC.visit.id, code: 'property_visit', name: 'Property Visit', category: 'property_care' },
  property: { id: '11111111-1111-1111-1111-111111111111', name: 'Plot', city: 'Hyderabad' },
});
const planRow = () => {
  const p = PLANS[planMode];
  if (!p) return null;
  return {
    id: 'ap000000-0000-0000-0000-000000000001',
    source: p.source,
    starts_at: '2026-01-01T00:00:00Z',
    ends_at: '2099-01-01T00:00:00Z',
    cancel_at_period_end: false,
    plan_version: {
      id: 'pv000000-0000-0000-0000-000000000001',
      version: 1,
      price_paise: 0,
      currency: 'INR',
      billing_period: 'year',
      term_days: 365,
      plan: { code: p.code, name: p.name, description: '' },
      benefits: p.benefits,
    },
  };
};

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
      seen.push({
        method: req.method,
        url: req.url,
        auth: req.headers.authorization,
        apikey: req.headers.apikey,
        body: body ? JSON.parse(body) : null,
      });
      const single = (req.headers.accept || '').includes('vnd.pgrst.object');
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'content-range': '*/3' });
        return res.end();
      }
      // User → Account resolution (M1): only USER has a membership.
      if (req.url.startsWith('/rest/v1/account_members')) {
        const members = {
          [USER]: { account_id: ACCOUNT, role: 'owner', account: { status: 'active' } },
          [STAFF_OPS]: {
            account_id: 'acc000d0-0000-0000-0000-00000000000d',
            role: 'owner',
            account: { status: 'active' },
          },
          [STAFF_SUP]: {
            account_id: 'acc000e0-0000-0000-0000-00000000000e',
            role: 'owner',
            account: { status: 'active' },
          },
          [SUSPENDED]: {
            account_id: 'acc000f0-0000-0000-0000-00000000000f',
            role: 'owner',
            account: { status: 'suspended' },
          },
        };
        const row =
          Object.entries(members).find(([id]) => req.url.includes(`user_id=eq.${id}`))?.[1] ?? null;
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify(single ? row : row ? [row] : []));
      }
      if (req.url.startsWith('/rest/v1/accounts')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ id: ACCOUNT, status: 'active' }));
      }
      const json = (status, data) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        return res.end(JSON.stringify(data));
      };
      if (req.url.startsWith('/rest/v1/staff_members')) {
        const role = req.url.includes(STAFF_OPS)
          ? 'operations'
          : req.url.includes(STAFF_SUP)
            ? 'support'
            : null;
        const row = role ? { role, is_active: true } : null;
        return json(200, single ? row : row ? [row] : []);
      }
      if (req.url.startsWith('/rest/v1/account_plans')) {
        if (req.method === 'POST')
          return json(
            201,
            single
              ? { id: 'ap000000-0000-0000-0000-000000000002' }
              : [{ id: 'ap000000-0000-0000-0000-000000000002' }],
          );
        if (req.method === 'PATCH')
          return json(200, [{ id: 'ap000000-0000-0000-0000-000000000001' }]);
        const row = planRow();
        return json(200, single ? row : row ? [row] : []);
      }
      if (req.url.startsWith('/rest/v1/account_usage')) {
        const row = { property_count: 3, storage_bytes: 1024 };
        return json(200, single ? row : [row]);
      }
      if (req.method === 'GET' && req.url.startsWith('/rest/v1/plan_versions')) {
        const row = req.url.includes('plan.code=eq.plus')
          ? { id: 'pv000000-0000-0000-0000-000000000003', term_days: 365, plan: { code: 'plus' } }
          : null;
        return json(200, single ? row : row ? [row] : []);
      }
      if (req.method === 'GET' && req.url.startsWith('/rest/v1/plans')) {
        const version = (code, id, current) => ({
          id,
          version: 1,
          price_paise: 49900,
          currency: 'INR',
          billing_period: 'year',
          term_days: 365,
          is_current: current,
          benefits: PLANS.basic.benefits,
        });
        return json(200, [
          {
            code: 'basic',
            name: 'Basic',
            description: '',
            sort_order: 1,
            versions: [
              version('basic', 'pv0000b0-0000-0000-0000-000000000001', false),
              version('basic', 'pv0000b0-0000-0000-0000-000000000002', true),
            ],
          },
        ]);
      }
      if (req.url.startsWith('/rest/v1/backoffice_accounts')) {
        const row = { id: ACCOUNT, status: 'active', created_at: 'now', phone: '919876543210', full_name: null, property_count: 3, open_request_count: 1,
                      plan_code: 'trial', plan_name: 'Free Trial', plan_source: 'trial', plan_ends_at: '2099-01-01T00:00:00Z' };
        return json(200, single ? row : [row]);
      }
      if (req.url.startsWith('/rest/v1/rpc/included_remaining')) {
        const args = JSON.parse(body || '{}');
        return json(200, args.p_code === 'property_visit' ? visitsLeft : null);
      }
      if (req.url.startsWith('/rest/v1/rpc/create_service_request')) return json(200, REQ_ID);
      if (req.url.startsWith('/rest/v1/rpc/cancel_service_request') || req.url.startsWith('/rest/v1/rpc/staff_update_service_request')) {
        return json(200, null);
      }
      if (req.method === 'GET' && req.url.startsWith('/rest/v1/services')) {
        const match = Object.values(SVC).find((x) => req.url.includes(`id=eq.${x.id}`));
        if (req.url.includes('id=eq.')) return json(200, single ? (match ?? null) : match ? [match] : []);
        return json(200, Object.values(SVC));
      }
      if (req.method === 'GET' && req.url.startsWith('/rest/v1/service_requests') && req.url.includes(`id=eq.${REQ_ID}`)) {
        return json(200, single ? reqRow() : [reqRow()]);
      }
      if (req.method === 'GET' && req.url.startsWith('/rest/v1/profiles')) {
        return json(200, [{ id: USER, phone: '919876543210', full_name: null }]);
      }
      if (req.method === 'POST' && req.url.startsWith('/rest/v1/audit_events')) {
        res.writeHead(201);
        return res.end();
      }
      if (req.url.startsWith('/rest/v1/rpc/record_payment_event')) {
        return json(200, 'plan_activated');
      }
      if (req.url.startsWith('/rest/v1/rpc/keepalive')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify('2026-01-01T00:00:00+00:00'));
      }
      // Existing property 1111… (for PATCH provenance checks).
      if (
        req.method === 'GET' &&
        req.url.startsWith('/rest/v1/properties') &&
        req.url.includes('id=eq.11111111')
      ) {
        const row = { id: '11111111-1111-1111-1111-111111111111', field_sources: { city: 'user' } };
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify(single ? row : [row]));
      }
      if (req.method === 'PATCH' && req.url.startsWith('/rest/v1/properties')) {
        const row = {
          id: '11111111-1111-1111-1111-111111111111',
          created_at: 'now',
          updated_at: 'now',
          ...JSON.parse(body),
        };
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify(single ? row : [row]));
      }
      if (req.method === 'POST' && req.url.startsWith('/rest/v1/properties')) {
        const row = {
          id: '11111111-1111-1111-1111-111111111111',
          created_at: 'now',
          updated_at: 'now',
          ...JSON.parse(body),
        };
        res.writeHead(201, { 'content-type': 'application/json' });
        return res.end(JSON.stringify(single ? row : [row]));
      }
      res.writeHead(200, { 'content-type': 'application/json', 'content-range': '*/3' });
      return res.end(single ? 'null' : '[]');
    }
    res.writeHead(404);
    res.end();
  });
});
await new Promise((r) => fake.listen(SB_PORT, '127.0.0.1', r));

// SMOKE_TARGET=bundle tests the built Vercel bundle (what actually ships)
// instead of the TypeScript source. `npm run test:bundle` builds it first.
const CRON_SECRET = 'smoke-test-cron-secret-0123456789';
// Payments (M7): webhook secret + server key are set; Razorpay API keys are
// NOT, so checkout must answer 503 and nothing reaches Razorpay.
const WEBHOOK_SECRET = 'smoke-webhook-secret-0123456789';
const SECRET_KEY = 'sb_secret_smoke_test_0123456789abcdef';
const target =
  process.env.SMOKE_TARGET === 'bundle'
    ? ['node', ['test/serve-bundle.mjs']]
    : ['npx', ['tsx', 'src/index.ts']];
console.log(
  `Target: ${process.env.SMOKE_TARGET === 'bundle' ? 'Vercel bundle (.vercel/output)' : 'TypeScript source'}\n`,
);
const api = spawn(target[0], target[1], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: {
    ...process.env,
    SUPABASE_URL: SB_URL,
    SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
    PORT: String(API_PORT),
    NODE_ENV: 'production',
    LOG_LEVEL: 'silent',
    CRON_SECRET,
    RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
    SUPABASE_SECRET_KEY: SECRET_KEY,
    RAZORPAY_KEY_ID: '',
    RAZORPAY_KEY_SECRET: '',
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(`${API}/health`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 150));
}

const iss = `${SB_URL}/auth/v1`;
const mint = (opts = {}) => {
  const claims = { role: 'authenticated', phone: '919876543210', ...(opts.claims || {}) };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setSubject(opts.sub ?? USER)
    .setIssuer(opts.iss ?? iss)
    .setAudience(opts.aud ?? 'authenticated')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '1h')
    .sign(opts.key ?? privateKey);
};
const call = async (path, { token, method = 'GET', body, raw } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body || raw ? { 'content-type': 'application/json' } : {}),
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
};

let failed = 0;
const check = (cond, label, extra) => {
  console.log(
    `${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra !== undefined ? '  → ' + JSON.stringify(extra) : ''}`,
  );
  if (!cond) failed++;
};

try {
  const valid = await mint();

  let r = await call('/health');
  check(r.status === 200 && r.json.data.status === 'ok', 'GET /health → 200 ok', r);

  r = await call('/me');
  check(
    r.status === 401 && r.json.error.code === 'UNAUTHENTICATED',
    'no token → 401 UNAUTHENTICATED',
    r,
  );

  r = await call('/me', { token: 'garbage' });
  check(r.status === 401, 'malformed token → 401', r);

  r = await call('/me', { token: await mint({ key: rogueKey }) });
  check(r.status === 401, 'token signed by a foreign key → 401 (signature verified)', r);

  r = await call('/me', { token: await mint({ exp: Math.floor(Date.now() / 1000) - 60 }) });
  check(
    r.status === 401 && /expired/i.test(r.json.error.message),
    'expired token → 401 "session expired"',
    r,
  );

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
  check(
    r.status === 200 && r.json.data.id === USER,
    'valid token → GET /me 200 with id from token',
    r,
  );
  check(
    r.json?.data?.phone === '+919876543210',
    'phone normalised to E.164 from token',
    r.json?.data,
  );
  check(
    r.json?.data?.property_count === 3,
    'counts read from PostgREST content-range',
    r.json?.data,
  );
  check(
    seen.length >= 3 && seen.every((s) => s.auth === `Bearer ${valid}`),
    "EVERY PostgREST call carried the USER'S JWT (RLS applies on the API path)",
    seen.map((s) => s.auth?.slice(0, 20)),
  );
  check(
    seen.every((s) => s.apikey === PUBLISHABLE),
    'apikey header is the publishable key',
    seen.map((s) => s.apikey),
  );
  check(
    r.json?.data?.account?.id === ACCOUNT && r.json.data.account.role === 'owner',
    '/me returns the Account resolved server-side (M1)',
    r.json?.data?.account,
  );
  check(
    r.json?.data?.staff_role === null,
    '/me: a customer is not staff',
    r.json?.data?.staff_role,
  );

  r = await call('/me', { token: await mint({ sub: ORPHAN }) });
  check(
    r.status === 403 && r.json.error.code === 'FORBIDDEN',
    'valid login with no Account membership → 403',
    r,
  );

  r = await call('/properties/not-a-uuid', { token: valid });
  check(r.status === 404 && r.json.error.code === 'NOT_FOUND', 'malformed id → 404 NOT_FOUND', r);

  r = await call('/properties/22222222-2222-2222-2222-222222222222', { token: valid });
  check(r.status === 404, 'property not visible (RLS/ownership) → 404', r);

  r = await call('/properties', {
    token: valid,
    method: 'POST',
    body: { property_type: 'castle' },
  });
  check(
    r.status === 400 &&
      r.json.error.code === 'VALIDATION_FAILED' &&
      r.json.error.details?.name &&
      r.json.error.details?.property_type,
    'invalid body → 400 with per-field details',
    r.json,
  );

  r = await call('/properties', { token: valid, method: 'POST', raw: '{not json' });
  check(r.status === 400 && r.json.error.code === 'VALIDATION_FAILED', 'malformed JSON → 400', r);

  r = await call('/properties', {
    token: valid,
    method: 'POST',
    body: { property_type: 'land', name: 'x', pincode: '012345' },
  });
  check(
    r.status === 400 && r.json.error.details?.pincode,
    'invalid PIN code → 400 on pincode',
    r.json,
  );

  seen.length = 0;
  r = await call('/properties', {
    token: valid,
    method: 'POST',
    body: {
      property_type: 'land',
      name: '  My Hyderabad Plot  ',
      city: '',
      pincode: '500001',
      area_value: 2400,
      area_unit: 'sqft',
      user_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      account_id: 'acc0000b-0000-0000-0000-00000000000b',
      id: 'evil',
    },
  });
  const insert = seen.find((s) => s.method === 'POST' && s.url.startsWith('/rest/v1/properties'));
  const auditEvent = seen.find(
    (s) => s.method === 'POST' && s.url.startsWith('/rest/v1/audit_events'),
  );
  check(r.status === 201, 'POST /properties → 201', r);
  check(
    insert?.body?.user_id === USER,
    'client-supplied user_id IGNORED; token identity used (§31)',
    insert?.body,
  );
  check(
    insert?.body?.account_id === ACCOUNT,
    'forged account_id IGNORED; Account resolved from the token (M10)',
    insert?.body,
  );
  check(insert && !('id' in insert.body), 'client-supplied id stripped', insert?.body);
  check(
    auditEvent?.body?.action === 'property.created' &&
      auditEvent.body.account_id === ACCOUNT &&
      auditEvent.body.actor_user_id === USER,
    'audit event recorded for the property creation (M11)',
    auditEvent?.body,
  );
  check(insert?.body?.name === 'My Hyderabad Plot', 'name trimmed', insert?.body?.name);
  check(insert?.body?.city === null, 'empty optional field stored as null', insert?.body?.city);

  r = await call('/properties/11111111-1111-1111-1111-111111111111/documents/intent', {
    token: valid,
    method: 'POST',
    body: {
      document_type: 'sale_deed',
      file_name: 'a.exe',
      mime_type: 'application/x-msdownload',
      file_size: 10,
    },
  });
  check(
    r.status === 400 && r.json.error.details?.mime_type,
    'unsupported document type → 400 (§21)',
    r.json,
  );

  r = await call('/properties/11111111-1111-1111-1111-111111111111/documents/intent', {
    token: valid,
    method: 'POST',
    body: {
      document_type: 'sale_deed',
      file_name: 'big.pdf',
      mime_type: 'application/pdf',
      file_size: 11 * 1024 * 1024,
    },
  });
  check(
    r.status === 400 && r.json.error.details?.file_size,
    'document over 10 MB → 400 (§21)',
    r.json,
  );

  // ---- M2 / M3 ----
  const P = '/properties/11111111-1111-1111-1111-111111111111';
  r = await call(`${P}/documents/intent`, {
    token: valid,
    method: 'POST',
    body: {
      document_type: 'tax_receipt',
      file_name: 't.pdf',
      mime_type: 'application/pdf',
      file_size: 10,
    },
  });
  check(
    r.status === 400 && r.json.error.details?.document_type,
    'retired document category rejected (M3: Sale Deed/Registration/Property Tax/Other)',
    r.json,
  );
  r = await call(`${P}/videos/intent`, {
    token: valid,
    method: 'POST',
    body: { mime_type: 'video/x-msvideo', file_size: 10 },
  });
  check(
    r.status === 400 && r.json.error.details?.mime_type,
    'unsupported video type → 400',
    r.json,
  );
  r = await call(`${P}/videos/intent`, {
    token: valid,
    method: 'POST',
    body: { mime_type: 'video/mp4', file_size: 51 * 1024 * 1024 },
  });
  check(r.status === 400 && r.json.error.details?.file_size, 'video over 50 MB → 400', r.json);
  r = await call(`${P}/videos/intent`, {
    token: valid,
    method: 'POST',
    body: { mime_type: 'video/mp4', file_size: 1000, duration_seconds: 300 },
  });
  check(
    r.status === 400 && r.json.error.details?.duration_seconds,
    'video longer than 60 s → 400',
    r.json,
  );
  r = await call(P, { token: valid, method: 'PATCH', body: { latitude: 17.385 } });
  check(
    r.status === 400 && r.json.error.details?.latitude,
    'half a map pin (latitude only) → 400',
    r.json,
  );
  seen.length = 0;
  r = await call(P, {
    token: valid,
    method: 'PATCH',
    body: {
      latitude: 17.385,
      longitude: 78.4867,
      area_value: 1200,
      area_unit: 'sqft',
      location_source: 'ai',
    },
  });
  const patch = seen.find((s) => s.method === 'PATCH');
  check(
    r.status === 200 && patch?.body?.location_source === 'user' && patch.body.location_confirmed_at,
    'confirmed pin stored as a USER-provided location; client-sent source ignored (M2 provenance)',
    patch?.body,
  );
  check(
    patch?.body?.field_sources?.city === 'user' && patch.body.field_sources.area_value === 'user',
    'field provenance merged: earlier sources kept, new fields marked user',
    patch?.body?.field_sources,
  );
  r = await call('/documents/11111111-1111-1111-1111-111111111111', {
    token: valid,
    method: 'PATCH',
    body: { status: 'verified' },
  });
  check(r.status === 400, 'customer cannot set document review status (only staff)', r.json);

  r = await call('/service-requests', {
    token: valid,
    method: 'POST',
    body: { property_id: 'x', service_id: 'y', description: '' },
  });
  check(r.status === 400 && r.json.error.details?.property_id && r.json.error.details?.service_id, 'request with invalid ids → 400 (notes are optional now)', r.json);
  r = await call('/service-requests', { token: valid, method: 'POST', body: { property_id: '11111111-1111-1111-1111-111111111111', service_id: '5e000000-0000-0000-0000-000000000001', preferred_slot: 'midnight' } });
  check(r.status === 400 && r.json.error.details?.preferred_slot, 'unknown time of day rejected', r.json);

  // ---- M5 / M6: Plans, Benefits, Usage, Limited Access ----
  r = await call('/me', { token: valid });
  check(
    r.json?.data?.plan?.access === 'full' &&
      r.json.data.plan.status === 'trialing' &&
      r.json.data.plan.plan_name === 'Free Trial',
    '/me carries the Plan summary (Trial → full access)',
    r.json?.data?.plan,
  );
  r = await call('/plans', { token: valid });
  check(
    r.status === 200 &&
      r.json.data.length === 1 &&
      r.json.data[0].plan_version_id.endsWith('2') &&
      r.json.data[0].benefits.limits.max_properties === 1,
    'GET /plans → current version of each Plan with Benefits',
    r.json,
  );
  r = await call('/account/plan', { token: valid });
  check(
    r.status === 200 &&
      r.json.data.status === 'trialing' &&
      r.json.data.current.days_left > 0 &&
      r.json.data.plan.benefits.included[0].code === 'property_visit',
    'GET /account/plan → status, days left, Included Services',
    r.json,
  );

  planMode = 'basic';
  r = await call('/properties', {
    token: valid,
    method: 'POST',
    body: { property_type: 'land', name: 'Fourth plot' },
  });
  check(
    r.status === 403 &&
      r.json.error.code === 'LIMIT_REACHED' &&
      r.json.error.details?.limit === '1',
    'Basic (1 property) with 3 properties → POST /properties 403 LIMIT_REACHED (API enforces, not the app)',
    r.json,
  );
  r = await call(P, { token: valid, method: 'PATCH', body: { name: 'Renamed' } });
  check(r.status === 200, 'over the property limit: EDITING existing data still allowed', r.json);
  r = await call('/account/plan', { token: valid });
  check(
    r.json?.data?.over_limit?.includes('max_properties'),
    'over-limit state reported (downgrade: data kept, additions blocked)',
    r.json?.data?.over_limit,
  );

  planMode = 'nophotos';
  r = await call(`${P}/photos/intent`, {
    token: valid,
    method: 'POST',
    body: { mime_type: 'image/jpeg', file_size: 1000, width: 100, height: 100 },
  });
  check(
    r.status === 403 && r.json.error.code === 'FEATURE_NOT_INCLUDED',
    'Feature not in Plan → 403 FEATURE_NOT_INCLUDED',
    r.json,
  );

  planMode = 'expired';
  r = await call('/properties', { token: valid });
  check(
    r.status === 402 && r.json.error.code === 'LIMITED_ACCESS',
    'Trial/Plan ended → property list blocked 402 LIMITED_ACCESS (strict)',
    r.json,
  );
  r = await call(`${P}/documents`, { token: valid });
  check(r.status === 402, 'Limited Access: documents blocked', r.json);
  r = await call('/services', { token: valid });
  check(r.status === 402, 'Limited Access: services blocked', r.json);
  r = await call('/me', { token: valid });
  check(
    r.status === 200 &&
      r.json.data.plan.access === 'limited' &&
      r.json.data.plan.status === 'expired',
    'Limited Access: /me still available, reports limited',
    r.json?.data?.plan,
  );
  r = await call('/plans', { token: valid });
  check(r.status === 200, 'Limited Access: available Plans still visible', r.json);
  r = await call('/account/plan', { token: valid });
  check(
    r.status === 200 && r.json.data.plan === null,
    'Limited Access: account Plan status still visible',
    r.json,
  );
  planMode = 'trial';

  r = await call('/properties', { token: await mint({ sub: SUSPENDED }) });
  check(
    r.status === 403 && /not active/.test(r.json.error.message),
    'suspended Account → 403 even with an active Plan',
    r.json,
  );

  // ---- M9 (minimal): staff Plan operations ----
  const TARGET = `/backoffice/accounts/${ACCOUNT}/plan`;
  r = await call(TARGET, { token: valid });
  check(r.status === 404, 'customer → Backoffice route does not exist (404)', r);
  r = await call(`${TARGET}/end`, { token: await mint({ sub: STAFF_SUP }), method: 'POST' });
  check(r.status === 403, 'support staff cannot end a Plan (role check)', r.json);
  seen.length = 0;
  r = await call(TARGET, {
    token: await mint({ sub: STAFF_OPS }),
    method: 'POST',
    body: { plan_code: 'plus' },
  });
  const grant = seen.find((x) => x.method === 'POST' && x.url.startsWith('/rest/v1/account_plans'));
  const staffAudit = seen.find(
    (x) => x.method === 'POST' && x.url.startsWith('/rest/v1/audit_events'),
  );
  check(
    r.status === 201 && grant?.body?.account_id === ACCOUNT && grant.body.source === 'staff',
    'operations staff grants Plus → account_plans row (source staff) for the TARGET account',
    grant?.body,
  );
  check(
    staffAudit?.body?.actor_type === 'staff' &&
      staffAudit.body.account_id === ACCOUNT &&
      staffAudit.body.actor_user_id === STAFF_OPS,
    'staff action audited against the target Account with the staff actor',
    staffAudit?.body,
  );
  r = await call(TARGET, {
    token: await mint({ sub: STAFF_OPS }),
    method: 'POST',
    body: { plan_code: 'nope' },
  });
  check(r.status === 404, 'grant of an unknown Plan → 404', r.json);

  // ---- M4: Services, Included vs Extra, requests ----
  visitsLeft = 1;
  r = await call('/services', { token: valid });
  const byCode = Object.fromEntries((r.json?.data ?? []).map((x) => [x.code, x]));
  check(r.status === 200 && byCode.property_visit?.coverage === 'included' && byCode.property_visit.included_remaining === 1,
    'catalogue: visit shown as Included with 1 left (from the Plan)', byCode.property_visit);
  check(byCode.site_inspection?.coverage === 'extra' && byCode.site_inspection.price_paise === 149900,
    'catalogue: non-included service shown as Extra with its price', byCode.site_inspection);
  check(byCode.legal_only?.coverage === 'unavailable', 'catalogue: neither Included nor Extra → unavailable', byCode.legal_only);
  visitsLeft = 0;
  r = await call('/services', { token: valid });
  check(r.json?.data?.find((x) => x.code === 'property_visit')?.coverage === 'extra', 'allowance used up → visit becomes Extra', r.json);

  r = await call('/service-requests', { token: valid, method: 'POST',
    body: { property_id: '11111111-1111-1111-1111-111111111111', service_id: SVC.closed.id, description: 'x' } });
  check(r.status === 403 && r.json.error.code === 'FEATURE_NOT_INCLUDED', 'unavailable service cannot be requested', r.json);
  r = await call('/service-requests', { token: valid, method: 'POST',
    body: { property_id: '11111111-1111-1111-1111-111111111111', service_id: SVC.visit.id, description: 'x', preferred_date: '2020-01-01' } });
  check(r.status === 400 && r.json.error.details?.preferred_date, 'preferred date in the past → 400', r.json);

  seen.length = 0;
  r = await call('/service-requests', { token: valid, method: 'POST',
    body: { property_id: '11111111-1111-1111-1111-111111111111', service_id: SVC.visit.id, description: 'Visit please', coverage: 'included', price_paise: 0, status: 'completed' } });
  const rpcCall = seen.find((x) => x.url.startsWith('/rest/v1/rpc/create_service_request'));
  check(r.status === 201 && r.json.data.reference === 'PR-000200', 'POST /service-requests → 201', r.json);
  check(rpcCall && !('coverage' in rpcCall.body) && !('price_paise' in rpcCall.body) && !('p_status' in rpcCall.body),
    'request opened via create_service_request(); client coverage/price/status ignored', rpcCall?.body);
  check(!seen.some((x) => x.method === 'POST' && x.url.startsWith('/rest/v1/service_requests')),
    'API never inserts service requests directly', seen.map((x) => x.url));

  reqStatus = 'confirmed';
  r = await call(`/service-requests/${REQ_ID}/cancel`, { token: valid, method: 'POST' });
  check(r.status === 409, 'customer cannot cancel a confirmed request (usage already consumed)', r.json);
  reqStatus = 'requested';
  r = await call(`/service-requests/${REQ_ID}/cancel`, { token: valid, method: 'POST' });
  check(r.status === 200, 'customer can cancel a Requested request', r.json);

  // ---- M9: Backoffice requests ----
  const OPS = await mint({ sub: STAFF_OPS });
  const SUP = await mint({ sub: STAFF_SUP });
  r = await call('/backoffice/requests', { token: valid });
  check(r.status === 404, 'customer → /backoffice/requests is 404', r.status);
  r = await call('/backoffice/requests', { token: SUP });
  check(r.status === 200, 'any staff can view the request queue', r.json);
  r = await call(`/backoffice/requests/${REQ_ID}/status`, { token: SUP, method: 'POST', body: { status: 'confirmed' } });
  check(r.status === 403, 'support staff cannot change request status (role check)', r.json);
  r = await call(`/backoffice/requests/${REQ_ID}/status`, { token: OPS, method: 'POST', body: { status: 'completed' } });
  check(r.status === 409 && /cannot be moved/.test(r.json.error.message), 'invalid transition (Requested → Completed) → 409', r.json);
  r = await call(`/backoffice/requests/${REQ_ID}/status`, { token: OPS, method: 'POST', body: { status: 'scheduled' } });
  check(r.status === 400, 'scheduling without a date → 400', r.json);
  seen.length = 0;
  r = await call(`/backoffice/requests/${REQ_ID}/status`, { token: OPS, method: 'POST', body: { status: 'confirmed', note: 'Booked' } });
  const upd = seen.find((x) => x.url.startsWith('/rest/v1/rpc/staff_update_service_request'));
  const reqAudit = seen.find((x) => x.method === 'POST' && x.url.startsWith('/rest/v1/audit_events'));
  check(r.status === 200 && upd?.body?.p_status === 'confirmed' && upd.body.p_note === 'Booked',
    'operations confirm → staff_update_service_request() (consumes usage in the DB)', upd?.body);
  check(reqAudit?.body?.action === 'staff.service_request.confirmed' && reqAudit.body.account_id === ACCOUNT && reqAudit.body.actor_type === 'staff',
    'status change audited against the customer Account', reqAudit?.body);
  r = await call(`/backoffice/requests/${REQ_ID}/report`, { token: OPS, method: 'PUT', body: { visited_at: '2026-10-05', condition: 'good' } });
  check(r.status === 409, 'no visit report before the request is confirmed', r.json);
  r = await call(`/backoffice/requests/${REQ_ID}/report/media/intent`, { token: OPS, method: 'POST', body: { kind: 'photo', mime_type: 'video/mp4', file_size: 10 } });
  check(r.status === 400, 'visit media: kind/type mismatch → 400', r.json);
  r = await call('/backoffice/services/5e000000-0000-0000-0000-000000000001', { token: SUP, method: 'PATCH', body: { price_paise: 1 } });
  check(r.status === 403, 'support staff cannot edit the catalogue', r.json);
  r = await call(`/backoffice/accounts/${ACCOUNT}`, { token: SUP });
  check(r.status === 200 && r.json.data.account.phone === '919876543210' && r.json.data.blocked_reason === null,
    'account detail: plan, usage and "why blocked" (none)', r.json?.data);

  // ---- Visit report lock ----
  reqStatus = 'completed';
  r = await call(`/backoffice/requests/${REQ_ID}/report`, { token: OPS, method: 'PUT', body: { visited_at: '2026-10-05', condition: 'good' } });
  check(r.status === 409 && /locked/.test(r.json.error.message), 'published report is locked (completed request) → 409', r.json);
  r = await call(`/backoffice/requests/${REQ_ID}/report/media/intent`, { token: OPS, method: 'POST', body: { kind: 'photo', mime_type: 'image/jpeg', file_size: 10 } });
  check(r.status === 409, 'no new media on a published report', r.json);
  reqStatus = 'requested';

  // ---- M7: Payments ----
  r = await call('/billing/checkout', { token: valid, method: 'POST', body: { plan_code: 'plus' } });
  check(r.status === 503 && r.json.error.code === 'PAYMENTS_UNAVAILABLE', 'checkout without provider keys → 503 PAYMENTS_UNAVAILABLE (clear, not a crash)', r.json);
  planMode = 'expired';
  r = await call('/billing/checkout', { token: valid, method: 'POST', body: { plan_code: 'plus' } });
  check(r.status === 503, 'Limited Access: the payment journey stays available (not 402)', r.json);
  r = await call('/billing/orders', { token: valid });
  check(r.status === 200, 'Limited Access: payment history stays available', r.json);
  planMode = 'trial';
  r = await call('/billing/orders/22222222-2222-2222-2222-222222222222', { token: valid });
  check(r.status === 404, "another account's order → 404", r.status);
  r = await call('/billing/checkout', { method: 'POST', body: { plan_code: 'plus' } });
  check(r.status === 401, 'checkout without login → 401', r.status);

  const ORDER = '0d000000-0000-0000-0000-000000000001';
  const hook = (payload, signature, eventId = 'evt_smoke_1') =>
    fetch(`${API}/webhooks/razorpay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(signature ? { 'x-razorpay-signature': signature } : {}), 'x-razorpay-event-id': eventId },
      body: payload,
    });
  const sign = (body) => createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
  const paid = JSON.stringify({
    event: 'payment_link.paid',
    payload: {
      payment_link: { entity: { id: 'plink_smoke', notes: { order_id: ORDER } } },
      payment: { entity: { id: 'pay_smoke', amount: 149900, currency: 'INR', method: 'upi', status: 'captured' } },
    },
  });

  seen.length = 0;
  let w = await hook(paid, null);
  check(w.status === 401, 'webhook without signature → 401', w.status);
  w = await hook(paid, 'deadbeef'.repeat(8));
  check(w.status === 401, 'webhook with a forged signature → 401', w.status);
  w = await hook(paid.replace('149900', '100'), sign(paid));
  check(w.status === 401, 'tampered webhook body (amount changed after signing) → 401', w.status);
  check(!seen.some((x) => x.url.startsWith('/rest/v1/rpc/record_payment_event')),
    'rejected webhooks never reach the database', seen.map((x) => x.url));

  w = await hook(paid, sign(paid));
  const wb = await w.json();
  const rec = seen.find((x) => x.url.startsWith('/rest/v1/rpc/record_payment_event'));
  check(w.status === 200 && wb.data.outcome === 'plan_activated', 'correctly signed webhook → recorded', wb);
  check(rec?.body?.p_order === ORDER && rec.body.p_amount === 149900 && rec.body.p_event_type === 'payment.captured' &&
        rec.body.p_payment_ref === 'pay_smoke' && rec.body.p_checkout_ref === 'plink_smoke' && rec.body.p_event_id === 'evt_smoke_1',
    'webhook normalised to a provider-neutral payment event', rec?.body);
  check(rec?.apikey === SECRET_KEY, 'only the webhook path uses the server key', rec?.apikey?.slice(0, 12));
  check(seen.filter((x) => x.apikey === SECRET_KEY).every((x) => x.url.startsWith('/rest/v1/rpc/record_payment_event')),
    'server key used for record_payment_event and nothing else', seen.filter((x) => x.apikey === SECRET_KEY).map((x) => x.url));

  r = await call('/cron/keepalive');
  check(r.status === 401, 'keep-alive cron without the cron secret → 401', r);
  const cron = await fetch(`${API}/cron/keepalive`, {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  const cronBody = await cron.json();
  check(
    cron.status === 200 && cronBody.data.database_time,
    'keep-alive cron with the secret → touches the database',
    cronBody,
  );
} finally {
  api.kill('SIGTERM');
  fake.close();
}

console.log(failed === 0 ? '\nALL API SMOKE CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
