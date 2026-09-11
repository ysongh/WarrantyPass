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

**There is no JavaScript test framework, and `pnpm test` does not exist.** Do not add one unless asked — the project has deliberately deferred this. Two throwaway-harness techniques cover most of what you would want a test for; delete the harness afterwards either way.

The Solidity side is the exception: `forge test` is real, committed, and expected to pass (see *Contracts* below). That is a separate toolchain, not a foothold for adding a JS runner.

For **plain `.ts` logic** (date arithmetic, parsers, mappers), `jiti` is available as a transitive dependency: `node_modules/.bin/jiti harness.ts`, useful under `TZ=…`.

For **anything with JSX**, jiti fails with a parse error — it does not transform TSX. Build the harness with Vite instead and run the output:

```bash
pnpm exec vite build --ssr harness.ts --outDir .harness-dist
node .harness-dist/harness.js          # render with renderToStaticMarkup, assert on the HTML
rm -rf harness.ts .harness-dist
```

The harness must live **inside the project** for bare imports like `react` to resolve. Vite also supplies `import.meta.env`, which is why `src/lib/supabase.ts` does not explode on import.

The database schema lives in `supabase/migrations/`. `supabase db push` applies it to a linked project; `supabase db reset` replays it locally (needs Docker). Never create tables through the dashboard UI — the schema must be reproducible from the migration files.

Edge Functions live in `supabase/functions/`. They deploy without Docker (the "Docker is not running" warning is harmless):

```bash
supabase secrets set ANTHROPIC_API_KEY=...   # never a VITE_ variable
supabase functions deploy parse-receipt
supabase secrets list                        # names and digests only
```

Solidity uses **Foundry**, installed at the system level (`~/.foundry/bin`) — it is not an npm dependency and adds nothing to `package.json`:

```bash
forge build            # compile; artifacts to contracts/out (gitignored)
forge test -vv         # the registry suite
forge fmt              # format .sol
forge build --sizes    # deployed bytecode size
```

`contracts/lib/forge-std` is a **git submodule**. A fresh clone needs `git submodule update --init --recursive`, or `forge test` will fail to resolve `forge-std/Test.sol`.

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

**Phase 3 — private receipts ✅**

1. `receipts` table + RLS, in a migration ✅
2. Private `receipts` Storage bucket with per-user object policies ✅
3. Client-side upload, with magic-byte validation and a SHA-256 of the original bytes ✅
4. `parse-receipt` Edge Function: Claude vision behind the user's own token ✅
5. Validated extraction schema, enforced on both write and read ✅
6. Review-and-edit before save, with candidate selection ✅
7. Atomic receipt attachment inside `create_product_with_warranty` ✅
8. Private receipt section on the product detail page ✅

**Phase 4 — onchain proof 🚧 in progress**

1. `blockchain_records` table + RLS, in a migration ✅ *(applied to the linked project)*
2. `receipts.receipt_keccak256` column ✅
3. Foundry toolchain ✅
4. `WarrantyPassRegistry.sol` ✅
5. Contract test suite ✅ *(29 passing, incl. 2 fuzz)*
6. `hash-receipt` Edge Function — keccak256 server-side ⚠️ *written, **not deployed**, never executed*
7. `getProductKey` / date→timestamp helpers ✅
8. ABI export ✅ — **Sepolia deployment ❌**
9. Create-proof UX, reconciliation, conflict states ⚠️ *built; never run against a live chain or wallet*

Do not mark Phase 4 complete until 6, 8 and 9 land. Two specifics:

**There is no deployed contract address.** `VITE_WARRANTY_PASS_REGISTRY_ADDRESS` is blank and `registryAddress` correctly resolves to `null`. Frontend work must treat that as "proof unavailable" — never a hardcoded or guessed address.

**`hash-receipt` has never run.** It type-checks and its logic is reviewed, but nothing has executed it against real Storage. Do not describe it as working until `supabase functions deploy hash-receipt` has happened and the smoke tests in `docs/deployment.md` pass.

Still explicitly **out of scope until a later phase**: ENSv2, product ownership/transfer, NFTs of any kind, QR codes, service records, notifications, public verification data. Phase 4 adds onchain *writes* but no ownership model — see *Onchain proof* below.

Also deliberately deferred *within* the receipt feature: PDF receipts (images only — do not fake support), deleting a receipt once it is attached to a product, and any sweep of abandoned unattached receipts. An unattached receipt is acceptable draft data.

