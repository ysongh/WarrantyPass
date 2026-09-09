/*
 * Turning a Supabase failure into something safe to render.
 *
 * The raw error is logged for the developer and replaced with plain copy for
 * the user. Postgres messages name tables, columns and constraints, which is
 * both meaningless to a consumer and more about our schema than we want on
 * screen; storage and function errors can carry request detail for the same
 * reason. Nothing logged here includes values the user typed or uploaded, so
 * serial numbers and receipt contents stay out of the console.
 *
 * Extracted from `products.ts` when receipts became the second caller.
 */

/**
 * Structurally satisfied by `PostgrestError`, `StorageError` and
 * `FunctionsError` alike, none of which share a base type.
 */
export type SupabaseErrorLike = {
  code?: string | null
  message?: string | null
} | null

export type UserFacingMessages = {
  /** Keyed by exact SQLSTATE, for errors a caller can explain precisely. */
  byCode?: Readonly<Record<string, string>>
  /** For the 23xxx integrity-violation class: a check, unique or not-null failure. */
  invalidInput?: string
}

const SESSION_EXPIRED =
  'Your session has expired. Reload the page and try again.'

const GENERIC = 'Something went wrong. Please try again.'

export function toUserFacingError(
  context: string,
  error: SupabaseErrorLike,
  messages: UserFacingMessages = {},
): Error {
  console.error(`[${context}] failed.`, error)

  const code = error?.code ?? ''

  const specific = messages.byCode?.[code]
  if (specific) return new Error(specific)

  if (code === '42501' || code === 'PGRST301') return new Error(SESSION_EXPIRED)

  // 23514 check_violation, 23505 unique_violation, 23502 not_null_violation.
  if (code.startsWith('23')) {
    return new Error(
      messages.invalidInput ?? 'Those details were not accepted. Please check them and try again.',
    )
  }

  return new Error(GENERIC)
}
