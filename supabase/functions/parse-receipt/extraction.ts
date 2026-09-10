/*
 * The extraction schema, validated on the write side.
 *
 * This is the trust boundary between a language model's reading of a
 * photograph and our database. Nothing reaches `extraction_data` unless it
 * matches this shape exactly; a response that does not is treated as a failed
 * parse, which is the honest outcome.
 *
 * ⚠️ This file is a deliberate duplicate of `src/lib/receiptExtraction.ts`.
 * The browser and this Deno function are separate runtimes, and reaching
 * across the directory boundary with a relative import is fragile under
 * `supabase functions deploy`. The cost of the duplication is that a schema
 * change has to be made in both places — the two files point at each other so
 * the second one is hard to forget.
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

export type ReceiptExtraction = {
  retailer: string | null
  purchaseDate: string | null
  currency: string | null
  products: ReceiptProductCandidate[]
  confidence: {
    retailer: number
    purchaseDate: number
  }
}

/** Matches the length limits the `products` table enforces. */
const MAX_TEXT_LENGTH = 120
const MAX_DESCRIPTION_LENGTH = 200

/** `numeric(12, 2)` — ten digits before the decimal point. */
const MAX_PRICE = 9_999_999_999.99

const MAX_CANDIDATES = 3

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asText(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  return trimmed.slice(0, maxLength)
}

/**
 * Confidence is a display hint and nothing else: it decides whether a field is
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

/** Mirrors `isValidIsoDate` in `src/lib/warrantyDates.ts`: a real calendar date. */
function asIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!ISO_DATE_PATTERN.test(trimmed)) return null

  const [year, month, day] = trimmed.split('-').map(Number)
  if (month < 1 || month > 12) return null

  // Day 0 of the next month is the last day of this one, which gets the
  // leap-year rules right without spelling them out.
  const lastDay = new Date(year, month, 0).getDate()
  if (day < 1 || day > lastDay) return null

  return trimmed
}

/**
 * ISO-4217 shape. Validates the whole string rather than truncating it first:
 * "dollars" cut to three characters is "DOL", which passes the pattern and
 * would file the purchase under a currency that does not exist.
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
 * Describes the *shape* of a reply that failed validation, for the log line.
 *
 * Fixed field names, types, nonblank flags and counts only — never a value.
 * Inspect only the candidates considered by the validator, so an oversized
 * response cannot produce an unbounded log. Receipt contents stay private.
 */
export function describeExtractionShape(value: unknown): string {
  const typeOf = (field: unknown): string =>
    field === null ? 'null' : Array.isArray(field) ? 'array' : typeof field

  const record = asRecord(value)
  if (!record) return `not-an-object(${typeOf(value)})`

  if (!Array.isArray(record.products)) {
    return `products-not-an-array(${typeOf(record.products)})`
  }

  const shapes = record.products.slice(0, MAX_CANDIDATES).map((entry) => {
    const candidate = asRecord(entry)
    if (!candidate) return `non-object(${typeOf(entry)})`

    const names = (['brand', 'model', 'description'] as const).map(
      (key) => `${key}=${typeOf(candidate[key])}(nonblank=${asText(candidate[key]) !== null})`,
    )

    return `${names.join('+')}+price=${typeOf(candidate.price)}`
  })

  return `products=${record.products.length}[${shapes.join(', ')}]`
}

/** Called only after validation fails; an empty selection is a distinct outcome. */
export function getExtractionFailureReason(
  value: unknown,
): 'no_product_found' | 'invalid_extraction' {
  const record = asRecord(value)

  return record && Array.isArray(record.products) && record.products.length === 0
    ? 'no_product_found'
    : 'invalid_extraction'
}

/**
 * Validates a parsed-JSON value against the extraction schema, returning
 * `null` for anything that does not fit. Partial credit is deliberately not on
 * offer: half-understood output would prefill a form with values nobody can
 * account for.
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
