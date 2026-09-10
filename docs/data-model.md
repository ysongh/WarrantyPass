# WarrantyPass data model

How products, warranties and receipts are stored, who is allowed to read them,
and how to apply the schema. The migrations in
[`supabase/migrations/`](../supabase/migrations/) are the source of truth; this
document explains the reasoning behind them.

**Status:** Phase 3. Products, warranties, receipts, anonymous auth, row-level
security, and a private Storage bucket. No onchain data — `receipt_hash` is
computed and stored, but nothing anchors it yet.

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

### 4. Deploy the receipt parser

Receipt scanning needs an Edge Function and one secret. The secret is set from a
shell and lives only on Supabase:

```bash
supabase secrets set ANTHROPIC_API_KEY=...
supabase functions deploy parse-receipt
```

**The AI key is never a `VITE_` variable and never appears in `.env.example`.**
The browser must not call an AI provider directly; it calls this function, which
holds the key server-side. Deploying does not need Docker — the "Docker is not
running" warning during deploy is harmless.

### 5. Confirm the bucket is private

After `supabase db push`, check **Storage** in the dashboard: there should be a
`receipts` bucket marked **Private**. The migration creates it, but bucket and
`storage.objects` policy statements are the part most likely to be rejected on
permissions grounds, and a public receipts bucket would serve every stored
receipt to anyone holding a URL.

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

### `receipts`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` pk | Generated **in the browser** so the storage path can contain it. |
| `user_id` | `uuid` | → `auth.users(id)`, `on delete cascade`. The owner. |
| `product_id` | `uuid` null | → `products(id)`, `on delete cascade`. Null while it is a draft. |
| `storage_path` | `text` unique | `<uid>/<receipt id>/receipt.<ext>` in the private bucket. |
| `original_filename` | `text` | Display only. Never used to build the path. |
| `mime_type` | `text` | The **sniffed** type, not what the browser claimed. |
| `size_bytes` | `bigint` | `> 0` and `<= 10 MiB`. |
| `receipt_hash` | `text` null | SHA-256 of the original raw bytes, lowercase hex. |
| `extraction_status` | `text` | `pending` \| `processing` \| `completed` \| `failed`. |
| `extraction_data` | `jsonb` null | Structured extraction. Never a raw provider response. |
| `extraction_error` | `text` null | A short sanitized reason token, ≤ 500 chars. |
| `created_at` / `updated_at` | `timestamptz` | `updated_at` maintained by the shared trigger. |

`product_id` is **nullable**, which is the whole reason this table can exist: a
receipt is uploaded and parsed *before* the product does, so it spends the
entire scan flow unattached. A partial unique index —
`unique (product_id) where product_id is not null` — allows any number of
drafts while keeping at most one receipt per product.

Two constraints are worth knowing about because they encode rules rather than
types:

- `receipts_storage_path_owned` requires `storage_path` to start with
  `<user_id>/<id>/`. The storage policies independently require the first
  folder to be `auth.uid()`, so a row can neither *point* outside its owner's
  folder nor *read* outside it, and neither check is the only one holding.
- `receipts_completed_has_data` requires `extraction_data` to be non-null
  whenever the status is `completed`, so no consumer has to branch on a
  "successful" parse that produced nothing.

The cascade from `products` deletes the row but **cannot reach Storage** —
Postgres has no way to remove the object. Nothing triggers this yet (there is no
product deletion), and whichever phase adds it owns deleting the object first.

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

`receipts` — the same four operations on `user_id = (select auth.uid())`, like
`products`. The insert and update policies carry a second condition:

```sql
product_id is null
or exists (
  select 1 from public.products p
  where p.id = receipts.product_id
    and p.user_id = (select auth.uid())
)
```

Without it a user could file their own receipt row against **someone else's**
`product_id`, and hand themselves a foothold the moment any future feature reads
receipts through a product. The `EXISTS` is itself evaluated under the `products`
policies, so it can only ever see the caller's own products.

`auth.uid()` is wrapped in a scalar subquery in every policy so Postgres
evaluates it once per statement instead of once per row.

---

## Storage

The `receipts` bucket is created by the migration rather than through the
dashboard, so the configuration is reproducible: `public = false`, a 10 MiB
`file_size_limit`, and `allowed_mime_types` of JPEG, PNG and WebP. The insert is
wrapped in `on conflict (id) do update` so it converges rather than failing if
the bucket already exists — and re-asserts `public = false` if it was created
wrong.

**A public bucket would be the whole ballgame.** It serves every object to
anyone holding the URL, and a receipt path contains a uid and a receipt id, both
of which appear in application state. Reads go through short-lived signed URLs
instead.

### Object paths

