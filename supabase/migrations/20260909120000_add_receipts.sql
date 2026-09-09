-- WarrantyPass phase 3: private receipts.
--
-- Ownership model
-- ---------------
-- Unchanged from phase 2: `auth.uid()` owns rows, and a connected wallet is
-- still not an authorization identity. A receipt is owned directly by a user
-- rather than through its product, because a receipt exists *before* the
-- product does — it is uploaded and parsed first, and the product is created
-- from what the user confirms afterwards.
--
-- Privacy
-- -------
-- Receipts are the most sensitive thing this app stores. A single photo can
-- carry a name, a store location, an order number, loyalty identifiers and the
-- last four digits of a card. Nothing here is readable by `anon`, the storage
-- bucket is private, and there is no public projection of any of it. Do not add
-- an `anon` policy to this table, and do not make the bucket public.

-- ---------------------------------------------------------------------------
-- receipts
-- ---------------------------------------------------------------------------

create table public.receipts (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users (id) on delete cascade,

  -- Nullable on purpose. A receipt is uploaded and parsed before the product
  -- exists, so it spends the whole scan flow unattached. It becomes attached in
  -- the same transaction that creates the product — see
  -- create_product_with_warranty() below.
  --
  -- The cascade removes the row when its product is deleted, but Postgres
  -- cannot reach into Storage: the object itself is left behind. Phase 3 has no
  -- product deletion, so nothing triggers this yet. Whichever phase adds it
  -- owns deleting the object first, then the product.
  product_id uuid references public.products (id) on delete cascade,

  -- Path inside the private `receipts` bucket. UNIQUE so two rows can never
  -- claim the same object, which would make deletion ambiguous.
  storage_path text not null unique,

  -- Kept for display only ("bestbuy-receipt.jpg"). Never used to build the
  -- storage path: a filename is user-supplied text and can carry anything from
  -- a real name to a traversal sequence.
  original_filename text not null,

  mime_type text not null,
  size_bytes bigint not null,

  -- SHA-256 of the *original raw file bytes*, lowercase hex, computed in the
  -- browser before upload. It hashes exactly what was uploaded — not a resized
  -- preview, not a re-encoded copy — so phase 4 can anchor it onchain and the
  -- claim will still be true. Nullable: nothing depends on it yet, and rows
  -- written before this column mattered stay valid.
  receipt_hash text,

  extraction_status text not null default 'pending',

  -- Structured output from the parser, shaped by src/types/receipt.ts. Raw
  -- provider responses are deliberately not stored: they carry usage metadata
  -- and echoed content we have no reason to keep.
  extraction_data jsonb,

  -- A short, sanitized reason the parse failed. Never a raw provider error.
  extraction_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint receipts_extraction_status_allowed check (
    extraction_status in ('pending', 'processing', 'completed', 'failed')
  ),

  -- A completed extraction with no data would make every consumer branch on a
  -- state that should not exist.
  constraint receipts_completed_has_data check (
    extraction_status <> 'completed' or extraction_data is not null
  ),

  constraint receipts_extraction_data_is_object check (
    extraction_data is null or jsonb_typeof(extraction_data) = 'object'
  ),

  constraint receipts_extraction_error_length check (
    extraction_error is null or length(extraction_error) <= 500
  ),

  -- Phase 3 is images only. PDF receipts are real and common, but supporting
  -- them means a second preview path and a different provider payload, so they
  -- are deliberately out of scope rather than half-supported. This list must
  -- stay in step with the bucket's allowed_mime_types below, the client-side
  -- check in src/lib/receipts.ts, and the Edge Function's own validation.
  constraint receipts_mime_type_allowed check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),

  constraint receipts_size_bytes_positive check (size_bytes > 0),

  -- 10 MiB, matching the bucket limit and the client. An empty or absurd file
  -- is rejected before it ever reaches the AI provider.
  constraint receipts_size_bytes_max check (size_bytes <= 10485760),

  constraint receipts_original_filename_not_blank check (
    length(btrim(original_filename)) > 0
  ),
  constraint receipts_original_filename_length check (
    length(original_filename) <= 255
  ),

  constraint receipts_receipt_hash_format check (
    receipt_hash is null or receipt_hash ~ '^[0-9a-f]{64}$'
  ),

  -- The row and the object cannot disagree about who owns the file. The
  -- storage policies below independently require the first folder to be the
  -- caller's uid; this constraint means a row can never *point* anywhere else
  -- either, so neither check can be the only one holding. UUIDs contain no
  -- LIKE metacharacters, so the pattern needs no escaping.
  constraint receipts_storage_path_owned check (
    storage_path like user_id::text || '/' || id::text || '/%'
  )
);

