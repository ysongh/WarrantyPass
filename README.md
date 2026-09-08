# WarrantyPass

Keep the warranty with the product.

WarrantyPass is a consumer app for keeping portable digital records of product
ownership, receipts, warranties, repairs, and ownership transfers.

## Status

**Phase 1 — application foundation (in progress).**

Currently in place:

- React + Vite + TypeScript (strict)
- Tailwind CSS v4

Not yet built: React Router, the app shell, page placeholders, the Supabase
client, and the wagmi/viem wallet setup.

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
