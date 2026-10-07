# Propittu — working notes for Claude

Monorepo: `apps/api` (Express on Vercel), `apps/mobile` (Expo), `packages/shared`, `supabase/`.

Read before changing things:
- `docs/UI_GUIDELINES.md` — the design rules every screen follows (flat, calm, aligned; reuse the
  shared components) and the hand-over checklist.
- `docs/ARCHITECTURE.md` — where things live, how data flows, the rules for every change.
- `docs/DECISIONS.md` and `docs/PENDING.md` — product decisions and open items.
- `apps/mobile/AGENTS.md` — Expo specifics.

Before committing: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`,
`npm run test:ai --workspace @propittu/api`, and `npx knip` (no unused files/exports/deps).

Never commit secrets, real phone numbers or personal data (the repo is public).