Avoid speculative abstractions for features that do not exist yet. Placeholder pages should have a heading and a sentence about what will live there — not mock implementations or fake data.

## Architecture

Small and deliberately flat:

- `src/main.tsx` — root providers wrap `<App />`, nested `StrictMode` → `WagmiProvider` → `QueryClientProvider` → `AuthProvider` → `BrowserRouter`. wagmi requires react-query above it; keep both outside the router. `AuthProvider` sits below react-query because product queries key off the user id it publishes.
- `src/App.tsx` — the route table. Every route nests inside a single `AppLayout` layout route.
- `src/components/layout/` — `AppLayout` (shell, renders `<Outlet />`) and `Header` (wordmark + nav). Pages never repeat shell markup.
- `src/components/ui/` — shared primitives: `ButtonLink` (navigation), `Button` (actions), `TextField` / `SelectField`. Extract here on the second use, not in anticipation of one.
- `src/components/auth/` — `AuthProvider` (bootstraps the anonymous session) and `SessionGate` (wraps anything that reads or writes product data).
- `src/components/products/` — `ProductCard`, `ProductForm`, `WarrantyStatusBadge`. `ProductForm` is the **only** product form: the scan flow prefills it, it does not get a variant.
- `src/components/receipts/` — `ReceiptUploader`, `ReceiptPreview`, `ReceiptParsingState`, `ReceiptExtractionReview`. Presentational; all I/O goes through the hooks.
- `src/hooks/` — `useAuthSession`; `useProducts` / `useProduct` / `useCreateProduct`; `useReceipts.ts` (upload, parse, discard, product receipt, signed view URL) over TanStack Query.
- `src/lib/products.ts` — every Supabase read and write for products. Pages never build queries themselves.
- `src/lib/receipts.ts` — the same for receipts, plus Storage. No component touches Storage directly.
- `src/lib/receiptExtraction.ts` — validates AI output and maps it to form defaults. **Duplicated on purpose** in `supabase/functions/parse-receipt/extraction.ts`: browser and Deno are separate runtimes. Change both.
- `src/lib/supabaseErrors.ts` — turns Postgrest/Storage/Functions failures into copy safe to render. Raw errors are logged, never shown.
- `src/lib/warrantyStatus.ts`, `src/lib/warrantyDates.ts` — derived status and date-only arithmetic.
- `src/lib/money.ts` — currency formatting, with a fallback for codes `Intl` rejects.
- `src/types/product.ts`, `src/types/receipt.ts` — hand-written domain types. If `supabase gen types` is ever adopted, generate into a separate module and derive these from it rather than keeping two hand-maintained copies.
- `supabase/functions/parse-receipt/` — `index.ts` (auth, ownership, status transitions), `provider.ts` (everything Anthropic-specific), `extraction.ts` (the validator). One provider, no abstraction over providers.
- `src/pages/*.tsx` — one component per route, default-exported, rendering only page content.
- `src/lib/supabase.ts` — browser client. Exports `supabase`, which is **`SupabaseClient | null`**, plus `isSupabaseConfigured`. It is nullable on purpose: the app must run locally without a Supabase project, so check the flag (or narrow the null) before use rather than making the export non-nullable.
- `src/lib/wagmi.ts` — wagmi **v3** (not v2; connectors live at `wagmi/connectors`). Sepolia only, injected connector only — no WalletConnect project ID needed. `VITE_SEPOLIA_RPC_URL` optionally overrides the default public RPC.
- `src/components/wallet/WalletButton.tsx` — connect / shortened address / disconnect, slotted into `Header`.
- `src/components/blockchain/OnchainProofCard.tsx` — every proof state on the product page. Renders `null` when no registry is configured.
- `src/hooks/useOnchainProof.ts` — chain reads, background reconciliation, and the create-proof mutation. Nothing here broadcasts without a click.
- `src/lib/blockchainRecords.ts` — every Supabase read/write for `blockchain_records`, plus `deriveProofState`. That function is **pure and its precedence order is the safety property** — see *Onchain proof*.
- `src/lib/contracts/warrantyPass.ts` — address config, typed reads, `buildRegisterWarrantyArgs`, `compareOnchainRecord`, explorer links. Hand-written; never regenerated.
- `src/contracts/warrantyPassRegistry.ts` — **generated** ABI. `forge build && pnpm sync:abi`. Never hand-edit, never paste an ABI elsewhere.
- `src/lib/productKey.ts`, `src/lib/chainDates.ts` — `keccak256(utf8 public_id)` and date→**UTC**-midnight `uint64`. Both throw on malformed input rather than producing a permanent wrong value.
- `src/index.css` — Tailwind import, design tokens, base layer.
- `foundry.toml` — Foundry config. Every path is redirected under `contracts/`; see the gotcha below for why that is not optional.
- `contracts/src/WarrantyPassRegistry.sol` — the proof registry. Write-once, permissionless, no admin, no proxy, no token.
- `contracts/test/` — `forge test` suites. Solidity, not TypeScript.
- `contracts/lib/` — git submodules (`forge-std`). Not npm packages.

