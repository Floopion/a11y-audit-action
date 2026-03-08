# a11y-audit-action

## Project

GitHub Action for WCAG 2.2 accessibility audits. Composite action using Playwright + axe-core.

- **Language:** TypeScript, compiled with `@vercel/ncc`
- **Build:** `npm run build` (ncc with playwright + @axe-core/playwright as externals)
- **Test:** `npm test` (vitest)
- **Typecheck:** `npm run typecheck`

## Architecture

Composite action (`action.yml` with `runs.using: composite`):
1. Installs Playwright Chromium via `npx playwright install chromium --with-deps`
2. Installs runtime deps via `npm ci`
3. Runs ncc-compiled scanner via `node dist/index.js`

Playwright and `@axe-core/playwright` are ncc externals — resolved from node_modules at runtime.

## File layout

- `src/index.ts` — entry point, orchestrates scan + comment
- `src/scanner.ts` — Playwright + axe-core scanning engine
- `src/comment.ts` — PR comment markdown formatter
- `src/github.ts` — GitHub API helpers (find PR, upsert comment)
- `src/config.ts` — input parsing + WCAG tag resolution
- `src/types.ts` — shared interfaces
- `dist/index.js` — committed ncc output

## Conventions

- NZ English spelling
- Conventional commits, max 72 char subject
- No Co-Authored-By lines
- Keep PR comments under 60,000 chars (GitHub limit is 65,536)
- WCAG tag resolution is cumulative (wcag22aa includes all lower levels)