comment on table public.receipts is
  'A privately stored receipt image. Owned by auth.uid(); attached to a product '
  'only when that product is created. Never exposed publicly.';
comment on column public.receipts.product_id is
  'Null while the receipt is a draft. Set atomically by create_product_with_warranty().';
comment on column public.receipts.storage_path is
  'Path in the private `receipts` bucket: <uid>/<receipt id>/<filename>.';
comment on column public.receipts.receipt_hash is
  'SHA-256 of the original raw file bytes, lowercase hex. Phase 4 anchors this.';
comment on column public.receipts.extraction_data is
  'Structured extraction only. Never a raw AI provider response.';

-- At most one receipt per product for the MVP, while any number of unattached
-- drafts may exist. The WHERE clause states that intent explicitly: a plain
-- UNIQUE would behave identically, since Postgres treats NULLs as distinct, but
-- it would read as though drafts were meant to be unique too and had simply
-- been allowed through on a technicality.
create unique index receipts_product_id_key
  on public.receipts (product_id)
  where product_id is not null;

-- Serves the RLS predicate, the "my drafts" lookup, and the cascade from
-- auth.users. (The product cascade uses the partial index above: `product_id =
-- $1` implies the column is not null, which Postgres can prove.)
create index receipts_user_id_created_at_idx
  on public.receipts (user_id, created_at desc);

create trigger receipts_set_updated_at
  before update on public.receipts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.receipts enable row level security;

revoke all on table public.receipts from anon;
grant select, insert, update, delete on table public.receipts to authenticated;

create policy receipts_select_own on public.receipts
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Two conditions, and both are load-bearing. The first stops a receipt being
-- created for another user. The second stops a receipt being *pointed* at
-- another user's product: without it, a user could file their own row against
-- someone else's product_id and — once a future feature reads receipts through
-- a product — hand themselves a foothold. The EXISTS is additionally evaluated
-- under the products policies, so it can only ever see the caller's products.
create policy receipts_insert_own on public.receipts
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      product_id is null
      or exists (
        select 1
        from public.products p
        where p.id = receipts.product_id
          and p.user_id = (select auth.uid())
      )
    )
  );

create policy receipts_update_own on public.receipts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      product_id is null
      or exists (
        select 1
        from public.products p
        where p.id = receipts.product_id
          and p.user_id = (select auth.uid())
      )
    )
  );

create policy receipts_delete_own on public.receipts
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage bucket
-- ---------------------------------------------------------------------------

-- Declared here rather than clicked into the dashboard, for the same reason the
-- tables are: the configuration has to be reproducible from this file.
--
-- `public = false` is the entire point. A public bucket serves every object to
-- anyone holding the URL, and receipt URLs are guessable-adjacent — the path
-- contains a uid and a receipt id, both of which appear in application state.
-- Reads go through short-lived signed URLs instead.
--
-- ON CONFLICT makes this converge rather than fail if the bucket was created by
-- hand first, and re-asserts the settings that matter if it was created wrong.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Storage policies
-- ---------------------------------------------------------------------------

-- Objects live at `<uid>/<receipt id>/<filename>`, and every policy below
-- requires the first folder to be the caller's uid. That is what makes the
-- bucket safe: there is no blanket "authenticated users may read receipts"
-- policy, because every authenticated user would then be able to read every
-- other user's receipts.
--
-- `storage.foldername('a/b/c.jpg')` returns `{a,b}`, so requiring length 2
-- pins the layout to exactly one folder per user and one per receipt — no
-- objects dropped at the bucket root, no deeper trees to reason about.
--
-- RLS is already enabled on storage.objects by Supabase; this migration does
-- not touch that, only the policies.

create policy receipts_objects_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 2
  );

create policy receipts_objects_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 2
  );

create policy receipts_objects_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 2
  );

-- There is deliberately no UPDATE policy: nothing in the app overwrites a
-- receipt object. Every upload attempt mints a fresh receipt id and so a fresh
-- path, which means uploads must use `upsert: false` — an upsert would be
-- rejected here rather than silently replacing a file a hash was taken of.

