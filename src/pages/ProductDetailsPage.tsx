import { useState, type ReactNode } from 'react'
import { useParams } from 'react-router'

import SessionGate from '../components/auth/SessionGate'
import WarrantyStatusBadge from '../components/products/WarrantyStatusBadge'
import Button from '../components/ui/Button'
import ButtonLink from '../components/ui/ButtonLink'
import { useProduct } from '../hooks/useProducts'
import { formatIsoDate } from '../lib/warrantyDates'
import { formatDaysRemaining, getWarrantyStatus } from '../lib/warrantyStatus'
import {
  TRANSFERABILITY_LABELS,
  type ProductWithWarranty,
} from '../types/product'

/**
 * Shows the last four characters behind a fixed-width mask. The dot count is
 * constant rather than matching the real length, so a shoulder-surfer learns
 * nothing about the serial's format either.
 */
function maskSerial(serial: string): string {
  return serial.length > 4 ? `••••••••${serial.slice(-4)}` : '••••••••'
}

function formatPrice(amount: number | null, currency: string): string | null {
  if (amount === null) return null

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(amount)
  } catch {
    // An unexpected currency code should not take the page down with it.
    return `${amount.toFixed(2)} ${currency}`
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-6 sm:p-8">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <dl className="mt-6 grid gap-5 sm:grid-cols-2">{children}</dl>
    </section>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-ink text-pretty">{children}</dd>
    </div>
  )
}

function SerialNumber({ serial }: { serial: string }) {
  const [revealed, setRevealed] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-mono text-ink">
        {revealed ? serial : maskSerial(serial)}
      </span>
      <button
        type="button"
        onClick={() => setRevealed((previous) => !previous)}
        className="rounded-card px-2 py-1 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50"
      >
        {revealed ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}

function ProductDetails({ product }: { product: ProductWithWarranty }) {
  const { warranty } = product
  const status = getWarrantyStatus(warranty?.endDate)
  const daysRemaining = formatDaysRemaining(warranty?.endDate)
  const price = formatPrice(product.purchasePrice, product.currency)

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-pretty sm:text-3xl">
        {product.brand} {product.model}
      </h1>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <WarrantyStatusBadge status={status} />
        {daysRemaining && <span className="text-ink-muted">{daysRemaining}</span>}
      </div>

      <div className="mt-8 space-y-6">
        <Section title="Product">
          <Detail label="Brand">{product.brand}</Detail>
          <Detail label="Model">{product.model}</Detail>
          <Detail label="Retailer">{product.retailer ?? '—'}</Detail>
          <Detail label="Purchased">{formatIsoDate(product.purchaseDate)}</Detail>
          <Detail label="Price">{price ?? '—'}</Detail>
        </Section>

        <Section title="Warranty">
          {warranty ? (
            <>
              <Detail label="Issuer">{warranty.issuer ?? '—'}</Detail>
              <Detail label="Transferability">
                {TRANSFERABILITY_LABELS[warranty.transferability]}
              </Detail>
              <Detail label="Coverage started">
                {formatIsoDate(warranty.startDate)}
              </Detail>
              <Detail label="Coverage ends">{formatIsoDate(warranty.endDate)}</Detail>
            </>
          ) : (
            <Detail label="Warranty">No warranty on record.</Detail>
          )}
        </Section>

        <Section title="Private">
          <Detail label="Serial number">
            {product.serialNumber ? (
              <SerialNumber serial={product.serialNumber} />
            ) : (
              '—'
            )}
          </Detail>
          <div className="sm:col-span-2">
            <p className="text-sm text-ink-muted text-pretty">
              Only you can see this section. It is never shown on a public page
              and is not part of what a buyer would be able to verify.
            </p>
          </div>
        </Section>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <ButtonLink to={`/products/${product.id}/transfer`} variant="secondary">
          Transfer product
        </ButtonLink>
        <ButtonLink to="/dashboard" variant="secondary">
          Back to dashboard
        </ButtonLink>
      </div>
    </>
  )
}

function DetailsContent() {
  const { id } = useParams<{ id: string }>()
  const { data: product, isPending, isError, refetch, isFetching } = useProduct(id)

  if (isPending) {
    return (
      <div role="status">
        <div className="h-9 w-2/3 animate-pulse rounded bg-line" />
        <div className="mt-4 h-8 w-40 animate-pulse rounded-full bg-line" />
        <div className="mt-8 h-48 animate-pulse rounded-card bg-line/60" />
        <span className="sr-only">Loading this WarrantyPass…</span>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-card border border-line bg-surface p-8 text-center sm:p-12">
        <p className="font-medium text-ink">We couldn't load this WarrantyPass.</p>
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

  // `null` covers both "no such product" and "not yours". Row-level security
  // returns nothing in either case, and the page says the same thing either
  // way — confirming that an id exists would itself be a leak.
  if (!product) {
    return (
      <div className="rounded-card border border-line bg-surface p-8 text-center sm:p-12">
        <p className="font-medium text-ink">WarrantyPass not found.</p>
        <p className="mt-2 text-ink-muted text-pretty">
          It may have been removed, or the link may belong to another account.
        </p>
        <ButtonLink to="/dashboard" variant="secondary" className="mt-6">
          Back to dashboard
        </ButtonLink>
      </div>
    )
  }

  return <ProductDetails product={product} />
}

function ProductDetailsPage() {
  return (
    <SessionGate>
      <DetailsContent />
    </SessionGate>
  )
}

export default ProductDetailsPage
