# WarrantyPass data model

How products and warranties are stored, who is allowed to read them, and how to
apply the schema. The migration in
[`supabase/migrations/`](../supabase/migrations/) is the source of truth; this
document explains the reasoning behind it.

**Status:** Phase 2. Products, warranties, anonymous auth, and row-level
security. No receipts, no storage buckets, no onchain data.

---

## Setup

### 1. Enable anonymous sign-ins

**Required.** The app cannot read or write anything without it.

In the Supabase dashboard: **Authentication → Sign In / Providers → Anonymous
sign-ins → enable**.

For a local stack, [`supabase/config.toml`](../supabase/config.toml) already
sets `enable_anonymous_sign_ins = true`. That setting applies only to
`supabase start`; **it does not configure a hosted project**, which must be
toggled in the dashboard.

If it is off, sign-in fails and every page shows "We couldn't start your
session" rather than pretending the account is empty.

### 2. Apply the migration

Against a linked hosted project:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Against a local stack (needs Docker):

```bash
supabase start
supabase db reset   # replays every migration from scratch
```

Or paste the migration into the dashboard SQL editor. Either way the schema
comes from the file — do not create these tables by hand in the table editor, or
the next `db reset` will not reproduce them.

### 3. Environment

```bash
cp .env.example .env
```

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` only. Both are public and
compiled into the bundle. **A service-role key must never appear in any `VITE_`
variable** — it bypasses every policy below.

---

## Authentication: anonymous, and temporary

On start-up the app checks for a Supabase session and calls
`signInAnonymously()` if there is none. That anonymous user's `auth.uid()` owns
their rows. Supabase persists and refreshes the session, so the same browser
keeps the same data across reloads.

```text
open WarrantyPass
      ↓
session in local storage?
      ├── yes → use it
      └── no  → signInAnonymously()
                      ↓
                  failed? → error state with retry, never a silent loop
```

Implemented in [`src/lib/authSession.ts`](../src/lib/authSession.ts) and
[`AuthProvider`](../src/components/auth/AuthProvider.tsx); pages read it through
[`useAuthSession`](../src/hooks/useAuthSession.ts) and gate on
[`SessionGate`](../src/components/auth/SessionGate.tsx).

### Two identities that must not be confused

| | Supabase `auth.uid()` | Connected wallet address |
| --- | --- | --- |
| Decides row access | **Yes** | No |
| Proven to the database | Yes, by JWT | No |
| Used in phase 2 | Everywhere | Display only |

A browser reporting an address proves nothing to Postgres — anyone can claim
any address. Wallet-based authorization needs a signed challenge exchanged for a
Supabase session, which is a later phase. **Never write a policy or a query
filter against a wallet address.**

### Limits of anonymous accounts

An anonymous user is only as durable as the browser's local storage. Clearing
site data, or opening the app on another device, means the products are
unreachable — there is no identifier to recover them by, and by design nobody
can look them up.

This is why **there is no sign-out button**. Signing out of an anonymous session
discards the only key to that data.

The upgrade path is to link an email or a wallet-authenticated identity to the
*existing* user record rather than creating a new one, so the rows keep their
owner and no migration of data is needed.

---

## Tables

### `products`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` pk | `gen_random_uuid()`. Used in `/products/:id`. |
| `user_id` | `uuid` | → `auth.users(id)`, `on delete cascade`. The owner. |
| `public_id` | `text` unique | Opaque, e.g. `wp_550e8400e29b41d4a716446655440000`. |
| `brand` | `text` | Required, non-blank, ≤ 120 chars. |
| `model` | `text` | Required, non-blank, ≤ 120 chars. |
| `serial_number` | `text` null | **Private.** Never on a public route. |
| `retailer` | `text` null | Private. |
| `purchase_date` | `date` | Required. |
| `purchase_price` | `numeric(12,2)` null | `>= 0`. Private. |
| `currency` | `text` | Defaults `USD`, constrained to `^[A-Z]{3}$`. |
| `created_at` / `updated_at` | `timestamptz` | `updated_at` maintained by trigger. |

`public_id` is generated randomly by the database and **never derived** from the
serial number, model, email, wallet address, or user name. Deriving it would
make it guessable from information a buyer or thief already has. A check
constraint (`^wp_[0-9a-f]{32}$`) keeps the format enforced rather than
conventional. It is unused in phase 2 and reserved for the future public
verification route, which is why it exists now: retrofitting an opaque id after
rows exist is harder.

### `warranties`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` pk | |
| `product_id` | `uuid` **unique** | → `products(id)`, `on delete cascade`. |
| `issuer` | `text` null | Who honours it — often the brand or retailer. |
| `start_date` | `date` | |
| `end_date` | `date` | `end_date >= start_date` enforced. |
| `transferability` | `text` | `transferable` \| `non_transferable` \| `unknown`. |
| `created_at` / `updated_at` | `timestamptz` | |

