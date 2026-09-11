-- WarrantyPass phase 4: onchain proof records.
--
-- What the chain is for
-- --------------------
-- A blockchain record asserts exactly one thing: *this WarrantyPass registered
-- this receipt digest and these warranty dates at this time*. It is not an
-- attestation by Sony, Best Buy, or any other retailer or manufacturer, and
-- nothing in this schema should be read as one. The wallet that signed is
-- recorded as `registered_wallet` — a registrant, never an issuer.
--
-- Identity, again
-- ---------------
-- Unchanged from phases 2 and 3, and worth restating because this is the first
-- migration where a wallet address appears at all: `auth.uid()` is the only
-- authorization identity. `registered_wallet` is *data* — a string the browser
-- reported about which account signed a transaction. It is never a subject, it
-- never appears in a policy predicate, and it must never be used to decide who
-- may read a row. A browser claiming an address proves nothing to Postgres.
--
-- Address and digest casing
-- -------------------------
-- Everything hex in this file is stored lowercase and `0x`-prefixed, and check
-- constraints enforce it. wagmi hands out EIP-55 checksummed (mixed-case)
-- addresses, so a stored value and a live one will not compare equal unless
-- both sides are normalised. Normalising once, here at the boundary, means the
-- unique indexes below actually hold and no caller has to remember to fold
-- case before a `=`.

-- ---------------------------------------------------------------------------
-- receipts.receipt_keccak256
-- ---------------------------------------------------------------------------

-- Phase 3 already stores `receipt_hash`: a SHA-256 of the original uploaded
-- bytes, bare lowercase hex, computed in the browser. That column is not
-- touched here, and nothing in phase 4 rewrites it.
--
-- This is a second digest of *the exact same bytes*, for a different job:
--
--   receipt_hash        SHA-256, bare hex     storage integrity (phase 3)
--   receipt_keccak256   keccak256, 0x-prefix  the onchain anchor (phase 4)
--
-- Two columns rather than one conversion, for three reasons. They are different
-- algorithms, so one cannot be derived from the other — recomputing means
-- re-reading the object either way. Overwriting `receipt_hash` would silently
-- destroy a value phase 3 rows already carry, which is precisely the "do not
-- recompute and overwrite a hash" rule this phase is built around. And
-- keccak256 is what maps to Solidity `bytes32` without a conversion step at the
-- call site, where a mistake would be invisible.
--
-- Nullable, and deliberately so: every receipt uploaded before this migration
-- has no keccak digest yet. They are backfilled lazily by the `hash-receipt`
-- Edge Function when a proof is first requested, from the stored object — no
-- re-upload, and no client-supplied value.
alter table public.receipts
  add column receipt_keccak256 text;

-- 0x + 64 lowercase hex = exactly 32 bytes, which is what Solidity `bytes32`
-- holds. Rejecting uppercase here is what lets the application compare a stored
-- digest to one read back from the chain with a plain `=`.
alter table public.receipts
  add constraint receipts_receipt_keccak256_format check (
    receipt_keccak256 is null or receipt_keccak256 ~ '^0x[0-9a-f]{64}$'
  );

comment on column public.receipts.receipt_keccak256 is
  'keccak256 of the original raw file bytes, 0x-prefixed lowercase hex. '
  'Computed server-side from the stored object by the hash-receipt Edge '
  'Function, never supplied by the client. Anchored onchain as bytes32. '
  'Describes the same bytes as receipt_hash, under a different algorithm.';

-- ---------------------------------------------------------------------------
-- blockchain_records
-- ---------------------------------------------------------------------------