-- ---------------------------------------------------------------------------
-- Atomic creation, now with the receipt
-- ---------------------------------------------------------------------------

-- The phase 2 function is DROPped rather than replaced. Adding a parameter does
-- not replace a function in Postgres, it overloads it — and two overloads
-- reachable by the same named-argument call is exactly the ambiguity PostgREST
-- refuses to resolve. Dropping first keeps one callable signature.
drop function public.create_product_with_warranty(
  text, text, date, date, date, text, text, text, numeric, text, text
);

-- Creating a WarrantyPass writes two rows, and for a scanned product it also
-- has to claim a third. Doing that as separate REST calls can leave a product
-- with no warranty, or a product whose receipt never got attached. All of it
-- runs in one transaction here: either every row lands or none does.
--
-- SECURITY INVOKER (the default, stated explicitly): the function runs as the
-- calling user, so every statement is still checked by the RLS policies above.
-- SECURITY DEFINER would bypass them and force the ownership checks to be
-- re-implemented by hand — more code, and a far worse failure mode if wrong.
--
-- The owner is taken from auth.uid() and never from an argument, so a client
-- has no way to create a product for another user or to attach a receipt it
-- does not own.
create or replace function public.create_product_with_warranty(
  p_brand text,
  p_model text,
  p_purchase_date date,
  p_warranty_start_date date,
  p_warranty_end_date date,
  p_transferability text,
  p_serial_number text default null,
  p_retailer text default null,
  p_purchase_price numeric default null,
  p_currency text default 'USD',
  p_warranty_issuer text default null,
  -- Null for a manually entered product. The manual flow is unchanged and must
  -- stay that way: receipts are optional, and always will be.
  p_receipt_id uuid default null
)
returns table (product_id uuid, public_id text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_public_id text := 'wp_' || replace(gen_random_uuid()::text, '-', '');
  v_product_id uuid;
begin
  if v_user_id is null then
    raise exception 'An authenticated session is required to create a product'
      using errcode = '42501';
  end if;

  insert into public.products (
    user_id, public_id, brand, model, serial_number, retailer,
    purchase_date, purchase_price, currency
  )
  values (
    v_user_id,
    v_public_id,
    btrim(p_brand),
    btrim(p_model),
    nullif(btrim(coalesce(p_serial_number, '')), ''),
    nullif(btrim(coalesce(p_retailer, '')), ''),
    p_purchase_date,
    p_purchase_price,
    upper(btrim(coalesce(nullif(btrim(p_currency), ''), 'USD')))
  )
  returning id into v_product_id;

  insert into public.warranties (
    product_id, issuer, start_date, end_date, transferability
  )
  values (
    v_product_id,
    nullif(btrim(coalesce(p_warranty_issuer, '')), ''),
    p_warranty_start_date,
    p_warranty_end_date,
    p_transferability
  );

  if p_receipt_id is not null then
    -- Every condition here is a rule being enforced, not a filter being
    -- optimised: the receipt must exist, must belong to the caller, and must
    -- not already be attached to an earlier product. RLS would already hide
    -- another user's row, so this is belt and braces on ownership — but the
    -- `product_id is null` test is the only thing preventing a receipt being
    -- moved off the product it already proves.
    update public.receipts
    set product_id = v_product_id
    where id = p_receipt_id
      and user_id = v_user_id
      and product_id is null;

    if not found then
      -- Raising here rolls back the product and the warranty too. A product
      -- that silently lost its receipt is worse than a failed submission the
      -- user can retry.
      --
      -- WP001 is a project-specific SQLSTATE so the client can tell this apart
      -- from a generic failure and say something useful. It deliberately does
      -- not reuse 42501, which the app already maps to "your session expired".
      raise exception 'That receipt is not available to attach to this product'
        using errcode = 'WP001';
    end if;
  end if;

  return query select v_product_id, v_public_id;
end;
$$;

comment on function public.create_product_with_warranty is
  'Creates a product, its warranty, and optionally attaches an owned receipt, '
  'in one transaction. Owner comes from auth.uid(); runs SECURITY INVOKER so '
  'RLS still applies to every statement.';

revoke execute on function public.create_product_with_warranty(
  text, text, date, date, date, text, text, text, numeric, text, text, uuid
) from public, anon;

grant execute on function public.create_product_with_warranty(
  text, text, date, date, date, text, text, text, numeric, text, text, uuid
) to authenticated;
