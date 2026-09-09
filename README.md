# WarrantyPass

Keep the warranty with the product.

WarrantyPass is a consumer app for keeping portable digital records of product
ownership, receipts, warranties, repairs, and ownership transfers.

## Status

**Phase 1 — application foundation (in progress).**

Currently in place:

- React + Vite + TypeScript (strict)
- Tailwind CSS v4
- React Router, with placeholder pages for every route
- Shared app shell (header + layout)
- Supabase client foundation

Not yet built: the wagmi/viem wallet setup, and any real product data.

## Environment

Copy [`.env.example`](.env.example) to `.env` and fill in the values:

| Variable                 | Purpose                                   |
| ------------------------ | ----------------------------------------- |
| `VITE_SUPABASE_URL`      | Supabase project URL                      |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key                  |

**Anything prefixed `VITE_` is compiled into the client bundle in plain text
and is publicly readable.** Only public configuration belongs there — never a
service-role key or any private API key. Access to data is expected to be
restricted by row-level security, not by keeping the anon key secret.

The app runs without these set: [`src/lib/supabase.ts`](src/lib/supabase.ts)
exports `supabase` as `null` and `isSupabaseConfigured` as `false`, and warns
once in the dev console. Check the flag before using the client.

## Routes

Client-side routing via React Router. Page components live in
[`src/pages/`](src/pages/) and the route table is in
[`src/App.tsx`](src/App.tsx).

| Path                     | Page                    | Purpose                        |
| ------------------------ | ----------------------- | ------------------------------ |
| `/`                      | `HomePage`              | Landing page                   |
| `/dashboard`             | `DashboardPage`         | The user's WarrantyPasses      |
| `/products/new`          | `AddProductPage`        | Add a product                  |
| `/products/:id`          | `ProductDetailsPage`    | WarrantyPass detail            |
| `/products/:id/transfer` | `TransferProductPage`   | Ownership transfer             |
| `/verify/:id`            | `VerifyProductPage`     | Public verification            |
| `/settings`              | `SettingsPage`          | Account and wallet settings    |
| `*`                      | `NotFoundPage`          | Not Found                      |

All pages are placeholders. Every route renders inside `AppLayout`
([`src/components/layout/`](src/components/layout/)), which is wired as a
layout route — pages render through its `Outlet` and inherit the header and
content width, so no page repeats the shell markup.

Note that `react-router` v7+ merged `react-router-dom` into the core package —
import from `react-router`.

Deploying to a static host requires a rewrite rule sending unmatched paths to
`index.html`, otherwise deep links such as `/products/abc123` will 404.

## Styling

Tailwind CSS v4, configured entirely in CSS — there is no
`tailwind.config.js`. Design tokens live in the `@theme` block of
[`src/index.css`](src/index.css), which is the source of truth for values.

See [`docs/design-system.md`](docs/design-system.md) for the tokens, layout
conventions, accessibility notes, and voice.

## Documentation

| Document                                                            | Purpose                                            |
| ------------------------------------------------------------------- | -------------------------------------------------- |
| [`docs/design-system.md`](docs/design-system.md)                     | WarrantyPass design system — tokens and conventions |
| [`docs/reference/creativity-studio.md`](docs/reference/creativity-studio.md) | Unrelated design system kept as inspiration only    |

## Requirements

- Node.js 20.19+ or 22.12+ (developed on Node 25)
- pnpm 10+ (the project pins pnpm via `packageManager`; run `corepack enable`
  to have Node use the pinned version automatically)

## Getting started

```bash
pnpm install
pnpm dev
```

## Scripts

| Command        | Description                                    |
| -------------- | ---------------------------------------------- |
| `pnpm dev`     | Start the Vite dev server                      |
| `pnpm build`   | Type-check (`tsc -b`) and build for production |
| `pnpm lint`    | Run oxlint                                     |
| `pnpm preview` | Serve the production build locally             |
