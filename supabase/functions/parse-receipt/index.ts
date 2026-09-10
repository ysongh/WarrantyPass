import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

import { parseReceiptExtraction } from './extraction.ts'
import { extractReceipt, ProviderError } from './provider.ts'

/*
 * parse-receipt
 *
 * Reads one of the caller's own receipt images and stores a structured
 * extraction against it.
 *
 * Authorization
 * -------------
 * The caller's access token is taken from the Authorization header and used
 * to build the Supabase client, so every statement below — the row read, the
 * storage download, the status writes — runs as that user and is checked by
 * the same RLS policies the browser is subject to. **No service-role key is
 * used, and none is needed.** A user id is never accepted from the request
 * body; the only identity is the one in the token.
 *
 * The request carries a receipt id and nothing else. It deliberately does not
 * accept a storage path: a function that reads whatever path it is handed is
 * a function that reads other people's receipts.
 *
 * Privacy
 * -------
 * Receipt bytes are held in memory for the length of one request and are
 * never logged, never echoed in a response, and never written anywhere but
 * the provider request. Log lines carry ids and error reasons only.
 */

const BUCKET = 'receipts'

/** Must agree with the client, the bucket, and the check constraints. */
const MAX_BYTES = 10 * 1024 * 1024

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * A receipt stuck in `processing` for longer than this is assumed abandoned —
 * a crashed invocation or a dropped connection — and may be claimed again.
 * Without it, one failed run would leave a receipt unparseable forever.
 */
const STALE_PROCESSING_MS = 2 * 60 * 1000

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `supabase-js` sends `Authorization` and `content-type`, which makes this a
 * preflighted cross-origin request from the browser.
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  })
}

type ReceiptRow = {
  id: string
  user_id: string
  storage_path: string
  mime_type: string
  size_bytes: number
  extraction_status: string
  extraction_data: unknown
}

/**
 * The type the bytes actually are, from their magic number.
 *
 * Repeated here even though the browser already checked: that check runs on
 * the client, and a client is not something this function gets to trust.
 */
function sniffImageMimeType(bytes: Uint8Array): string | null {
  const startsWith = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte)

  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'

  const ascii = (offset: number, text: string) =>
    [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0))

  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp'

  return null
}

/** Marks the receipt failed, preserving a short reason the UI can act on. */
async function markFailed(
  client: SupabaseClient,
  receiptId: string,
  reason: string,
): Promise<void> {
  const { error } = await client
    .from('receipts')
    .update({ extraction_status: 'failed', extraction_error: reason })
    .eq('id', receiptId)

  if (error) console.error('[parse-receipt] could not mark failed', error.message)
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed.' })
  }

  const authorization = request.headers.get('Authorization')

  if (!authorization) {
    return json(401, { error: 'Authentication required.' })
  }

  let receiptId: unknown

  try {
    receiptId = (await request.json())?.receiptId
  } catch {
    return json(400, { error: 'Expected a JSON body.' })
  }

  if (typeof receiptId !== 'string' || !UUID_PATTERN.test(receiptId)) {
    return json(400, { error: 'A valid receiptId is required.' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !anonKey) {
    console.error('[parse-receipt] SUPABASE_URL or SUPABASE_ANON_KEY is missing.')
    return json(500, { error: 'The receipt reader is not configured.' })
  }

  // The anon key plus the caller's token. Every query below is therefore
  // subject to exactly the policies that protect the browser.
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: auth, error: authError } = await client.auth.getUser()
  const user = auth?.user

  if (authError || !user) {
    return json(401, { error: 'Authentication required.' })
  }

  const { data: row, error: rowError } = await client
    .from('receipts')
    .select(
      'id, user_id, storage_path, mime_type, size_bytes, extraction_status, extraction_data',
    )
    .eq('id', receiptId)
    .maybeSingle<ReceiptRow>()

  if (rowError) {
    console.error('[parse-receipt] receipt lookup failed', rowError.message)
    return json(500, { error: 'Could not load that receipt.' })
  }

  // RLS already hides other users' rows, so a miss here is either "no such
  // receipt" or "not yours" — indistinguishable on purpose. The explicit
  // ownership check below is belt and braces, not the boundary.
  if (!row || row.user_id !== user.id) {
    return json(404, { error: 'Receipt not found.' })
  }

  // Already read, and the stored result still validates: return it rather
  // than paying to read the same image twice. A re-scan reaches the provider
  // by first resetting the row's status, not by bypassing this.
  if (row.extraction_status === 'completed') {
    const existing = parseReceiptExtraction(row.extraction_data)
    if (existing) return json(200, { status: 'completed', extraction: existing })
  }

  // Claim the receipt. A conditional update is what makes this safe against
  // two invocations racing: whichever one changes the row proceeds, the other
  // is told to wait. Rows stuck in `processing` past the staleness window are
  // fair game again.
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS).toISOString()

  const { data: claimed, error: claimError } = await client
    .from('receipts')
    .update({ extraction_status: 'processing', extraction_error: null })
    .eq('id', receiptId)
    .or(`extraction_status.neq.processing,updated_at.lt.${staleBefore}`)
    .select('id')
    .maybeSingle()

  if (claimError) {
    console.error('[parse-receipt] could not claim receipt', claimError.message)
    return json(500, { error: 'Could not start reading that receipt.' })
  }

  if (!claimed) {
    return json(409, { error: 'That receipt is already being read.' })
  }

  try {
    const { data: file, error: downloadError } = await client.storage
      .from(BUCKET)
      .download(row.storage_path)

    if (downloadError || !file) {
      throw new ProviderError('missing_file', downloadError?.message ?? 'No object.')
    }

    const bytes = new Uint8Array(await file.arrayBuffer())

    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
      throw new ProviderError('bad_size', `Object is ${bytes.byteLength} bytes.`)
    }

    // The row's recorded type is not evidence either — it came from a client.
    // What the bytes are is the only thing worth acting on, and it has to
    // agree with what we told the database we stored.
    const sniffed = sniffImageMimeType(bytes)

    if (!sniffed || !ALLOWED_MIME_TYPES.includes(sniffed) || sniffed !== row.mime_type) {
      throw new ProviderError('unsupported_media', `Sniffed ${sniffed ?? 'unknown'}.`)
    }

    const raw = await extractReceipt(bytes, sniffed)
    const extraction = parseReceiptExtraction(raw)

    // Schema-shaped but not usable — no legible product on the receipt, or a
    // reply that did not survive validation. Either way this receipt was not
    // read, and saying so is more useful than storing something hollow.
    if (!extraction) {
      throw new ProviderError('no_product_found', 'Extraction failed validation.')
    }

    const { error: saveError } = await client
      .from('receipts')
      .update({
        extraction_status: 'completed',
        extraction_data: extraction,
        extraction_error: null,
      })
      .eq('id', receiptId)

    if (saveError) {
      console.error('[parse-receipt] could not save extraction', saveError.message)
      throw new ProviderError('save_failed', saveError.message)
    }

    return json(200, { status: 'completed', extraction })
  } catch (cause) {
    const reason = cause instanceof ProviderError ? cause.reason : 'unexpected_error'

    // The detail is for this log line only. It can name provider internals
    // and request state, so it does not go into the row or the response.
    console.error(`[parse-receipt] ${receiptId} failed: ${reason}`, String(cause))

    await markFailed(client, receiptId, reason)

    return json(502, { status: 'failed', reason })
  }
})
