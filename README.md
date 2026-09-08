# WarrantyPass

Keep the warranty with the product.

WarrantyPass is a consumer app for keeping portable digital records of product
ownership, receipts, warranties, repairs, and ownership transfers.

## Status

**Phase 1 — application foundation (in progress).**

Currently in place:

- React + Vite + TypeScript (strict)

Not yet built: Tailwind CSS, React Router, the app shell, page placeholders,
the Supabase client, and the wagmi/viem wallet setup.

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