-- A separate table rather than a dozen chain columns on `products`. A product
-- is a real thing someone owns; a registration is an event on one specific
-- chain against one specific contract, and there will eventually be more than
-- one of them per product (a redeploy, a second network). Folding those into
-- `products` would mean a wide row that is null for every user who never
-- connects a wallet — which, by design, is most of them.
create table public.blockchain_records (
  id uuid primary key default gen_random_uuid(),

  -- The owning Supabase user. Denormalised from `products.user_id` so the RLS
  -- predicate does not need a join on every row read. The insert policy below
  -- checks both this *and* product ownership, so the two cannot drift.
  user_id uuid not null references auth.users (id) on delete cascade,

  product_id uuid not null references public.products (id) on delete cascade,

  -- 11155111 for Sepolia. bigint because chain IDs are not bounded by int4 —
  -- some are well past 2^31.
  chain_id bigint not null,

  -- The registry the transaction was sent to. Part of the record's identity:
  -- the same product registered against a redeployed contract is a different
  -- proof, not an update of the old one.
  contract_address text not null,

  -- keccak256(utf8 public_id), the bytes32 key the record lives under onchain.
  -- Stored rather than derived so that a row remains interpretable even if the
  -- derivation ever changes, and so reconciliation can look up the chain
  -- without first re-reading the product.
  --
  -- Derived from `public_id` and nothing else. Never from a serial number, a
  -- model, a wallet, an email, or receipt contents — `public_id` is opaque and
  -- random precisely so that what goes onchain reveals nothing.
  product_key text not null,

  -- The keccak digest that was actually sent in the transaction. A snapshot,
  -- not a foreign key: it is what the chain says, frozen at submission. If this
  -- ever disagrees with `receipts.receipt_keccak256` for the attached receipt,
  -- that is an integrity problem for a human to look at — not something to
  -- quietly re-sync. Nullable only because a pending row is written the instant
  -- a transaction is broadcast.
  receipt_hash text,

  transaction_hash text not null,

  -- Both null until the transaction is mined. The constraint further down
  -- requires them once the row is confirmed.
  block_number bigint,

  registration_status text not null default 'pending',

  -- The wallet that signed. Data about an event, not an identity: it grants no
  -- access to anything, here or anywhere else in the schema. A different wallet
  -- signing does not make a different person the owner of the product — phase 5
  -- introduces an ownership layer, and this is deliberately not it.
  registered_wallet text not null,

  registered_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint blockchain_records_status_allowed check (
    registration_status in ('pending', 'confirmed', 'failed')
  ),

  constraint blockchain_records_chain_id_positive check (chain_id > 0),

  -- 20-byte address, lowercase. See the casing note at the top of the file.
  constraint blockchain_records_contract_address_format check (
    contract_address ~ '^0x[0-9a-f]{40}$'
  ),
  constraint blockchain_records_registered_wallet_format check (
    registered_wallet ~ '^0x[0-9a-f]{40}$'
  ),

  constraint blockchain_records_product_key_format check (
    product_key ~ '^0x[0-9a-f]{64}$'
  ),
  constraint blockchain_records_receipt_hash_format check (
    receipt_hash is null or receipt_hash ~ '^0x[0-9a-f]{64}$'
  ),
  constraint blockchain_records_transaction_hash_format check (
    transaction_hash ~ '^0x[0-9a-f]{64}$'
  ),

  constraint blockchain_records_block_number_non_negative check (
    block_number is null or block_number >= 0
  ),

  -- "Confirmed" is a claim about the chain, so a confirmed row has to carry the
  -- evidence: which block, when, and against which digest. Without this a bug
  -- that flipped the status early would produce a row the UI renders as
  -- Verified with nothing behind it.
  constraint blockchain_records_confirmed_is_complete check (
    registration_status <> 'confirmed'
    or (
      block_number is not null
      and registered_at is not null
      and receipt_hash is not null
    )
  )
);

comment on table public.blockchain_records is
  'A registration of a product proof on a chain. Asserts that this app '
  'registered a receipt digest and warranty dates at a time — not that any '
  'retailer or manufacturer attested to anything.';
comment on column public.blockchain_records.product_key is
  'keccak256(utf8 public_id), 0x-prefixed lowercase hex. The bytes32 key '
  'onchain. Derived only from the opaque public_id.';
comment on column public.blockchain_records.receipt_hash is
  'The keccak256 digest sent in this transaction, snapshotted. Compared '
  'against the chain and against receipts.receipt_keccak256; never silently '
  'rewritten to resolve a mismatch.';
comment on column public.blockchain_records.registered_wallet is
  'Lowercase address that signed. Data, not an authorization identity, and '
  'not a claim of product ownership.';
comment on column public.blockchain_records.registration_status is
  'pending until mined, confirmed only after a successful receipt has been '
  'read back, failed if the transaction reverted.';

-- One live registration per product per registry per chain. `failed` rows are
-- excluded so a reverted attempt can be retried, and so the transaction hash of
-- a failure stays on the record for troubleshooting instead of being deleted to
-- make room. Including `pending` in the same index is what stops a double-click
-- or a second tab from broadcasting two transactions for one product.
create unique index blockchain_records_one_live_per_registry_idx
  on public.blockchain_records (product_id, chain_id, contract_address)
  where registration_status in ('pending', 'confirmed');

-- A transaction hash identifies one broadcast; two rows claiming the same one
-- would make reconciliation ambiguous.
create unique index blockchain_records_transaction_hash_idx
  on public.blockchain_records (transaction_hash);

-- Serves the RLS predicate and the product-details lookup in one index.
create index blockchain_records_user_id_created_at_idx
  on public.blockchain_records (user_id, created_at desc);

create index blockchain_records_product_id_idx
  on public.blockchain_records (product_id);

create trigger blockchain_records_set_updated_at
  before update on public.blockchain_records
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

-- Same shape as `receipts`, and for the same reasons. Note what is *not* here:
-- no `anon` policy, and no policy that mentions a wallet address. A proof row
-- names a public address, but the row also names the product it belongs to, and
-- that product is private. Someone seeing a transaction on Etherscan learns a
-- key and a digest; they must not be able to turn that into a read of this
-- table.
alter table public.blockchain_records enable row level security;

revoke all on table public.blockchain_records from anon;
grant select, insert, update, delete on table public.blockchain_records to authenticated;

create policy blockchain_records_select_own on public.blockchain_records
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Both conditions are load-bearing, exactly as on `receipts`. The first stops a
-- row being filed under another user. The second stops a row being *pointed* at
-- another user's product — without it a user could attach a proof, and later a
-- conflicting proof, to a product they cannot otherwise see. The EXISTS runs
-- under the products policies, so it can only ever match the caller's own
-- products.
--
-- `user_id` is therefore never trusted from the client: a mismatched value
-- fails the first condition outright.
create policy blockchain_records_insert_own on public.blockchain_records
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.products p
      where p.id = blockchain_records.product_id
        and p.user_id = (select auth.uid())
    )
  );

create policy blockchain_records_update_own on public.blockchain_records
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.products p
      where p.id = blockchain_records.product_id
        and p.user_id = (select auth.uid())
    )
  );

create policy blockchain_records_delete_own on public.blockchain_records
  for delete to authenticated
  using (user_id = (select auth.uid()));
