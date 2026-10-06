// Builds the API into Vercel's Build Output API v3 layout:
//
//   .vercel/output/
//     config.json                      routes every path to the function + daily cron
//     functions/index.func/
//       .vc-config.json                Node 22, Mumbai region
//       index.mjs                      the WHOLE API as one self-contained bundle
//
// Bundling ourselves (rather than letting Vercel trace and compile the
// TypeScript) means the deployed code is exactly what was tested locally,
// and the workspace package @propittu/shared needs no special handling.
//
// Usage: npm run build --workspace @propittu/api

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = `${root}.vercel/output`;
const fn = `${output}/functions/index.func`;

await rm(output, { recursive: true, force: true });
await mkdir(fn, { recursive: true });

const result = await build({
  entryPoints: [`${root}src/vercel.ts`],
  outfile: `${fn}/index.mjs`,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: 'linked',
  // Some dependencies (Express) are CommonJS and call require() for Node
  // built-ins; give the ESM bundle a real require so those calls work.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  // Dev-only pretty logger; referenced by name, never loaded in production.
  external: ['pino-pretty'],
  logLevel: 'warning',
  metafile: true,
});

await writeFile(
  `${fn}/.vc-config.json`,
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      shouldAddSourcemapSupport: true,
      // Mumbai — same region as the Supabase project (ap-south-1).
      regions: ['bom1'],
      // Document readings (AI) run after the response for up to ~1–2 min.
      maxDuration: 120,
    },
    null,
    2,
  ),
);

await writeFile(
  `${output}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [{ src: '/(.*)', dest: '/index' }],
      // Daily DB touch so the Supabase free plan never pauses for inactivity.
      crons: [{ path: '/cron/keepalive', schedule: '0 3 * * *' }],
    },
    null,
    2,
  ),
);

const bytes = Object.values(result.metafile.outputs).reduce((n, o) => n + o.bytes, 0);
console.log(`Built .vercel/output (bundle ${(bytes / 1024).toFixed(0)} KB)`);
