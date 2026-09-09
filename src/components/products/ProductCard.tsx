import { Link } from 'react-router'

import { formatIsoDate } from '../../lib/warrantyDates'
import { formatDaysRemaining, getWarrantyStatus } from '../../lib/warrantyStatus'
import { TRANSFERABILITY_LABELS, type ProductWithWarranty } from '../../types/product'
import WarrantyStatusBadge from './WarrantyStatusBadge'

/*
 * Dashboard card. Shows brand, model, warranty status, purchase details and
 * transferability.
 *
 * The serial number is deliberately absent — it is the one field that is
 * useful to someone who should not have it, and a dashboard is the easiest
 * screen to shoulder-surf. It lives on the detail page, masked.
 */
function ProductCard({ product }: { product: ProductWithWarranty }) {
  const endDate = product.warranty?.endDate
  const status = getWarrantyStatus(endDate)
  const daysRemaining = formatDaysRemaining(endDate)

  return (
    <li>
      <Link
        to={`/products/${product.id}`}
        className="flex h-full flex-col rounded-card border border-line bg-surface p-6 transition-colors hover:border-brand-200 hover:bg-brand-50/40"
      >
        <h3 className="text-lg font-semibold text-ink text-pretty">
          {product.brand} {product.model}
        </h3>

        <div className="mt-4">
          <WarrantyStatusBadge status={status} />
          {daysRemaining && (
            <p className="mt-2 text-sm text-ink-muted">{daysRemaining}</p>
          )}
        </div>

        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-ink-muted">Purchased</dt>
            <dd className="text-ink">{formatIsoDate(product.purchaseDate)}</dd>
          </div>
          {product.retailer && (
            <div className="flex gap-2">
              <dt className="text-ink-muted">From</dt>
              <dd className="text-ink">{product.retailer}</dd>
            </div>
          )}
        </dl>

        {product.warranty && (
          <p className="mt-4 border-t border-line pt-4 text-sm text-ink-muted">
            {TRANSFERABILITY_LABELS[product.warranty.transferability]}
          </p>
        )}
      </Link>
    </li>
  )
}

export default ProductCard
