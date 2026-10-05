// Serves the built Vercel bundle with plain Node (no tsx, no TypeScript),
// the same way Vercel invokes it: the default export as a (req, res) handler.
// Used by `npm run test:bundle`.
import { createServer } from 'node:http';

const { default: handler } = await import('../.vercel/output/functions/index.func/index.mjs');

createServer(handler).listen(Number(process.env.PORT ?? 4000));
