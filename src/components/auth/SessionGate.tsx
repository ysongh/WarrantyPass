import type { ReactNode } from 'react'

import { useAuthSession } from '../../hooks/useAuthSession'
import Button from '../ui/Button'

/*
 * Wraps anything that reads or writes product data.
 *
 * If the anonymous session is missing, the page must not render as though the
 * account were simply empty — that would invite someone to re-enter a product
 * they have already saved. Each failure mode says what actually happened.
 */

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-surface p-6 sm:p-8">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-2 text-ink-muted text-pretty">{children}</div>
    </div>
  )
}

function SessionGate({ children }: { children: ReactNode }) {
  const { status, retry } = useAuthSession()

  if (status === 'loading') {
    return (
      <div
        role="status"
        className="rounded-card border border-line bg-surface p-6 sm:p-8"
      >
        <div className="h-5 w-40 animate-pulse rounded bg-line" />
        <span className="sr-only">Preparing your account…</span>
      </div>
    )
  }

  if (status === 'unconfigured') {
    return (
      <Panel title="Not connected to a database">
        <p>
          WarrantyPass needs Supabase credentials to store your products. Set
          <code className="mx-1 text-ink">VITE_SUPABASE_URL</code> and
          <code className="mx-1 text-ink">VITE_SUPABASE_ANON_KEY</code> in your
          environment, then restart the dev server.
        </p>
      </Panel>
    )
  }

  if (status === 'error') {
    return (
      <Panel title="We couldn't start your session">
        <p>
          Your products are safe, but we can't reach them right now. Check your
          connection and try again.
        </p>
        <Button variant="secondary" className="mt-4" onClick={retry}>
          Try again
        </Button>
      </Panel>
    )
  }

  return <>{children}</>
}

export default SessionGate
