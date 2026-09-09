import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import type {
  CreatedProduct,
  CreateProductInput,
  ProductWithWarranty,
  Warranty,
  WarrantyTransferability,
} from '../types/product'
import { supabase } from './supabase'
import { toUserFacingError, type UserFacingMessages } from './supabaseErrors'

/*
 * Every Supabase read and write for products lives here, so pages never build
 * queries themselves and the column list has exactly one definition.
 *
 * Security note: none of these functions filter by user. They do not need to —
 * RLS restricts every statement to `auth.uid()`'s own rows at the database.
 * Adding a client-side `user_id` filter would imply the app is what enforces
 * the boundary, and would quietly become the only check if a policy were ever
 * dropped.
 */

/** Columns are listed explicitly so a new column is never shipped by accident. */
const PRODUCT_COLUMNS = `
  id,
  public_id,
  brand,
  model,
  serial_number,
  retailer,
  purchase_date,
  purchase_price,
  currency,
  created_at,
  updated_at,
  warranty:warranties (
    id,
    product_id,
    issuer,
    start_date,
    end_date,
    transferability,
    created_at,
    updated_at
  )
`

type WarrantyRow = {
  id: string
  product_id: string
  issuer: string | null
  start_date: string
  end_date: string
  transferability: string
  created_at: string
  updated_at: string
}

type ProductRow = {
  id: string
  public_id: string
  brand: string
  model: string
  serial_number: string | null
  retailer: string | null
  purchase_date: string
  purchase_price: number | string | null
  currency: string
  created_at: string
  updated_at: string
  // PostgREST returns an object for a to-one embed, but only when it can prove
  // the relationship is to-one from the unique constraint on
  // `warranties.product_id`. Older versions return a single-element array.
  // Accept both rather than depending on which one answers.
  warranty: WarrantyRow | WarrantyRow[] | null
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const TRANSFERABILITY_VALUES: readonly WarrantyTransferability[] = [
  'transferable',
  'non_transferable',
  'unknown',
]

function toTransferability(value: string): WarrantyTransferability {
  return (TRANSFERABILITY_VALUES as readonly string[]).includes(value)
    ? (value as WarrantyTransferability)
    : 'unknown'
}

/** `numeric` crosses the wire as a JSON number, but tolerate a string too. */
function toNumber(value: number | string | null): number | null {
  if (value === null) return null

  const parsed = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(parsed) ? parsed : null
}

function mapWarranty(row: WarrantyRow): Warranty {
  return {
    id: row.id,
    productId: row.product_id,
    issuer: row.issuer,
    startDate: row.start_date,
    endDate: row.end_date,
    transferability: toTransferability(row.transferability),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapProduct(row: ProductRow): ProductWithWarranty {
  const embedded = Array.isArray(row.warranty) ? (row.warranty[0] ?? null) : row.warranty

  return {
    id: row.id,
    publicId: row.public_id,
    brand: row.brand,
    model: row.model,
    serialNumber: row.serial_number,
    retailer: row.retailer,
    purchaseDate: row.purchase_date,
    purchasePrice: toNumber(row.purchase_price),
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    warranty: embedded ? mapWarranty(embedded) : null,
  }
}

/**
 * Copy shared by every failure in this module. The raw error is logged and
 * replaced with something safe to render — see `supabaseErrors.ts`.
 */
const PRODUCT_MESSAGES: UserFacingMessages = {
  invalidInput: "Those details weren't accepted. Check the dates and try again.",
  byCode: {
    // Raised by create_product_with_warranty() when the receipt it was asked to
    // attach is gone, is not the caller's, or already belongs to another
    // product. The whole transaction rolled back, so nothing was created.
    WP001:
      'That receipt is no longer available. Upload it again, or continue without it.',
  },
}

function toProductError(context: string, error: PostgrestError | null): Error {
  return toUserFacingError(`products: ${context}`, error, PRODUCT_MESSAGES)
}

function requireClient(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'WarrantyPass is not connected to a database. Add Supabase credentials to your environment.',
    )
  }

  return supabase
}

/** The signed-in user's products, newest first, each with its warranty. */
export async function getProducts(): Promise<ProductWithWarranty[]> {
  const client = requireClient()

  const { data, error } = await client
    .from('products')
    .select(PRODUCT_COLUMNS)
    .order('created_at', { ascending: false })

  if (error) throw toProductError('Loading products', error)

  return ((data ?? []) as unknown as ProductRow[]).map(mapProduct)
}

/**
 * One product by its UUID, or `null` if it does not exist *or* belongs to
 * someone else. Those two cases are deliberately indistinguishable: RLS returns
 * no row either way, and the caller shows the same "not found" page, so the
 * page never confirms that an id is real.
 */
export async function getProductById(
  id: string,
): Promise<ProductWithWarranty | null> {
  const client = requireClient()

  // A malformed id would make Postgres raise a cast error, which reads as a
  // failure rather than a miss. Treat it as not found, which is what it is.
  if (!UUID_PATTERN.test(id)) return null

  const { data, error } = await client
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw toProductError('Loading product', error)
  if (!data) return null

  return mapProduct(data as unknown as ProductRow)
}

/**
 * Creates a product and its warranty in a single transaction via the
 * `create_product_with_warranty` RPC.
 *
 * `user_id` and `public_id` are absent from the arguments on purpose: the
 * database derives the owner from `auth.uid()` and generates the public
 * identifier itself, so neither can be influenced from the browser.
 *
 * `receiptId` is optional and null for a manually entered product. When it is
 * present the function also attaches that receipt, inside the same transaction:
 * a product that was created but lost its receipt is not a state this app can
 * produce. The database re-checks that the receipt is the caller's and is not
 * already attached, so passing someone else's id fails rather than succeeding
 * quietly.
 */
export async function createProductWithWarranty(
  input: CreateProductInput,
): Promise<CreatedProduct> {
  const client = requireClient()

  const { data, error } = await client
    .rpc('create_product_with_warranty', {
      p_brand: input.brand,
      p_model: input.model,
      p_purchase_date: input.purchaseDate,
      p_warranty_start_date: input.warrantyStartDate,
      p_warranty_end_date: input.warrantyEndDate,
      p_transferability: input.transferability,
      p_serial_number: input.serialNumber ?? null,
      p_retailer: input.retailer ?? null,
      p_purchase_price: input.purchasePrice ?? null,
      p_currency: input.currency ?? 'USD',
      p_warranty_issuer: input.warrantyIssuer ?? null,
      p_receipt_id: input.receiptId ?? null,
    })
    .single()

  if (error) throw toProductError('Creating product', error)

  const row = data as unknown as { product_id: string; public_id: string } | null

  if (!row?.product_id) {
    throw toProductError('Creating product', null)
  }

  return { productId: row.product_id, publicId: row.public_id }
}
