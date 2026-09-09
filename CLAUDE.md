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

**There are no tests and no test framework.** Do not add one unless asked — the project has deliberately deferred this. `jiti` is available as a transitive dependency (`node_modules/.bin/jiti file.ts`) and will run a throwaway harness against real `src/` modules when you need to check logic — useful for date arithmetic under `TZ=…`. Delete the harness afterwards.

The database schema lives in `supabase/migrations/`. `supabase db push` applies it to a linked project; `supabase db reset` replays it locally (needs Docker). Never create tables through the dashboard UI — the schema must be reproducible from the migration files.

## Project phasing — read before building anything

This repo is built in explicit, ordered phases, and *not building ahead* is a hard requirement.

**Phase 1 — application foundation ✅**

React/Vite/TypeScript, Tailwind, React Router, app shell, landing page, placeholder pages, Supabase client, wagmi + viem (Sepolia), root providers.

**Phase 2 — offchain product records ✅**

1. Anonymous Supabase authentication ✅
2. `products` + `warranties` schema, in a migration ✅
3. Row-level security on both tables ✅
4. Atomic creation via `create_product_with_warranty` ✅
5. Manual Add Product form ✅
6. Real dashboard cards, filters, and states ✅
7. Product detail page ✅
8. Derived warranty status ✅

Phase 2 is complete. Do not start Phase 3 (private receipt upload, receipt parsing/extraction) without being asked.

Explicitly **out of scope until a later phase**, even though the product vision implies them: receipt upload, Supabase Storage, OCR/AI parsing, receipt hashes, smart contracts, ENSv2, onchain writes, product transfers, QR codes, service records, notifications, public verification data.

Avoid speculative abstractions for features that do not exist yet. Placeholder pages should have a heading and a sentence about what will live there — not mock implementations or fake data.

## Architecture

Small and deliberately flat:

- `src/main.tsx` — root providers wrap `<App />`, nested `StrictMode` → `WagmiProvider` → `QueryClientProvider` → `AuthProvider` → `BrowserRouter`. wagmi requires react-query above it; keep both outside the router. `AuthProvider` sits below react-query because product queries key off the user id it publishes.
- `src/App.tsx` — the route table. Every route nests inside a single `AppLayout` layout route.
- `src/components/layout/` — `AppLayout` (shell, renders `<Outlet />`) and `Header` (wordmark + nav). Pages never repeat shell markup.
- `src/components/ui/` — shared primitives: `ButtonLink` (navigation), `Button` (actions), `TextField` / `SelectField`. Extract here on the second use, not in anticipation of one.
- `src/components/auth/` — `AuthProvider` (bootstraps the anonymous session) and `SessionGate` (wraps anything that reads or writes product data).
- `src/components/products/` — `ProductCard`, `ProductForm`, `WarrantyStatusBadge`.
- `src/hooks/` — `useAuthSession`, and `useProducts` / `useProduct` / `useCreateProduct` over TanStack Query.
- `src/lib/products.ts` — every Supabase read and write for products. Pages never build queries themselves.
- `src/lib/warrantyStatus.ts`, `src/lib/warrantyDates.ts` — derived status and date-only arithmetic.
- `src/types/product.ts` — hand-written domain types. If `supabase gen types` is ever adopted, generate into a separate module and derive these from it rather than keeping two hand-maintained copies.
- `src/pages/*.tsx` — one component per route, default-exported, rendering only page content.
- `src/lib/supabase.ts` — browser client. Exports `supabase`, which is **`SupabaseClient | null`**, plus `isSupabaseConfigured`. It is nullable on purpose: the app must run locally without a Supabase project, so check the flag (or narrow the null) before use rather than making the export non-nullable.
- `src/lib/wagmi.ts` — wagmi **v3** (not v2; connectors live at `wagmi/connectors`). Sepolia only, injected connector only — no WalletConnect project ID needed. `VITE_SEPOLIA_RPC_URL` optionally overrides the default public RPC.
- `src/components/wallet/WalletButton.tsx` — connect / shortened address / disconnect, slotted into `Header`.
- `src/index.css` — Tailwind import, design tokens, base layer.

Addresses from wagmi are **EIP-55 checksummed** (mixed case). Never compare one to a stored address with a bare `===` — normalise case on both sides first.

Routes: `/`, `/dashboard`, `/products/new`, `/products/:id`, `/products/:id/transfer`, `/verify/:id`, `/settings`, and a `*` catch-all. `/products/new` correctly beats `/products/:id` because React Router ranks static segments above dynamic ones. `/products/:id` takes the product **UUID** — `public_id` is reserved for the future public verify route.

## Dates

Postgres `date` columns arrive as bare `YYYY-MM-DD` strings. **Never pass one to `new Date(string)`**: that is specified to parse as UTC midnight and renders as the previous day anywhere west of Greenwich, which expires warranties a day early across the Americas. Use `parseIsoDate` from `src/lib/warrantyDates.ts`, which builds a *local* midnight, and `formatIsoDate` for display.

Day counts round rather than floor, because local midnights are 23 or 25 hours apart across a daylight-saving boundary. `addMonths` clamps to the end of the target month, so a year from Feb 29 is Feb 28, not Mar 1.

Warranty status is **derived from `end_date`, never stored** — a status column is wrong by the next midnight. `active` is >30 days remaining, `expiring` is 0–30 inclusive, `expired` is past the end date.

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

This app handles receipts and wallet connectivity, so these constraints are worth stating explicitly:

- Anything prefixed `VITE_` is **embedded in the client bundle and publicly readable**. Only public configuration belongs there — the Supabase anon key and URL, never a service-role key or any private API key.
- No wallet private keys in the app, no custom crypto, and no personal information written onchain.
- **The Supabase `auth.uid()` is the only authorization identity.** A connected wallet address is *not* one: the browser claiming an address proves nothing to Postgres. Never filter a query or write a policy against a wallet address. See `docs/data-model.md`.
- **RLS is the security boundary, not the app.** `src/lib/products.ts` deliberately does not filter by `user_id`. Adding such a filter would imply the client enforces ownership, and would silently become the only check if a policy were ever dropped.
- **Never add an `anon` policy to `products` or `warranties`.** Both tables explicitly revoke `anon`. Serial numbers, prices, and retailers are private. `/verify/:id` stays a placeholder until public verification has its own explicit projection of safe fields — do not make it work by loosening RLS.
- Serial numbers never appear on the dashboard, and are masked on the detail page behind an explicit Show control. Do not log them.
- `public_id` must stay opaque and randomly generated by the database. Never derive it from serial number, model, email, wallet address, or user name.

## Verification

A green build does not prove much on its own — it will not catch a route that never matches or a design token that never emits a utility. When changing routing or tokens, verify the actual behavior: render routes through a `MemoryRouter` harness, or grep `dist/assets/*.css` for the utilities you expect. Delete any temporary harness afterward.

Date logic is the other thing a build will not catch. Run it under several zones — `TZ=Pacific/Midway` (UTC-11) and `TZ=Pacific/Kiritimati` (UTC+14) are the useful extremes — not just your own.

**The migration cannot be verified without Docker or a linked project.** `supabase db reset` needs a local stack. If neither is available, say so rather than implying the SQL was executed.

Deep links work in dev because Vite falls back to `index.html`. A static host needs an explicit rewrite rule (`/* → /index.html`) or `/products/abc123` will 404 on refresh.