Addresses from wagmi are **EIP-55 checksummed** (mixed case). Never compare one to a stored address with a bare `===` — normalise case on both sides first.

Routes: `/`, `/dashboard`, `/products/new`, `/products/:id`, `/products/:id/transfer`, `/verify/:id`, `/settings`, and a `*` catch-all. `/products/new` correctly beats `/products/:id` because React Router ranks static segments above dynamic ones. `/products/:id` takes the product **UUID** — `public_id` is reserved for the future public verify route.

## Dates

Postgres `date` columns arrive as bare `YYYY-MM-DD` strings. **Never pass one to `new Date(string)`**: that is specified to parse as UTC midnight and renders as the previous day anywhere west of Greenwich, which expires warranties a day early across the Americas. Use `parseIsoDate` from `src/lib/warrantyDates.ts`, which builds a *local* midnight, and `formatIsoDate` for display.

Day counts round rather than floor, because local midnights are 23 or 25 hours apart across a daylight-saving boundary. `addMonths` clamps to the end of the target month, so a year from Feb 29 is Feb 28, not Mar 1.

Warranty status is **derived from `end_date`, never stored** — a status column is wrong by the next midnight. `active` is >30 days remaining, `expiring` is 0–30 inclusive, `expired` is past the end date.

## Receipts

A receipt is the most sensitive thing this app stores — a photo can carry a name, an address, an order number and the last four of a card. The rules below are not style preferences.

**The limits are stated in four places and must agree:** `RECEIPT_MAX_BYTES` in `src/types/receipt.ts`, the `receipts_size_bytes_max` / `receipts_mime_type_allowed` constraints, the bucket's `file_size_limit` and `allowed_mime_types`, and the Edge Function's own checks. Change one, change all four.

**10 MB of upload is not 10 MB of parseable image.** The Claude API caps an image at 10 MB *base64*, which is ~7.5 MB of actual file. Files between roughly 7.5 and 10 MB upload and store fine but fail to parse with `image_too_large`, and fall through to the manual path. Fixing that properly means downscaling a copy for parsing — never the stored original, whose bytes the hash describes.

**MIME type is checked from the bytes, not the name.** `File.type` comes from the OS extension mapping, so renaming `payload.exe` to `photo.jpg` reports `image/jpeg`. `sniffImageMimeType` reads the magic number, the row stores the sniffed type, and the Edge Function repeats the check on what it downloads — a browser check is not something the server may trust.

**There are two digests of the receipt, and they are not interchangeable.** Both describe *the same original raw file bytes* — never a resized preview, a re-encode, an OCR text, or a base64 string:

| Column | Algorithm | Format | Computed by |
|---|---|---|---|
| `receipt_hash` | SHA-256 | bare lowercase hex | the browser, at upload |
| `receipt_keccak256` | keccak256 | `0x` + lowercase hex | the server, from the stored object |

`receipt_hash` is phase 3's storage-integrity check. `receipt_keccak256` is the value anchored onchain, and keccak256 rather than SHA-256 because that is what maps to Solidity `bytes32` without a conversion step where a mistake would be invisible. Neither is derivable from the other, so "converting" means re-reading the object either way.

**Never overwrite either digest to resolve a disagreement.** If a recomputed hash differs from the stored one, that is an integrity problem to surface, not to silently repair — a hash that gets rewritten whenever it stops matching proves nothing. This matters most once a digest has been anchored onchain, where the old value is permanent and a quiet local rewrite would make the app claim a match that does not exist.

