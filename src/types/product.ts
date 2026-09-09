/*
 * Domain types for phase 2.
 *
 * Written by hand rather than generated. If the project later adopts
 * `supabase gen types`, generate into a separate module and derive these from
 * it — do not keep two competing hand-maintained copies.
 */

/**
 * Three-valued on purpose. `unknown` means the owner does not know the
 * manufacturer's policy, which is different from knowing it is not
 * transferable. Mirrors the `warranties_transferability_allowed` constraint.
 */
export type WarrantyTransferability =
  | 'transferable'
  | 'non_transferable'
  | 'unknown'

/**
 * Derived from `end_date` at read time, never stored. A persisted status goes
 * stale the moment the clock passes midnight.
 */
export type WarrantyStatus = 'active' | 'expiring' | 'expired'

/**
 * A Postgres `date`, always `YYYY-MM-DD`. Distinct from a timestamp: it has no
 * time and no zone, so it must never be fed to `new Date(string)` — see
 * `src/lib/warrantyDates.ts`.
 */
export type IsoDate = string

export type Product = {
  id: string
  publicId: string
  brand: string
  model: string
  /** Private to the owner. Never render this on a public route. */
  serialNumber: string | null
  retailer: string | null
  purchaseDate: IsoDate
  purchasePrice: number | null
  currency: string
  createdAt: string
  updatedAt: string
}

export type Warranty = {
  id: string
  productId: string
  issuer: string | null
  startDate: IsoDate
  endDate: IsoDate
  transferability: WarrantyTransferability
  createdAt: string
  updatedAt: string
}

/**
 * `warranty` is nullable for safety, not because the flow creates products
 * without one: `create_product_with_warranty` always writes both rows in one
 * transaction. It stays nullable so a row written another way — or a future
 * schema change — degrades to a readable page instead of a crash.
 */
export type ProductWithWarranty = Product & {
  warranty: Warranty | null
}

export type CreateProductInput = {
  brand: string
  model: string
  purchaseDate: IsoDate
  serialNumber?: string | null
  retailer?: string | null
  purchasePrice?: number | null
  currency?: string
  warrantyIssuer?: string | null
  warrantyStartDate: IsoDate
  warrantyEndDate: IsoDate
  transferability: WarrantyTransferability
  /**
   * An uploaded receipt to attach, or null for a manually entered product.
   * Receipts are never required — both flows produce the same product.
   */
  receiptId?: string | null
}

export type CreatedProduct = {
  productId: string
  publicId: string
}

export const TRANSFERABILITY_LABELS: Record<WarrantyTransferability, string> = {
  transferable: 'Transferable',
  non_transferable: 'Non-transferable',
  unknown: 'Unknown',
}