```text
<auth.uid()>/<receipt id>/receipt.jpg
```

Two UUIDs and a fixed filename. **Never** the original filename, an email, a
serial number, a retailer, a wallet address or a name — a storage path is not a
private place to put things. The extension comes from the sniffed media type,
not from what the file was called.

### Object policies

Three policies on `storage.objects` — `select`, `insert`, `delete` — each
requiring both:

```sql
bucket_id = 'receipts'
and (storage.foldername(name))[1] = (select auth.uid())::text
and array_length(storage.foldername(name), 1) = 2
```

The first folder must be the caller's own uid, which is what confines each user
to their own receipts. The length check pins the layout to exactly one folder
per user and one per receipt, so there are no objects at the bucket root and no
deeper trees to reason about. There is deliberately **no blanket
authenticated-read policy** — that would let every signed-in user read every
other user's receipts.

There is also **no `UPDATE` policy**, because nothing overwrites a receipt
object. Every upload attempt mints a fresh receipt id and therefore a fresh
path, which is why uploads pass `upsert: false`; an upsert would be rejected
here rather than silently replacing a file a hash was taken of.

### Reading a receipt back

The owner views their receipt through a signed URL minted on click with a
60-second lifetime. It is never written to the database, never cached in a query
client, and never rendered into the page until the owner asks for it. Supabase
issues it only if the storage policies would have allowed that caller to read
the object, so authorization still happens at the boundary rather than in the
app.

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

Creating a WarrantyPass writes two rows, and for a scanned product it must also
claim a third. As separate REST calls, a failure part-way leaves a product with
no warranty, or a product whose receipt never got attached. This function does
all of it in one transaction — either everything lands or nothing does — and
returns `(product_id, public_id)` so the app can navigate straight to the new
product.

The optional `p_receipt_id` attaches a receipt with a guarded update:

```sql
update public.receipts set product_id = v_product_id
where id = p_receipt_id
  and user_id = v_user_id
  and product_id is null;

if not found then
  raise exception '...' using errcode = 'WP001';
end if;
```

Every condition is a rule. RLS already hides another user's row, so the
ownership test is belt and braces — but `product_id is null` is the only thing
stopping a receipt being moved off the product it already proves. Raising rolls
back the product and the warranty too: a product that silently lost its receipt
is worse than a submission the user can retry.

`WP001` is a project-specific SQLSTATE so the client can tell this apart from a
generic failure and say something useful. It deliberately does not reuse
`42501`, which the app already maps to "your session has expired".

Phase 3 changed this function's signature, so the migration **drops it before
recreating it**. Adding a parameter does not replace a function in Postgres, it
overloads it, and two overloads reachable by the same named-argument call is
exactly the ambiguity PostgREST refuses to resolve. Because the new parameter
has a default, an eleven-argument call still resolves — a frontend deployed
before the migration keeps working after it.

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
5. `/verify/:id` issues no query, and shows no receipt.
6. No service-role key appears anywhere in `src/`, in any `VITE_` variable, or
   in the Edge Function.
7. Connected wallet state does not appear in any query or policy.
8. A second browser profile (a different anonymous user) can read neither the
   receipt row, nor the storage object, nor a signed URL for another user's
   receipt.
9. The `receipts` bucket reports **Private** in the dashboard.
10. No AI provider string reaches the bundle:
    `grep -ric "anthropic\|x-api-key\|claude-" dist/assets/` is zero.
11. `parse-receipt` refuses a request with no `Authorization` header, and a
    request bearing only the anon key (no user session).

---

## The receipt parser

`supabase/functions/parse-receipt` reads one of the caller's own receipts and
stores a structured extraction against it. Two properties matter here.

**It uses no service-role key.** The function builds its Supabase client from
the anon key plus the caller's `Authorization` header, so the row read, the
storage download and the status writes are all checked by exactly the policies
above. There is no privileged path to re-implement or get wrong.

**It accepts a `receiptId` and nothing else** — never a user id, never a storage
path. A function that reads whatever path it is handed is a function that reads
other people's receipts.

The request body is untrusted, but so is the *image*: a receipt is a photograph
of a document anyone can print, and the system prompt states explicitly that
text in the image is data to be read and never instructions to follow.

Output is validated twice — in the function before it is written, and in the
browser on read, because `extraction_data` is unconstrained `jsonb`. Anything
that fails validation is a failed parse rather than a partial one. The two
validators are duplicated across the browser and Deno runtimes on purpose;
change both.

Parsing costs money, so it never runs from a render. A completed receipt with
valid data short-circuits, and the function claims the row before working
(`pending`/`failed` → `processing`, with a two-minute staleness window) so two
invocations cannot read the same image twice.
