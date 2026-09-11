import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { keccak256 } from 'npm:viem@2'

/*
 * hash-receipt
 *
 * Computes the keccak256 digest of one of the caller's own stored receipt
 * objects and records it, so phase 4 can anchor that value onchain.
 *
 * Why this runs on the server
 * ---------------------------
 * The digest is the whole substance of the onchain claim, so it has to describe
 * the bytes that are *actually in Storage* — not bytes a browser says it
 * uploaded. If the client computed it, the app would be anchoring a hash of
 * file A while Storage held file B, and nothing downstream could detect it.
 * Reading the stored object here removes that gap entirely.
 *
 * Consequently the client never supplies a hash, and one would be ignored if it
 * did. The request carries a receipt id and nothing else — no user id, and
 * deliberately no storage path, because a function that reads whatever path it
 * is handed is a function that reads other people's receipts.
 *
 * Authorization
 * -------------
 * Identical to parse-receipt: the caller's access token builds the Supabase
 * client, so the row read, the object download and the write are all checked by
 * the same RLS that protects the browser. **No service-role key is used, and
 * none is needed.**
 *
 * Hashes are never overwritten
 * ----------------------------
 * A digest that gets silently rewritten whenever it stops matching proves
 * nothing. Two rules enforce that here:
 *
 *   - The phase 3 SHA-256 is recomputed from the same bytes and compared. It is
 *     the witness that the stored object is still the one that was uploaded, so
 *     a mismatch means the object changed underneath us and the run stops.
 *   - The keccak write is conditional on the column still being null, so it can
 *     only ever add a value, never replace one. A recomputation that disagrees
 *     with a stored digest is reported as an integrity conflict for a human to
 *     look at.
 *
 * Neither hash is repaired automatically. That matters most once a value has
 * been anchored onchain, where the old digest is permanent and a quiet local
 * rewrite would make the app claim a match that does not exist.
 *
 * Privacy
 * -------
 * Receipt bytes are held in memory for one request, are never logged, never
 * echoed, and never sent anywhere — there is no provider call in this function
 * and no AI involvement in hashing. Log lines carry ids and fixed reasons only.
 */

const BUCKET = 'receipts'

/** Must agree with the client, the bucket, and the check constraints. */
const MAX_BYTES = 10 * 1024 * 1024

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  size_bytes: number
  receipt_hash: string | null
  receipt_keccak256: string | null
}

/**
 * Lowercase hex SHA-256, matching the bare (unprefixed) format phase 3 wrote
 * from the browser. Used only to detect that the stored object changed.
 */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Re-reads the digest after a conditional write matched no rows, which means
 * another invocation set it first. Returns null if it still cannot be read.
 */
async function readStoredKeccak(
  client: SupabaseClient,
  receiptId: string,
): Promise<string | null> {
  const { data } = await client
    .from('receipts')
    .select('receipt_keccak256')
    .eq('id', receiptId)
    .maybeSingle<{ receipt_keccak256: string | null }>()

  return data?.receipt_keccak256 ?? null
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
    console.error('[hash-receipt] SUPABASE_URL or SUPABASE_ANON_KEY is missing.')
    return json(500, { error: 'Receipt hashing is not configured.' })
  }

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
    .select('id, user_id, storage_path, size_bytes, receipt_hash, receipt_keccak256')
    .eq('id', receiptId)
    .maybeSingle<ReceiptRow>()

  if (rowError) {
    console.error('[hash-receipt] receipt lookup failed')
    return json(500, { error: 'Could not load that receipt.' })
  }

  // RLS already hides other users' rows, so a miss is either "no such receipt"
  // or "not yours" — indistinguishable on purpose. The ownership comparison is
  // belt and braces, not the boundary.
  if (!row || row.user_id !== user.id) {
    return json(404, { error: 'Receipt not found.' })
  }

  const { data: file, error: downloadError } = await client.storage
    .from(BUCKET)
    .download(row.storage_path)

  if (downloadError || !file) {
    console.error(`[hash-receipt] ${receiptId} object download failed`)
    return json(502, { error: 'Could not read the stored receipt.', reason: 'missing_object' })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())

  // An empty object still has a perfectly valid keccak256, which is exactly the
  // problem: it would anchor a digest that describes nothing. Treat it as a
  // broken object instead.
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    console.error(`[hash-receipt] ${receiptId} unusable object size`)
    return json(422, { error: 'The stored receipt is unusable.', reason: 'bad_size' })
  }

  // The digest describes the original stored bytes exactly as they are — no
  // resizing, no re-encoding, no decoding to text, no base64. Hashing anything
  // derived from the file would make the onchain claim false.
  const computedKeccak = keccak256(bytes)
  const computedSha256 = await sha256Hex(bytes)

  // Phase 3's SHA-256 is the evidence that these are the bytes that were
  // uploaded. If it disagrees, the object changed after upload and this run
  // must not produce a digest to anchor. Nothing is rewritten.
  if (row.receipt_hash && row.receipt_hash !== computedSha256) {
    console.error(`[hash-receipt] ${receiptId} stored sha256 does not match the object`)
    return json(409, {
      error: 'The stored receipt no longer matches its recorded hash.',
      reason: 'object_integrity_mismatch',
    })
  }

  // Already hashed. Deterministic input means a re-run agrees, so a difference
  // here is an integrity problem, not a reason to update the column.
  if (row.receipt_keccak256) {
    if (row.receipt_keccak256 !== computedKeccak) {
      console.error(`[hash-receipt] ${receiptId} stored keccak does not match the object`)
      return json(409, {
        error: 'The stored receipt no longer matches its recorded proof hash.',
        reason: 'keccak_integrity_mismatch',
      })
    }

    return json(200, { status: 'ok', receiptKeccak256: row.receipt_keccak256 })
  }

  // Conditional on the column still being null, so this statement can only add
  // a digest and never replace one. The guarantee is structural rather than a
  // matter of the checks above running in the right order.
  const { data: written, error: writeError } = await client
    .from('receipts')
    .update({ receipt_keccak256: computedKeccak })
    .eq('id', receiptId)
    .is('receipt_keccak256', null)
    .select('receipt_keccak256')
    .maybeSingle<{ receipt_keccak256: string }>()

  if (writeError) {
    console.error(`[hash-receipt] ${receiptId} could not save the digest`)
    return json(500, { error: 'Could not save the receipt hash.', reason: 'save_failed' })
  }

  if (!written) {
    // Another invocation won the race. It hashed the same bytes, so it should
    // have written the same value — confirm rather than assume.
    const stored = await readStoredKeccak(client, receiptId)

    if (!stored) {
      return json(500, { error: 'Could not save the receipt hash.', reason: 'save_failed' })
    }

    if (stored !== computedKeccak) {
      console.error(`[hash-receipt] ${receiptId} concurrent write disagrees`)
      return json(409, {
        error: 'The stored receipt no longer matches its recorded proof hash.',
        reason: 'keccak_integrity_mismatch',
      })
    }

    return json(200, { status: 'ok', receiptKeccak256: stored })
  }

  return json(200, { status: 'ok', receiptKeccak256: written.receipt_keccak256 })
})
