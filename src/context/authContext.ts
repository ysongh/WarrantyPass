import { createContext } from 'react'

/**
 * - `loading` — checking for a session, or signing in anonymously.
 * - `ready` — there is a Supabase user; `userId` owns this person's rows.
 * - `unconfigured` — no Supabase credentials in the environment.
 * - `error` — sign-in failed. Nothing may be read or written.
 */
export type AuthStatus = 'loading' | 'ready' | 'unconfigured' | 'error'

export type AuthSession = {
  status: AuthStatus
  /**
   * The Supabase `auth.uid()` that owns this person's data, or `null` until
   * the session is ready. This is the only authorization identity in the app —
   * a connected wallet address is never used for it.
   */
  userId: string | null
  error: Error | null
  /** Re-attempts the bootstrap after a failure. Never called automatically. */
  retry: () => void
}

export const AuthContext = createContext<AuthSession | null>(null)