`product_id` is unique: one primary warranty per product in phase 2. Additional
protection plans would be a deliberate schema change, not an accident.

`transferability` is three-valued rather than boolean because the owner often
does not know the manufacturer's policy, and `unknown` is the honest answer.
Storing `false` for "not sure" would be a fabricated claim about the product.

### Status is derived, never stored

There is no `status` column. `active` / `expiring` / `expired` is computed from
`end_date` on read, in
[`src/lib/warrantyStatus.ts`](../src/lib/warrantyStatus.ts):

| Result | Condition |
| --- | --- |
| `expired` | past `end_date` |
| `expiring` | 0–30 days remaining (inclusive; `end_date` is the last covered day) |
| `active` | more than 30 days remaining |

A stored status would be wrong by the next midnight and would need a scheduled
job to stay honest.

`date` columns arrive as plain `YYYY-MM-DD` strings.
[`src/lib/warrantyDates.ts`](../src/lib/warrantyDates.ts) parses them at **local**
midnight, because `new Date('2026-09-08')` is specified to parse as *UTC*
midnight and renders as Sep 7 anywhere west of Greenwich — which would expire
warranties a day early for every user in the Americas. Day counts are rounded,
not floored, so daylight-saving shifts do not drop a day.

### Indexes

| Index | Why |
| --- | --- |
| `products (user_id, created_at desc)` | Serves the RLS predicate and the dashboard's ordering in one index. |
| `products (public_id)` | Created automatically by the `UNIQUE` constraint. |
| `warranties (product_id)` | Created automatically by the `UNIQUE` constraint. |

Only the first is declared. The other two would be duplicates.

---

## Row-level security

RLS is enabled on both tables, and `anon` is explicitly revoked from both.
**Neither table is publicly readable.**

`products` — four policies, all `to authenticated`, all on
`user_id = (select auth.uid())`:

| Operation | Clause |
| --- | --- |
| `select` | `USING` |
| `insert` | `WITH CHECK` — this is what rejects a client-supplied `user_id` for someone else |
| `update` | `USING` + `WITH CHECK` — the second stops a row being reassigned to another owner |
| `delete` | `USING` |

`warranties` — the same four operations, each gated on an `EXISTS` against the
parent product:

```sql
exists (
  select 1 from public.products p
  where p.id = warranties.product_id
    and p.user_id = (select auth.uid())
)
```

Access is derived from the product rather than duplicated onto a `user_id`
column, so a warranty can never disagree with its product about who owns it.

`auth.uid()` is wrapped in a scalar subquery in every policy so Postgres
evaluates it once per statement instead of once per row.

### Consequences worth knowing

- A product that does not exist and a product belonging to someone else both
  return **zero rows**. The app shows the same "WarrantyPass not found." for
  both, so the page never confirms that an id is real.
- The data layer in [`src/lib/products.ts`](../src/lib/products.ts) does **not**
  filter by `user_id`. That is intentional: the database is the boundary. A
  client-side filter would imply the app enforces it, and would quietly become
  the only check if a policy were ever dropped.
- `/verify/:id` is still a placeholder and reads nothing. Making it work by
  adding an `anon` read policy would expose serial numbers, prices and
  retailers to anyone who could guess a URL. Public verification needs its own
  explicit projection of safe fields. **Do not weaken these policies to build
  it.**

---

## Functions

### `set_updated_at()`

Trigger function on both tables, stamping `updated_at` on every `UPDATE`.
Trigger functions cannot be called over PostgREST, so living in `public` does
not expose it.

### `create_product_with_warranty(...)`

Creating a WarrantyPass writes two rows. As two REST calls, a failure on the
second leaves a product with no warranty. This function does both inserts in one
transaction — either both land or neither does — and returns
`(product_id, public_id)` so the app can navigate straight to the new product.

It is **`SECURITY INVOKER`** (the default, stated explicitly). It runs as the
calling user, so both inserts are still checked by the policies above. Making it
`SECURITY DEFINER` would bypass RLS and force the ownership checks to be
re-implemented by hand inside the function — more code, and a much worse failure
mode if it were ever wrong.

`user_id` and `public_id` are **not parameters**. The owner comes from
`auth.uid()` and the public id is generated in the function, so neither can be
influenced from the browser.

`EXECUTE` is revoked from `PUBLIC` and `anon`, and granted to `authenticated`.

---

## Verifying the security boundary

Worth re-checking after any change to the schema:

1. An insert naming another user's `user_id` is rejected by
   `products_insert_own`'s `WITH CHECK`.
2. `select` on either table returns only the caller's rows.
3. A warranty insert targeting another user's product fails the `EXISTS` check.
4. Serial numbers do not appear on dashboard cards — only on the detail page,
   masked, behind an explicit Show control.
5. `/verify/:id` issues no query.
6. No service-role key appears anywhere in `src/` or in any `VITE_` variable.
7. Connected wallet state does not appear in any query or policy.
