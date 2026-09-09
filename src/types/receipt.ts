import type { IsoDate } from './product'

/*
 * Domain types for phase 3 receipts.
 *
 * Hand-written, like `product.ts`, and for the same reason. If the project ever
 * adopts `supabase gen types`, generate into a separate module and derive these
 * from it rather than keeping two hand-maintained copies.
 */

/** Mirrors the `receipts_extraction_status_allowed` check constraint. */
export type ReceiptExtractionStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'

/**
 * 10 MiB. The same number is enforced in four places that must agree: here, the
 * `receipts_size_bytes_max` constraint, the bucket's `file_size_limit`, and the
 * Edge Function. Called "10 MB" in the interface, which is what people mean.
 */
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024

/**
 * Phase 3 is images only. PDFs are a real and common receipt format, but
 * supporting them means a second preview path and a different provider payload,
 * so they are deliberately out of scope rather than half-working.
 */
export const RECEIPT_ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export type ReceiptMimeType = (typeof RECEIPT_ACCEPTED_MIME_TYPES)[number]

/** For the file input's `accept`. Advisory only — the real checks are below. */
export const RECEIPT_ACCEPT_ATTRIBUTE = RECEIPT_ACCEPTED_MIME_TYPES.join(',')

/**
 * Fields at or below this are shown with a "please verify" note. Nothing is
 * blocked by it: a low score means the model is unsure, not that the value is
 * wrong, and the person holding the receipt is the authority either way.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.7

/**
 * One item the parser thinks might be the warranty-eligible product. Every
 * field is nullable because a receipt line is often just "SONY HDPHN 449.99",
 * and inventing the rest of it would be worse than admitting the gap.
 */
export type ReceiptProductCandidate = {
  brand: string | null
  model: string | null
  description: string | null
  serialNumber: string | null
  price: number | null
  confidence: {
    brand: number
    model: number
    serialNumber: number
    price: number
  }
}

/**
 * What the parser returns.
 *
 * This splits the schema sketched in the phase 3 brief in one place: the brief
 * shows a single `product` with a flat `confidence` map, but a receipt can list
 * several items, so the per-product fields (brand, model, serial, price) and
 * their scores live on each candidate, while the fields that belong to the
 * receipt as a whole (retailer, date, currency) stay at the top. Every
 * confidence key from the brief still exists, just at the level it applies to.
 *
 * Warranty terms are deliberately absent. The parser is not asked for coverage
 * length, expiry, transferability or any manufacturer policy, even when a
 * document appears to state one — those stay with the user.
 */
export type ReceiptExtraction = {
  retailer: string | null
  purchaseDate: IsoDate | null
  currency: string | null
  /** At least one, at most three, ordered most likely first. */
  products: ReceiptProductCandidate[]
  confidence: {
    retailer: number
    purchaseDate: number
  }
}

/** Display-only fields. Deliberately excludes the extraction blob. */
export type ReceiptSummary = {
  id: string
  productId: string | null
  storagePath: string
  originalFilename: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

/**
 * A receipt with its extraction state. `user_id` is not mapped: the client has
 * no use for it, and RLS — not the app — is what confines these rows to their
 * owner.
 */
export type Receipt = ReceiptSummary & {
  receiptHash: string | null
  extractionStatus: ReceiptExtractionStatus
  /** Parsed and re-validated from `extraction_data`; `null` if it failed to. */
  extraction: ReceiptExtraction | null
  extractionError: string | null
  updatedAt: string
}
