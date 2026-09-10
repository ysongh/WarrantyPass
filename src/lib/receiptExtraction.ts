import type { IsoDate } from '../types/product'
import {
  LOW_CONFIDENCE_THRESHOLD,
  type ReceiptExtraction,
  type ReceiptProductCandidate,
} from '../types/receipt'
import { isValidIsoDate } from './warrantyDates'

/*
 * Validating what came back from the AI, and turning it into form defaults.
 *
 * `parseReceiptExtraction` is a trust boundary, not a convenience. Its input is
 * a language model's reading of a photograph a stranger could have crafted, and
 * it is stored in an unconstrained `jsonb` column, so nothing about its shape
 * can be assumed on the way back out either. Anything that does not match is
 * rejected outright and the user is told the receipt could not be read — which
 * is true, and leaves them with the manual form.
 *
 * The Edge Function performs the same validation before it writes, so bad
 * output never reaches the database. This copy is what defends the *read*. The
 * two live on opposite sides of a runtime boundary (browser and Deno) and are
 * deliberately duplicated rather than shared through a fragile cross-directory
 * import; if you change the schema, change both. See
 * `supabase/functions/parse-receipt/extraction.ts`.
 */

/** Matches the length limits the `products` table already enforces. */
const MAX_TEXT_LENGTH = 120
const MAX_DESCRIPTION_LENGTH = 200

/** `numeric(12, 2)` — ten digits before the decimal point. */
const MAX_PRICE = 9_999_999_999.99

/** More than three candidates is a list to read, not a choice to make. */
const MAX_CANDIDATES = 3

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * Trimmed text, or null. An empty or whitespace-only string is treated as
 * absent: a model that answers `""` is saying it could not find the field, and
 * writing that into a form field would look like a value the user had entered.
 */
function asText(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  return trimmed.slice(0, maxLength)
}

/**
 *  * Confidence is a display hint and nothing else: it decides whether a field is
 * marked "please verify". It is deliberately **total** — a malformed score
 * degrades to 0, which reads as "unknown" and shows the marker.
 *
 * This was once strict, and rejecting the whole extraction when a score did not
 * parse was a real bug: a model reporting 95 instead of 0.95 threw away a
 * perfectly good reading of the receipt. Decoration must never be able to void
 * data. Percentages are read as such, because models emit them.
 */
function asConfidence(value: unknown): number {
  const raw = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(raw) || raw <= 0) return 0

  return Math.min(raw > 1 && raw <= 100 ? raw / 100 : raw, 1)
}

function asPrice(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < 0 || value > MAX_PRICE) return null

  return Math.round(value * 100) / 100
}

function asIsoDate(value: unknown): IsoDate | null {
  return typeof value === 'string' && isValidIsoDate(value.trim())
    ? value.trim()
    : null
}

/**
 * ISO-4217 shape, matching the `products_currency_format` constraint.
 *
 * Validates the whole string rather than truncating it first: "dollars" cut to
 * three characters is "DOL", which passes the pattern and would file the
 * purchase under a currency that does not exist.
 */
function asCurrency(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const upper = value.trim().toUpperCase()

  return /^[A-Z]{3}$/.test(upper) ? upper : null
}

function parseCandidate(value: unknown): ReceiptProductCandidate | null {
  const record = asRecord(value)
  if (!record) return null

  const scores = asRecord(record.confidence) ?? {}

  const candidate: ReceiptProductCandidate = {
    brand: asText(record.brand),
    model: asText(record.model),
    description: asText(record.description, MAX_DESCRIPTION_LENGTH),
    serialNumber: asText(record.serialNumber),
    price: asPrice(record.price),
    confidence: {
      brand: asConfidence(scores.brand),
      model: asConfidence(scores.model),
      serialNumber: asConfidence(scores.serialNumber),
      price: asConfidence(scores.price),
    },
  }

  // Something has to name the product. A line with only a price is an item we
  // cannot describe to the user, but a description alone is still worth
  // showing — they can supply the brand and model themselves.
  if (!candidate.brand && !candidate.model && !candidate.description) return null

  return candidate
}

/**
 * Validates a parsed-JSON value against the extraction schema.
 *
 * Returns `null` for anything that does not fit, which callers surface as "we
 * couldn't read this receipt". Partial credit is deliberately not on offer:
 * half-understood output prefills a form with values nobody can account for.
 */
export function parseReceiptExtraction(value: unknown): ReceiptExtraction | null {
  const record = asRecord(value)
  if (!record) return null

  const scores = asRecord(record.confidence) ?? {}

  if (!Array.isArray(record.products)) return null

  const products = record.products
    .slice(0, MAX_CANDIDATES)
    .map(parseCandidate)
    .filter((candidate): candidate is ReceiptProductCandidate => candidate !== null)

  if (products.length === 0) return null

  return {
    retailer: asText(record.retailer),
    purchaseDate: asIsoDate(record.purchaseDate),
    currency: asCurrency(record.currency),
    products,
    confidence: {
      retailer: asConfidence(scores.retailer),
      purchaseDate: asConfidence(scores.purchaseDate),
    },
  }
}

/** The form fields a receipt can fill in. Warranty fields are never among them. */
export type ReceiptPrefillField =
  | 'brand'
  | 'model'
  | 'retailer'
  | 'purchaseDate'
  | 'purchasePrice'
  | 'serialNumber'

export type ReceiptPrefill = {
  /** Only the fields the receipt actually supplied. Absent keys keep the form's own defaults. */
  values: Partial<Record<ReceiptPrefillField, string>>
  /** Stored alongside the price so an EUR receipt is not filed as USD. */
  currency: string | null
  /** Fields to mark "please verify". Never fields the user must fix to continue. */
  lowConfidence: ReceiptPrefillField[]
}

/**
 * Maps one candidate onto product-form defaults.
 *
 * Nothing here touches the warranty. Coverage length, expiry, issuer and
 * transferability are asked of the user in every flow, scanned or manual, and a
 * receipt that happens to print "1 year warranty" does not change that.
 */
export function toReceiptPrefill(
  extraction: ReceiptExtraction,
  candidateIndex = 0,
): ReceiptPrefill {
  const candidate = extraction.products[candidateIndex] ?? extraction.products[0]

  const values: Partial<Record<ReceiptPrefillField, string>> = {}
  const lowConfidence: ReceiptPrefillField[] = []

  function put(field: ReceiptPrefillField, value: string | null, confidence: number) {
    if (value === null) return

    values[field] = value
    if (confidence <= LOW_CONFIDENCE_THRESHOLD) lowConfidence.push(field)
  }

  if (candidate) {
    put('brand', candidate.brand, candidate.confidence.brand)
    put('model', candidate.model, candidate.confidence.model)
    put('serialNumber', candidate.serialNumber, candidate.confidence.serialNumber)
    put(
      'purchasePrice',
      candidate.price === null ? null : candidate.price.toFixed(2),
      candidate.confidence.price,
    )
  }

  put('retailer', extraction.retailer, extraction.confidence.retailer)
  put('purchaseDate', extraction.purchaseDate, extraction.confidence.purchaseDate)

  return { values, currency: extraction.currency, lowConfidence }
}

/** A short human label for a candidate, e.g. "Sony WH-1000XM6". */
export function describeCandidate(candidate: ReceiptProductCandidate): string {
  const name = [candidate.brand, candidate.model].filter(Boolean).join(' ')

  return name || candidate.description || 'Unnamed item'
}
