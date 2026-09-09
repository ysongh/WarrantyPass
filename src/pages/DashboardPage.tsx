import { useMemo, useState } from 'react'

import SessionGate from '../components/auth/SessionGate'
import ProductCard from '../components/products/ProductCard'
import Button from '../components/ui/Button'
import ButtonLink from '../components/ui/ButtonLink'
import { useProducts } from '../hooks/useProducts'
import { getWarrantyStatus } from '../lib/warrantyStatus'
import type { ProductWithWarranty, WarrantyStatus } from '../types/product'

type Filter = 'all' | WarrantyStatus

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'expiring', label: 'Expiring' },
  { value: 'expired', label: 'Expired' },
]

const EMPTY_FILTER_COPY: Record<WarrantyStatus, string> = {
  active: 'No products have active cover right now.',
  expiring: 'Nothing is expiring in the next 30 days.',
  expired: 'No warranties have expired yet.',
}

/*
 * Filtering is client-side. The list is one person's own products, so it is
 * small, already in the cache, and re-querying per tab would be slower than
 * filtering in place. Revisit if a real user ever has hundreds of these.
 */
function ProductGrid({ products }: { products: ProductWithWarranty[] }) {
  return (
    <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </ul>
  )
}

function LoadingGrid() {
  return (
    <div role="status" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((key) => (
        <div
          key={key}
          className="rounded-card border border-line bg-surface p-6"
          aria-hidden="true"
        >
          <div className="h-6 w-3/4 animate-pulse rounded bg-line" />
          <div className="mt-4 h-7 w-32 animate-pulse rounded-full bg-line" />
          <div className="mt-4 h-4 w-2/3 animate-pulse rounded bg-line" />
          <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-line" />
        </div>
      ))}
      <span className="sr-only">Loading your products…</span>
    </div>
  )
}

function DashboardContent() {
  const [filter, setFilter] = useState<Filter>('all')
  const { data: products, isPending, isError, refetch, isFetching } = useProducts()

  // Status is derived once per render pass and reused for both the counts and
  // the filter, so a card and its tab can never disagree.
  const withStatus = useMemo(
    () =>
      (products ?? []).map((product) => ({
        product,
        status: getWarrantyStatus(product.warranty?.endDate),
      })),
    [products],
  )

  const counts = useMemo(() => {
    const totals: Record<Filter, number> = {
      all: withStatus.length,
      active: 0,
      expiring: 0,
      expired: 0,
    }

    for (const { status } of withStatus) {
      if (status) totals[status] += 1
    }

    return totals
  }, [withStatus])

  const visible = useMemo(
    () =>
      withStatus
        .filter((entry) => filter === 'all' || entry.status === filter)
        .map((entry) => entry.product),
    [withStatus, filter],
  )

  if (isPending) return <LoadingGrid />

  // An error must never look like an empty account, or the user will assume
  // their products are gone and add them again.
  if (isError) {
    return (
      <div className="mt-8 rounded-card border border-line bg-surface p-8 text-center sm:p-12">
        <p className="font-medium text-ink">We couldn't load your products.</p>
        <p className="mt-2 text-ink-muted text-pretty">
          They're still saved. This was a problem reaching them.
        </p>
        <Button
          variant="secondary"
          className="mt-6"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          {isFetching ? 'Retrying…' : 'Try again'}
        </Button>
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="mt-8 rounded-card border border-line bg-surface p-8 text-center sm:p-12">
        <p className="font-medium text-ink">You haven't added any products yet.</p>
        <p className="mt-2 text-ink-muted text-pretty">
          Keep receipts and warranties organized in one place.
        </p>
        <ButtonLink to="/products/new" className="mt-6">
          Add your first product
        </ButtonLink>
      </div>
    )
  }

  return (
    <>
      <div className="mt-8 flex flex-wrap gap-2" role="group" aria-label="Filter by warranty status">
        {FILTERS.map((option) => {
          const isSelected = filter === option.value

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setFilter(option.value)}
              className={`rounded-card border px-4 py-2 text-sm font-medium transition-colors ${
                isSelected
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-line bg-surface text-ink-muted hover:bg-canvas hover:text-ink'
              }`}
            >
              {option.label}
              <span className={isSelected ? 'ml-1.5' : 'ml-1.5 text-ink-muted'}>
                {counts[option.value]}
              </span>
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <p className="mt-8 rounded-card border border-line bg-surface p-8 text-center text-ink-muted">
          {filter === 'all' ? 'Nothing to show.' : EMPTY_FILTER_COPY[filter]}
        </p>
      ) : (
        <ProductGrid products={visible} />
      )}
    </>
  )
}

function DashboardPage() {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          My WarrantyPasses
        </h1>
        <ButtonLink to="/products/new">Add product</ButtonLink>
      </div>

      <SessionGate>
        <DashboardContent />
      </SessionGate>
    </>
  )
}

export default DashboardPage