**Storage paths carry no identifying information** — `<uid>/<receipt id>/receipt.<ext>`, two UUIDs and a fixed name. Never the filename, email, serial number, retailer or wallet address. A check constraint ties the path to its owner, and the storage policies require the first folder to be `auth.uid()`.

**Extraction output is validated twice** — in the Edge Function before it is written, and in the browser on read, because `extraction_data` is unconstrained `jsonb`. Anything that fails validation is a failed parse, not a partial one. Partial credit would prefill a form with values nobody can account for.

**A receipt never supplies warranty terms.** Coverage dates, issuer and transferability are asked of the user in both flows, even when the document prints them. `ProductFormDefaults` is typed as a subset of the form's values that contains no warranty field, so this is structural rather than a convention.

**Parsing costs money.** It runs only from an explicit user action, never from a render or an effect. A completed receipt with valid data short-circuits in both `parseReceipt` and the Edge Function; a re-scan must pass `force`. The function also claims the row (`pending`/`failed` → `processing`) so two invocations cannot read the same image twice, with a two-minute staleness window so a crashed run does not wedge it forever.

## Onchain proof

**What a record proves, stated exactly:** *this app registered this receipt digest and these warranty dates at this time.* That is a claim about registration, by whoever paid for the transaction.

It does **not** mean Sony verified a warranty, Best Buy confirmed a receipt is genuine, the purchase happened, or that any warranty is legally enforceable. The registry never sees the receipt — only a hash — and cannot tell a real purchase from an invented one. Never write UI copy, a comment, or a commit message that implies otherwise.

Naming follows from that. Use **registrant**, **registeredBy**, **onchain proof**, **record integrity**. Never call the connected consumer wallet a *manufacturer*, *issuer*, or *verified retailer*.

**`registeredBy` is not an owner.** It is the wallet that paid gas, and the contract grants it no privilege whatsoever — `test_RegistrantHasNoPrivilegeOverTheRecord` asserts the registrant and a stranger receive byte-identical reverts. Phase 5 introduces ENSv2 as the ownership layer; adding an ownership field now would create a second, competing source of truth before that design exists.

**The contract stores no `issuer`, and must not.** A consumer typing "Sony" into a form must never produce a record that reads as Sony's attestation. The human-readable issuer stays in Supabase as what it actually is: user-entered text.

**Registration is write-once.** There is no update path and no overwrite path. A record that could be replaced proves nothing, because the digest read today might not be the one committed to. A second call for the same key reverts even from the address that made the first. Consequence worth knowing: whoever registers a key first holds it permanently — which is why `public_id` must stay random and opaque, so nobody can guess one to squat it.

**Expiry is derived, never stored** — the same rule as `warrantyStatus`, for the same reason. `WarrantyState` has no `Expired` member; storing it would need a transaction each time a warranty lapsed, and the contract would be confidently wrong until someone sent one. `WarrantyState.Voided` exists in the enum but is **unreachable**: voiding needs an answer to "who may void this?", and no one in this contract has standing.

**`warrantyEnd` is the midnight that *starts* the final covered day**, so coverage runs through the end of it and expiry is `warrantyEnd + 1 days`. Comparing against `warrantyEnd` directly expires every warranty a day early — the same off-by-one as the `Dates` section, now on a second runtime.

**Never put onchain:** serial numbers, retailer order IDs, customer names, emails, addresses, card details, storage paths, Supabase user IDs, filenames, or the receipt itself. Chain data is public and permanent. Every contract argument is an opaque digest or a date, and it stays that way.

**Supabase identity and wallet identity remain separate.** `auth.uid()` owns the private records; a wallet signs the proof. `blockchain_records.registered_wallet` is *data about an event* — it never appears in an RLS predicate and grants access to nothing.

**All hex is stored lowercase and `0x`-prefixed**, enforced by check constraints on `blockchain_records`. wagmi hands out EIP-55 checksummed (mixed-case) addresses, so normalising at the boundary is what lets the unique indexes hold and lets chain-vs-database comparison use a plain `=`.

**Duplicate protection is a partial unique index** on `(product_id, chain_id, contract_address) where registration_status in ('pending','confirmed')`. Including `pending` is what stops a second tab broadcasting a duplicate transaction; excluding `failed` preserves retry and keeps a failed transaction hash for troubleshooting. A `confirmed` row must additionally carry `block_number`, `registered_at` and `receipt_hash` — `blockchain_records_confirmed_is_complete` — so a bug cannot produce a row the UI renders as Verified with nothing behind it.

