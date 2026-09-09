import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { AuthContext, type AuthSession } from '../../context/authContext'
import { ensureAnonymousSession } from '../../lib/authSession'
import { supabase } from '../../lib/supabase'

type State = Pick<AuthSession, 'status' | 'userId' | 'error'>

const LOADING: State = { status: 'loading', userId: null, error: null }
const UNCONFIGURED: State = { status: 'unconfigured', userId: null, error: null }

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause))
}

/**
 * Signs the visitor in anonymously on start-up and publishes the resulting
 * Supabase user id to the app. Everything that reads or writes product data
 * waits on this.
 */
function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(supabase ? LOADING : UNCONFIGURED)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const client = supabase
    if (!client) return

    let cancelled = false

    ensureAnonymousSession(client)
      .then((user) => {
        if (!cancelled) setState({ status: 'ready', userId: user.id, error: null })
      })
      .catch((cause: unknown) => {
        if (cancelled) return

        // Detail for the developer console only. The UI shows generic copy —
        // Supabase auth errors can carry configuration detail we would rather
        // not print into the page.
        console.error('Supabase anonymous sign-in failed.', cause)
        setState({ status: 'error', userId: null, error: toError(cause) })
      })

    // Keeps the id current if Supabase refreshes or replaces the session.
    // Deliberately does not sign in again on a null session: retrying from
    // inside the listener that a failed retry would itself fire is how you get
    // an endless sign-in loop. Recovery is the explicit `retry()` below.
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      if (cancelled || !user) return

      setState((previous) =>
        previous.status === 'ready' && previous.userId === user.id
          ? previous
          : { status: 'ready', userId: user.id, error: null },
      )
    })

    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [attempt])

  // Resets to `loading` here rather than inside the effect: the click is what
  // caused the change, and setting it in the effect would queue an extra render
  // on every run. The initial state is already `loading`, so mount is covered.
  const retry = useCallback(() => {
    setState(LOADING)
    setAttempt((n) => n + 1)
  }, [])

  const value = useMemo<AuthSession>(() => ({ ...state, retry }), [state, retry])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider
