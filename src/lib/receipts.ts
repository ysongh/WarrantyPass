import type { SupabaseClient } from '@supabase/supabase-js'

import {
  RECEIPT_ACCEPTED_MIME_TYPES,
  RECEIPT_MAX_BYTES,
  type Receipt,
  type ReceiptExtractionStatus,
  type ReceiptMimeType,
  type ReceiptSummary,
} from '../types/receipt'
import { parseReceiptExtraction } from './receiptExtraction'
import { supabase } from './supabase'
import { toUserFacingError, type UserFacingMessages } from './supabaseErrors'

/*
 * Every Supabase read, write, upload and download for receipts lives here, so
 * no page or component ever touches Storage directly.
 *
 * As in `products.ts`, nothing below filters by user: RLS confines every
 * statement to `auth.uid()`'s own rows, and the storage policies confine every
 * object to the caller's own folder. A client-side filter would imply the app
 * is what enforces that.
 *
 * Receipts are the most sensitive thing the app stores — a photo can carry a
 * name, an address, an order number and the last four digits of a card. Nothing
 * here logs a filename, a signed URL or any file content.
 */

const BUCKET = 'receipts'

/**
 * Signed URLs are minted per view and never persisted. A minute is long enough
 * to open an image and short enough that a URL copied out of devtools is
 * useless by the time anyone tries it.
 */
const SIGNED_URL_TTL_SECONDS = 60

const RECEIPT_COLUMNS = `
  id,
  product_id,
  storage_path,
  original_filename,
  mime_type,
  size_bytes,
  receipt_hash,
  extraction_status,
  extraction_data,
  extraction_error,
  created_at,
  updated_at
`

/**
 * What the product page needs. `extraction_data` is deliberately absent: it can
 * run to kilobytes per receipt, and a page that only says "receipt stored" has
 * no use for the model's reasoning about it.
 */
const RECEIPT_SUMMARY_COLUMNS = `
  id,
  product_id,
  storage_path,
  original_filename,
  mime_type,
  size_bytes,
  created_at
`

type ReceiptSummaryRow = {
  id: string
  product_id: string | null
  storage_path: string
  original_filename: string
  mime_type: string
  size_bytes: number | string
  created_at: string
}

type ReceiptRow = ReceiptSummaryRow & {
  receipt_hash: string | null
  extraction_status: string
  extraction_data: unknown
  extraction_error: string | null
  updated_at: string
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const EXTRACTION_STATUSES: readonly ReceiptExtractionStatus[] = [
  'pending',
  'processing',
  'completed',
  'failed',
]

const RECEIPT_MESSAGES: UserFacingMessages = {
  invalidInput:
    "That receipt wasn't accepted. Try a different photo, or enter the details yourself.",
}

function toReceiptError(context: string, error: unknown): Error {
  // Storage and Functions errors are plain `Error` subclasses with no `code`,
  // so they fall through to the generic message — which is the right outcome:
  // their messages can describe request internals we do not want on screen.
  const shaped =
    typeof error === 'object' && error !== null
      ? (error as { code?: string | null; message?: string | null })
      : null

  return toUserFacingError(`receipts: ${context}`, shaped, RECEIPT_MESSAGES)
}

function requireClient(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'WarrantyPass is not connected to a database. Add Supabase credentials to your environment.',
    )
  }

  return supabase
}

/**
 * The signed-in user's id, for building the storage path.
 *
 * Read from the session rather than accepted as an argument: a caller passing
 * the wrong id would be rejected by RLS anyway, but this way the mistake cannot
 * be made. Note that `auth.uid()` on the database is still what decides
 * ownership — this value only shapes the path.
 */
async function requireUserId(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getSession()

  if (error) throw toReceiptError('Reading session', error)

  const userId = data.session?.user.id
  if (!userId) {
    throw new Error('Your session has expired. Reload the page and try again.')
  }

  return userId
}

function toStatus(value: string): ReceiptExtractionStatus {
  return (EXTRACTION_STATUSES as readonly string[]).includes(value)
    ? (value as ReceiptExtractionStatus)
    : 'failed'
}

function toNumber(value: number | string): number {
  const parsed = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(parsed) ? parsed : 0
}

function mapSummary(row: ReceiptSummaryRow): ReceiptSummary {
  return {
    id: row.id,
    productId: row.product_id,
    storagePath: row.storage_path,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: toNumber(row.size_bytes),
    createdAt: row.created_at,
  }
}

function mapReceipt(row: ReceiptRow): Receipt {
  return {
    ...mapSummary(row),
    receiptHash: row.receipt_hash,
    extractionStatus: toStatus(row.extraction_status),
    // Re-validated on the way out. `extraction_data` is unconstrained `jsonb`,
    // so its shape is not guaranteed by the column type, and it originated with
    // a language model reading a photograph.
    extraction: parseReceiptExtraction(row.extraction_data),
    extractionError: row.extraction_error,
    updatedAt: row.updated_at,
  }
}

// ---------------------------------------------------------------------------
// File validation
// ---------------------------------------------------------------------------

function isAcceptedMimeType(value: string): value is ReceiptMimeType {
  return (RECEIPT_ACCEPTED_MIME_TYPES as readonly string[]).includes(value)
}

/**
 * The cheap checks, from what the browser claims. Returns a message to show, or
 * null when the file passes. Deliberately not the only check — see
 * `sniffImageMimeType`.
 */
export function validateReceiptFile(file: File): string | null {
  if (!isAcceptedMimeType(file.type)) {
    return 'That file type is not supported. Upload a JPG, PNG or WebP image.'
  }

  if (file.size === 0) return 'That file is empty.'

  if (file.size > RECEIPT_MAX_BYTES) {
    return 'That image is larger than 10 MB. Try a smaller photo.'
  }

  return null
}

/**
 * The type the bytes actually are, from their magic number, or null if they are
 * not an image we accept.
 *
 * `File.type` comes from the operating system's extension mapping, so renaming
 * `payload.exe` to `photo.jpg` is enough to make a browser report
 * `image/jpeg`. Reading the header is what makes the file-type rule mean
 * something. The Edge Function repeats this check on the bytes it downloads,
 * because a determined client can skip this one entirely.
 */
export function sniffImageMimeType(bytes: Uint8Array): ReceiptMimeType | null {
  const startsWith = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte)

  // FF D8 FF — SOI followed by the first marker.
  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg'

  // 89 "PNG" CR LF SUB LF.
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'

  // "RIFF" .... "WEBP" — the size field sits between the two tags.
  const ascii = (offset: number, text: string) =>
    [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0))

  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp'

  return null
}

/** Lowercase hex SHA-256 of exactly these bytes. */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

const EXTENSIONS: Record<ReceiptMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * Keeps the original name presentable without trusting it. Control characters
 * are stripped because they can rewrite a line of terminal or log output, and
 * the result is capped to the column's limit.
 */
function safeFilename(name: string): string {
  // oxlint-disable-next-line no-control-regex -- stripping them is the point.
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, '').trim()

  return cleaned.slice(0, 255) || 'receipt'
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** One receipt by id, or null when it does not exist or is not the caller's. */
export async function getReceipt(id: string): Promise<Receipt | null> {
  const client = requireClient()

  if (!UUID_PATTERN.test(id)) return null

  const { data, error } = await client
    .from('receipts')
    .select(RECEIPT_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw toReceiptError('Loading receipt', error)
  if (!data) return null

  return mapReceipt(data as unknown as ReceiptRow)
}

/** The receipt attached to a product, if it has one. */
export async function getReceiptForProduct(
  productId: string,
): Promise<ReceiptSummary | null> {
  const client = requireClient()

  if (!UUID_PATTERN.test(productId)) return null

  const { data, error } = await client
    .from('receipts')
    .select(RECEIPT_SUMMARY_COLUMNS)
    .eq('product_id', productId)
    .maybeSingle()

  if (error) throw toReceiptError('Loading product receipt', error)
  if (!data) return null

  return mapSummary(data as unknown as ReceiptSummaryRow)
}

/**
 * A short-lived URL the owner can open the image with.
 *
 * Minted on demand and never stored — not in the database, not in a query
 * cache, not in a link the user could share by accident. Supabase issues it
 * only if the storage policies would have allowed this caller to read the
 * object, so authorization still happens at the boundary rather than here.
 */
export async function createReceiptViewUrl(storagePath: string): Promise<string> {
  const client = requireClient()

  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)

  if (error || !data?.signedUrl) {
    throw toReceiptError('Creating receipt view link', error)
  }

  return data.signedUrl
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Validates, hashes and uploads a receipt, and returns the draft row.
 *
 * The order matters. The row is created first so the object always has a record
 * that owns it; an object with no row would be invisible and unreachable. If
 * the upload then fails, the row is deleted again rather than left behind as a
 * receipt that appears to exist but has no image.
 *
 * Each attempt mints a fresh id, and so a fresh path. Nothing is ever
 * overwritten — which is also why the storage policies grant no UPDATE, and why
 * the upload passes `upsert: false`.
 */
export async function createReceipt(file: File): Promise<Receipt> {
  const client = requireClient()

  if (!globalThis.crypto?.subtle) {
    // Both randomUUID and subtle.digest need a secure context. Saying so beats
    // failing with "cannot read properties of undefined".
    throw new Error(
      'Uploading a receipt needs a secure connection. Open WarrantyPass over https or on localhost.',
    )
  }

  const validationMessage = validateReceiptFile(file)
  if (validationMessage) throw new Error(validationMessage)

  // Read once, then hash and upload the same bytes. Hashing the file and
  // uploading it separately would leave two reads that could, in principle,
  // disagree — and `receipt_hash` is meant to describe what was actually
  // stored.
  const bytes = new Uint8Array(await file.arrayBuffer())

  const mimeType = sniffImageMimeType(bytes)
  if (!mimeType) {
    throw new Error(
      'That file is not a JPG, PNG or WebP image, whatever its name says.',
    )
  }

  const receiptHash = await sha256Hex(bytes)
  const id = crypto.randomUUID()
  const userId = await requireUserId(client)

  // Nothing identifying goes in the path — no filename, no email, no serial
  // number, no retailer. Two UUIDs and a fixed name.
  const storagePath = `${userId}/${id}/receipt.${EXTENSIONS[mimeType]}`

  const { data, error } = await client
    .from('receipts')
    .insert({
      id,
      user_id: userId,
      storage_path: storagePath,
      original_filename: safeFilename(file.name),
      mime_type: mimeType,
      size_bytes: bytes.byteLength,
      receipt_hash: receiptHash,
    })
    .select(RECEIPT_COLUMNS)
    .single()

  if (error) throw toReceiptError('Creating receipt', error)

  const { error: uploadError } = await client.storage
    .from(BUCKET)
    .upload(storagePath, new Blob([bytes as BlobPart], { type: mimeType }), {
      contentType: mimeType,
      upsert: false,
    })

  if (uploadError) {
    // Best effort. If this cleanup fails too, the row is an orphan pointing at
    // an object that was never written — harmless, invisible, and covered by
    // the same future sweep as any other abandoned draft.
    await client.from('receipts').delete().eq('id', id)

    throw toReceiptError('Uploading receipt', uploadError)
  }

  return mapReceipt(data as unknown as ReceiptRow)
}

/**
 * Copy for each reason the parser can fail with. The tokens themselves are
 * ours and carry nothing identifying, but they are not sentences — a user
 * should not be shown `unsupported_media`.
 *
 * Anything unmapped falls back to `default`, so a new reason token degrades to
 * generic copy rather than to a blank message.
 */
const PARSE_FAILURE_COPY: Record<string, string> = {
  default: "We couldn't read this receipt.",
  not_configured: 'Receipt scanning is not set up on this project yet.',
  image_too_large:
    "That photo is too large to read. Try a smaller or more compressed image.",
  unsupported_media: "That file isn't an image we can read.",
  missing_file: "We couldn't find that receipt file. Try uploading it again.",
  no_product_found:
    "We couldn't find a product on that receipt. Check the whole receipt is in frame, or enter the details yourself.",
  rate_limited: 'Too many receipts at once. Wait a moment and try again.',
  timeout: 'Reading that receipt took too long. Try again.',
  declined: "We couldn't read this receipt.",
}

/** Digs the reason token out of a non-2xx `functions.invoke` failure. */
async function readFailureReason(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context

  if (!(context instanceof Response)) return 'unknown'

  try {
    const body = (await context.clone().json()) as { reason?: unknown }

    return typeof body.reason === 'string' ? body.reason : 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Runs the receipt through the parser and returns the updated row.
 *
 * Already-parsed receipts short-circuit unless `force` is set. This is the
 * safeguard against paying an AI provider twice for the same image because a
 * component re-rendered or the user pressed back and forward; `force` is
 * reachable only from an explicit Re-scan.
 */
export async function parseReceipt(
  receiptId: string,
  { force = false }: { force?: boolean } = {},
): Promise<Receipt> {
  const client = requireClient()

  if (!force) {
    const existing = await getReceipt(receiptId)

    if (existing?.extractionStatus === 'completed' && existing.extraction) {
      return existing
    }
  }

  const { error } = await client.functions.invoke('parse-receipt', {
    body: { receiptId },
  })

  if (error) {
    // `invoke` reports a non-2xx as an opaque "non-2xx status code" and leaves
    // the body on `error.context`. The body is ours and carries a short reason
    // token, which is the only thing that says *why* — worth the unwrap.
    const reason = await readFailureReason(error)

    console.error(`[receipts: Parsing receipt] failed: ${reason}`, error)
    throw new Error(PARSE_FAILURE_COPY[reason] ?? PARSE_FAILURE_COPY.default)
  }

  // Re-read rather than trusting the response body, so the row stays the single
  // source of truth for what was actually stored.
  const parsed = await getReceipt(receiptId)

  if (!parsed) throw new Error("We couldn't read this receipt.")

  return parsed
}

/**
 * Discards an unattached receipt: the row first, then the object.
 *
 * That order is chosen for its failure mode. A row left pointing at a deleted
 * object is a broken receipt the user can see; an object left behind after its
 * row is gone is invisible and costs only storage. If the second step fails,
 * the first has still done the part that matters.
 *
 * Only drafts. An attached receipt is evidence for the product it belongs to,
 * and deleting those is deliberately not a feature yet.
 */
export async function discardReceipt(
  receipt: Pick<Receipt, 'id' | 'storagePath' | 'productId'>,
): Promise<void> {
  const client = requireClient()

  if (receipt.productId) {
    throw new Error('This receipt belongs to a product and cannot be discarded.')
  }

  const { error } = await client.from('receipts').delete().eq('id', receipt.id)

  if (error) throw toReceiptError('Discarding receipt', error)

  const { error: storageError } = await client.storage
    .from(BUCKET)
    .remove([receipt.storagePath])

  if (storageError) {
    console.error('[receipts: Removing receipt object] failed.', storageError)
  }
}
