# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

The package manager is **pnpm**, pinned via `packageManager` in `package.json`. Do not use npm — it will produce a competing lockfile.

```bash
pnpm install
pnpm dev        # Vite dev server on :5173
pnpm build      # tsc -b && vite build
pnpm lint       # oxlint
pnpm preview    # serve the production build
```

`pnpm build` type-checks before bundling, so it is the single most useful check. To type-check alone: `pnpm exec tsc -b`.

**There are no tests and no test framework.** Do not add one unless asked — the project has deliberately deferred this.

## Project phasing — read before building anything

This repo is built in explicit, ordered phases, and *not building ahead* is a hard requirement. Phase 1 (application foundation) is in progress:

1. React/Vite/TypeScript ✅
2. Tailwind CSS ✅
3. React Router ✅
4. App shell (`AppLayout`, `Header`) ✅
5. Landing page ✅
6. Dashboard placeholder — next
7. Placeholder product pages
8. Supabase client foundation
9. wagmi + viem wallet connectivity (Sepolia)
10. Root providers

Explicitly **out of scope until a later phase**, even though the product vision implies them: Supabase schema or auth, receipt upload, OCR/AI parsing, warranty creation, smart contracts, ENSv2, onchain receipt hashes, product transfers, QR codes, service records, notifications.

Avoid speculative abstractions for features that do not exist yet. Placeholder pages should have a heading and a sentence about what will live there — not mock implementations or fake data.

## Architecture

Small and deliberately flat:

- `src/main.tsx` — root providers wrap `<App />`. Currently `StrictMode` → `BrowserRouter`. Later phases add `WagmiProvider` and `QueryClientProvider` **outside** `BrowserRouter`.
- `src/App.tsx` — the route table. Every route nests inside a single `AppLayout` layout route.
- `src/components/layout/` — `AppLayout` (shell, renders `<Outlet />`) and `Header` (wordmark + nav). Pages never repeat shell markup; the wallet button slots into `Header` in phase 9.
- `src/components/ui/` — shared primitives. Currently just `ButtonLink` (a router `Link` styled as a button, `primary` / `secondary`). Extract here on the second use, not in anticipation of one.
- `src/pages/*.tsx` — one component per route, default-exported, rendering only page content.
- `src/index.css` — Tailwind import, design tokens, base layer.

Routes: `/`, `/dashboard`, `/products/new`, `/products/:id`, `/products/:id/transfer`, `/verify/:id`, `/settings`, and a `*` catch-all. `/products/new` correctly beats `/products/:id` because React Router ranks static segments above dynamic ones.

## Version-specific gotchas

The toolchain is newer than most training data and most tutorials. These will bite:

**Tailwind v4** — configured entirely in CSS. There is **no `tailwind.config.js`**, no PostCSS setup, and no `content` array. Tokens live in the `@theme` block of `src/index.css` and are emitted as utilities automatically (`--color-ink-muted` → `text-ink-muted`). Add tokens there; never create a config file.

`src/index.css` contains `@source not '../docs'`. This is load-bearing: Tailwind v4 auto-scans the whole project, so example class names in markdown get compiled into the production bundle. Removing that line silently inflates the CSS. If you add docs elsewhere containing class names, exclude them too.

Tailwind v4 also tree-shakes unused theme tokens, so a defined-but-unused token legitimately will not appear in `dist/`. That is not a broken config.

**React Router v8** — `react-router-dom` no longer exists as a separate package. Import everything from `react-router`.

**TypeScript** — `strict: true` was added manually to both tsconfigs; the create-vite template omitted it. `verbatimModuleSyntax` is on, so use `import type` for type-only imports. `allowImportingTsExtensions` is on, hence `import App from './App.tsx'`.

**Stack versions:** React 19, Vite 8, TypeScript 6, oxlint (not ESLint), Node 20.19+.

## Styling conventions

`docs/design-system.md` is the source of truth for conventions; `src/index.css` is the source of truth for values.

Use the semantic tokens rather than Tailwind's built-in palette — `bg-canvas`, `bg-surface`, `border-line`, `text-ink`, `text-ink-muted`, `bg-brand-600`, `rounded-card`. Writing `bg-slate-50` where `bg-canvas` is meant breaks the ability to retheme.

Cards are `rounded-card border border-line bg-surface p-6 sm:p-8` — hairline borders, not shadows. `text-ink-muted` on `canvas` measures ~4.6:1, which clears WCAG AA with almost no margin, so do not use it below 14px or at light weights.

⚠️ `docs/reference/creativity-studio.md` is **not** this project's design system. It is a 603-line document for an unrelated creative agency site, kept only as inspiration, and its rules directly contradict ours (borderless cards, orange gradients, CDN fonts). Do not implement anything from it.

## Security constraints

This app will eventually handle receipts and wallet connectivity, so two constraints are worth stating explicitly:

- Anything prefixed `VITE_` is **embedded in the client bundle and publicly readable**. Only public configuration belongs there — the Supabase anon key and URL, never a service-role key or any private API key.
- No wallet private keys in the app, no custom crypto, and no personal information written onchain.

## Verification

A green build does not prove much on its own — it will not catch a route that never matches or a design token that never emits a utility. When changing routing or tokens, verify the actual behavior: render routes through a `MemoryRouter` harness, or grep `dist/assets/*.css` for the utilities you expect. Delete any temporary harness afterward.

Deep links work in dev because Vite falls back to `index.html`. A static host needs an explicit rewrite rule (`/* → /index.html`) or `/products/abc123` will 404 on refresh.
