-- Fix: "column reference product_id is ambiguous" (SQLSTATE 42702) when
-- creating a product with a receipt.
--
-- `returns table (product_id uuid, public_id text)` declares those names as
-- OUT parameters, and PL/pgSQL puts them in scope as *variables* for the whole
-- function body. So in the receipt attach step:
--
--   where ... and product_id is null
--
-- `product_id` could mean `receipts.product_id` or the output parameter, and
-- Postgres refuses to guess. The insert statements were unaffected — a column
-- list in INSERT and a target in SET can only be columns — so this only ever
-- broke the one branch that attaches a receipt, which is why it survived
-- until a scanned product was created for the first time.
--
-- The fix aliases the update target and qualifies every column reference in
-- the WHERE clause. `set product_id = ...` stays unqualified because SET
-- targets must be columns of the target table and take no alias.
--
-- The signature is unchanged, so this replaces the function in place; there is
-- no DROP and nothing for a deployed frontend to notice.
--
-- Worth remembering for any future RPC: a `returns table (...)` column name
-- that matches a real column of a table the body touches will shadow it.
-- Aliasing the table and qualifying references costs nothing and avoids it.

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
    -- Every condition is a rule being enforced, not a filter being optimised:
    -- the receipt must exist, must belong to the caller, and must not already
    -- be attached to an earlier product. RLS would already hide another user's
    -- row, so the ownership test is belt and braces — but `r.product_id is
    -- null` is the only thing preventing a receipt being moved off the product
    -- it already proves.
    update public.receipts as r
    set product_id = v_product_id
    where r.id = p_receipt_id
      and r.user_id = v_user_id
      and r.product_id is null;

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
