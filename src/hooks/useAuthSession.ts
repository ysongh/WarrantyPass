import { useContext } from 'react'

import { AuthContext, type AuthSession } from '../context/authContext'

/**
 * The current Supabase session state. Read `userId` for the owner of the
 * current person's data; check `status` before assuming it exists.
 */
export function useAuthSession(): AuthSession {
  const session = useContext(AuthContext)

  if (!session) {
    throw new Error('useAuthSession must be used inside <AuthProvider>.')
  }

  return session
}
