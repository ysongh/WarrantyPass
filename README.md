# WarrantyPass

Keep the warranty with the product.

WarrantyPass is a consumer app for keeping portable digital records of product
ownership, receipts, warranties, repairs, and ownership transfers.

## Status

**Phase 2 — offchain product records (complete).**

Phase 1 foundation:

- React + Vite + TypeScript (strict)
- Tailwind CSS v4
- React Router
- Shared app shell (header + layout)
- Supabase client foundation
- Wallet connectivity (wagmi + viem, Sepolia)

Phase 2 adds:

- Anonymous Supabase authentication, persisted across reloads
- `products` and `warranties` tables with row-level security
- Atomic product + warranty creation through a database function
- A real Add product form with validation and coverage-length presets
- A dashboard with warranty status, filters, and loading/empty/error states
- A product detail page, with the serial number masked

No receipts, no AI, no smart contracts, no ENS, and no transfers yet.

**Setup requires one dashboard toggle:** anonymous sign-ins must be enabled on
the Supabase project, and the migration must be applied. See
[`docs/data-model.md`](docs/data-model.md).

## Wallet

[`src/lib/wagmi.ts`](src/lib/wagmi.ts) configures **Sepolia** with the injected
connector only, so a browser wallet such as MetaMask works with no third-party
project ID. [`WalletButton`](src/components/wallet/WalletButton.tsx) sits in the
header: it connects, shows a shortened `0x1234…5678`, offers Disconnect, and
prompts to switch network if the wallet is on the wrong chain.

Addresses returned by wagmi are EIP-55 checksummed, so compare them
case-insensitively against anything stored elsewhere.

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
once in the dev console. Check the flag before using the client. Product pages
detect this and say the app is not connected to a database rather than showing
an empty account.

## Database

Schema, row-level security, the anonymous auth model, and how to apply
migrations are documented in [`docs/data-model.md`](docs/data-model.md).

Two things are required before product features work:

1. **Enable anonymous sign-ins** in the Supabase dashboard under
   Authentication → Sign In / Providers. The `enable_anonymous_sign_ins = true`
   in [`supabase/config.toml`](supabase/config.toml) applies only to a local
   `supabase start` — it does not configure a hosted project.
2. **Apply the migration**, with `supabase db push` against a linked project,
   `supabase db reset` locally, or by pasting
   [the migration](supabase/migrations/) into the SQL editor.

Rows are owned by an anonymous Supabase user's `auth.uid()`. **A connected
wallet address is not an authorization identity** — the browser claiming an
address proves nothing to Postgres. Never filter or write a policy on one.

## Routes

Client-side routing via React Router. Page components live in
[`src/pages/`](src/pages/) and the route table is in
[`src/App.tsx`](src/App.tsx).

| Path                     | Page                    | Purpose                        | Status      |
| ------------------------ | ----------------------- | ------------------------------ | ----------- |
| `/`                      | `HomePage`              | Landing page                   | Built       |
| `/dashboard`             | `DashboardPage`         | The user's WarrantyPasses      | Built       |
| `/products/new`          | `AddProductPage`        | Add a product                  | Built       |
| `/products/:id`          | `ProductDetailsPage`    | WarrantyPass detail            | Built       |
| `/products/:id/transfer` | `TransferProductPage`   | Ownership transfer             | Placeholder |
| `/verify/:id`            | `VerifyProductPage`     | Public verification            | Placeholder |
| `/settings`              | `SettingsPage`          | Account and wallet settings    | Placeholder |
| `*`                      | `NotFoundPage`          | Not Found                      | Built       |

`/products/:id` takes the product's UUID. It is an authenticated, private route;
row-level security is what protects it, and a product belonging to someone else
is indistinguishable from one that does not exist.

`/verify/:id` reads nothing from the database. It stays a placeholder until
public verification has a deliberate public-data model — see
[`docs/data-model.md`](docs/data-model.md).

Every route renders inside `AppLayout`
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
| [`docs/data-model.md`](docs/data-model.md)                           | Schema, RLS, anonymous auth, migration workflow     |
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