**The chain is authoritative about whether a key is registered.** Supabase can be stale (browser closed mid-transaction); the chain cannot. Reconcile from chain → database, never the reverse, and never mark a record confirmed on a transaction hash alone — wait for a successful receipt, then read the record back and compare it field by field. On mismatch, show an integrity warning; do not show Verified, and do not overwrite either side.

**`deriveProofState` is pure, and its precedence order is the safety property — not an implementation detail.** Two rules must survive any refactor:

1. **Chain truth is decided before any wallet check.** Disconnecting a wallet or switching networks must never turn a verified proof back into "create one", and must never hide a conflict. Rewriting this as separate booleans in the component would break it silently, which is why it is one function over all the inputs at once.
2. **Conflict outranks confirmed**, including over a database row that says `confirmed`.

A chain record that matches but has no local row is **Verified, not a conflict** — all compared fields passed against the product's own values, and the missing row is bookkeeping. A record that exists onchain but cannot be compared (no local hash or dates) *is* a conflict: it cannot be shown to describe this product.

Reconciliation requires a successful receipt **and** the key actually being present onchain. A successful receipt alone does not prove that this key was registered; if it succeeds and the key is absent, leave the row alone for a human.

## Version-specific gotchas

The toolchain is newer than most training data and most tutorials. These will bite:

**Foundry paths are redirected** — `foundry.toml` sets `src = "contracts/src"`, plus `test`, `script`, `out`, `libs` and `cache_path`. This is load-bearing: Foundry's default `src` is the repository root's `src/`, which here is the React application. Leaving the default would point the Solidity compiler at the frontend. `solc` is pinned to `0.8.24` so an immutable registry compiles to the same bytecode tomorrow as today.

**Tailwind v4** — configured entirely in CSS. There is **no `tailwind.config.js`**, no PostCSS setup, and no `content` array. Tokens live in the `@theme` block of `src/index.css` and are emitted as utilities automatically (`--color-ink-muted` → `text-ink-muted`). Add tokens there; never create a config file.

`src/index.css` contains `@source not '../docs'` **and** `@source not '../*.md'`. Both are load-bearing: Tailwind v4 auto-scans the whole project, so example class names in markdown get compiled into the production bundle — the second line is what keeps this file's own `bg-slate-50` example out of it. Removing either silently inflates the CSS. If you add docs elsewhere containing class names, exclude them too. Verify with `grep -o "bg-slate-50" dist/assets/*.css`, which should find nothing.

Tailwind v4 also tree-shakes unused theme tokens, so a defined-but-unused token legitimately will not appear in `dist/`. That is not a broken config.

**PL/pgSQL `returns table (...)`** — those column names become OUT parameters and are in scope as *variables* throughout the function body, shadowing any real column of the same name. `create_product_with_warranty` returns `(product_id, public_id)`, so a bare `product_id` in its receipt-attach `WHERE` was ambiguous (`42702`) and failed at runtime, in the one branch nothing had exercised yet. Alias the table and qualify every column reference — `update public.receipts as r … where r.product_id is null`. `SET` targets stay unqualified; they can only be columns.

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
- **The AI provider key is an Edge Function secret and nothing else.** `supabase secrets set ANTHROPIC_API_KEY=…`. Never a `VITE_` variable, never in `.env.example`, never in a file the browser can reach. React must never call an AI provider directly.
- **`parse-receipt` uses no service-role key, and does not need one.** It builds its Supabase client from the anon key plus the caller's `Authorization` header, so every statement it runs is checked by the same RLS as the browser. If you find yourself reaching for `SUPABASE_SERVICE_ROLE_KEY`, the design is wrong.
- **The function accepts a `receiptId` and nothing else.** Never a user id, never a storage path — a function that reads whatever path it is handed is a function that reads other people's receipts.
- **Receipt contents are untrusted input.** The image is a photograph of a document anyone can print. The system prompt says so explicitly and must keep saying so; text in the image is data to be read, never instructions to follow.
- **The `receipts` bucket is private and stays private**, with no `anon` policy and no blanket authenticated-read policy. Viewing goes through a short-lived signed URL minted on click, never persisted to the database or a query cache. Do not build a public URL for a receipt.
- Never log receipt bytes, base64, filenames, signed URLs, or extracted contents — not to the console, not to a provider error, not into `extraction_error`, which holds a short reason token only.
- The private receipt section must never appear on `/verify/:id`.
- **`DEPLOYER_PRIVATE_KEY` and `SEPOLIA_RPC_URL` are deployment-only.** Never `VITE_` prefixed, never in `.env.example` (which is client configuration), never read by anything under `src/`. A `VITE_DEPLOYER_PRIVATE_KEY` would compile a funded key into a public bundle.
- **A contract address is public and safe to expose**, so `VITE_WARRANTY_PASS_REGISTRY_ADDRESS` belongs in `.env.example`. Treat an unset address as "proof unavailable" — never fall back to a hardcoded or guessed address.
- **Never add an `anon` policy to `blockchain_records`.** A proof row names a public transaction, but it also names the private product it belongs to. Someone reading Etherscan learns a key and a digest; that must not become a read of this table.
- **Never derive a product key from anything but `public_id`.** Not a serial number, model, wallet, email, or receipt contents — `public_id` is opaque and random precisely so that what lands onchain, permanently and publicly, reveals nothing about the product.
- **No private keys in the app, no custom crypto.** Use viem's hashing helpers; do not hand-roll keccak256 or a digest encoding.

