import type { SupabaseClient, User } from '@supabase/supabase-js'

/*
 * Anonymous session bootstrap.
 *
 * WarrantyPass has no sign-up in phase 2. Every visitor gets an anonymous
 * Supabase user, and that user's `auth.uid()` owns their product rows. Supabase
 * persists the session in local storage and refreshes it, so the same visitor
 * keeps their data across reloads.
 *
 * This is deliberately temporary. An anonymous user is only as durable as the
 * browser's storage: clear it, or open the app on another device, and the
 * products are unreachable. A later phase will let a user upgrade the *same*
 * user record by linking an email or a wallet-authenticated identity, which is
 * why nothing here assumes the account will always be anonymous.
 *
 * A connected Ethereum wallet is NOT this identity. The browser saying it
 * controls an address proves nothing to Postgres, so wallet state must never
 * decide what rows a request can touch.
 */

/**
 * De-duplicates concurrent bootstraps. React StrictMode runs mount effects
 * twice in development; without this, two `signInAnonymously()` calls race and
 * the first anonymous user — along with anything already saved to it — is
 * orphaned when the second session overwrites it.
 */
let inFlight: Promise<User> | null = null

async function bootstrap(client: SupabaseClient): Promise<User> {
  const { data: existing, error: getSessionError } = await client.auth.getSession()

  if (getSessionError) throw getSessionError
  if (existing.session?.user) return existing.session.user

  const { data: created, error: signInError } = await client.auth.signInAnonymously()

  if (signInError) throw signInError
  if (!created.user) {
    throw new Error('Supabase returned no user for the anonymous sign-in.')
  }

  return created.user
}

/**
 * Resolves to the current Supabase user, signing in anonymously if there is no
 * session yet. Safe to call concurrently — callers share one in-flight attempt.
 *
 * Rejects rather than retrying. Callers surface an error state and let the
 * person retry explicitly; an automatic retry loop against a project with
 * anonymous sign-ins disabled would hammer the endpoint forever.
 */
export function ensureAnonymousSession(client: SupabaseClient): Promise<User> {
  inFlight ??= bootstrap(client).finally(() => {
    inFlight = null
  })

  return inFlight
}
