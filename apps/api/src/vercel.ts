import { createApp } from './app.js';

/**
 * Vercel entry point. Vercel invokes the default export as a Node
 * (req, res) handler, which is exactly what an Express app is, so no
 * adapter is needed. Local development keeps using src/index.ts (listen).
 */
export default createApp();