## Verification

A green build does not prove much on its own — it will not catch a route that never matches or a design token that never emits a utility. When changing routing or tokens, verify the actual behavior: render routes through a `MemoryRouter` harness, or grep `dist/assets/*.css` for the utilities you expect. Delete any temporary harness afterward.

Date logic is the other thing a build will not catch. Run it under several zones — `TZ=Pacific/Midway` (UTC-11) and `TZ=Pacific/Kiritimati` (UTC+14) are the useful extremes — not just your own.

**The migration cannot be verified without Docker or a linked project.** `supabase db reset` needs a local stack. If neither is available, say so rather than implying the SQL was executed.

With a linked project but no Docker, `supabase db push` works and `supabase migration list` confirms what actually applied. `supabase db dump` and `db diff` still need Docker, so a full schema diff is not available that way. A cheap independent check that a table exists *and* that `anon` is locked out, in one request:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "$VITE_SUPABASE_URL/rest/v1/blockchain_records?select=id&limit=1" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"
# 401 with code 42501 (permission denied) = table exists, anon correctly denied
# 404 with code 42P01 (undefined table)   = the migration did not apply
```

Note which error you get: `42501` and `42P01` look alike at a glance and mean opposite things.

**Contracts are verified with `forge test`, and date arithmetic on the Solidity side deserves the same suspicion as on the TypeScript side.** Timestamp fixtures should be checked against `Date.parse('YYYY-MM-DDT00:00:00Z')` rather than hand-computed, and expiry boundaries tested at the midnight before, the last second of the final day, and the midnight after — an off-by-one there silently expires every warranty a day early. `vm.warp` moves the clock; Foundry otherwise starts at timestamp 1, which makes most expiry assertions trivially true by accident.

**A deployed Edge Function can be smoke-tested for free.** Auth, the JWT gate and CORS are all reachable without spending a provider token — curl the function with no `Authorization` (expect 401 from the gateway), with the anon key alone (expect our own 401, since there is no user), with a malformed `receiptId` (expect 400), and with `OPTIONS` (expect 204 and the CORS headers). That covers everything except the provider call itself.

Deno is not installed locally, so `supabase/functions/**` is not type-checked by `pnpm build` — `tsconfig.app.json` only includes `src`. Check those files directly, and expect exactly two unresolvable names that the Deno runtime supplies:

```bash
pnpm exec tsc --ignoreConfig --noEmit --target es2022 --module esnext \
  --moduleResolution bundler --strict --allowImportingTsExtensions \
  --lib es2022,dom,dom.iterable supabase/functions/parse-receipt/*.ts
# expected: Cannot find name 'Deno'; Cannot find module 'npm:@supabase/supabase-js@2'
```

**Check that no secret reached the bundle** after touching anything provider-related: `grep -ric "anthropic\|x-api-key\|claude-" dist/assets/` should be zero, and `grep -rhoE "import\.meta\.env\.[A-Z_]+" src` should list only the expected `VITE_` names.

Deep links work in dev because Vite falls back to `index.html`. A static host needs an explicit rewrite rule (`/* → /index.html`) or `/products/abc123` will 404 on refresh.
