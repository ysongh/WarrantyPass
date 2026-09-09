import type { WarrantyStatus } from '../../types/product'
import { WARRANTY_STATUS_LABELS } from '../../lib/warrantyStatus'

/*
 * Status is always spelled out in words. Colour reinforces it; it never carries
 * the meaning on its own, so the badge still works in monochrome or for anyone
 * who cannot distinguish the three tints.
 */
const statusStyles: Record<WarrantyStatus, string> = {
  active: 'border-success-200 bg-success-50 text-success-700',
  expiring: 'border-warning-200 bg-warning-50 text-warning-700',
  expired: 'border-danger-200 bg-danger-50 text-danger-700',
}

const UNKNOWN_STYLE = 'border-line bg-canvas text-ink-muted'

type Props = {
  status: WarrantyStatus | null
  className?: string
}

/** `Warranty active` / `Expiring soon` / `Warranty expired`. */
function WarrantyStatusBadge({ status, className = '' }: Props) {
  const style = status ? statusStyles[status] : UNKNOWN_STYLE
  const label = status ? WARRANTY_STATUS_LABELS[status] : 'No warranty on record'

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${style} ${className}`}
    >
      {label}
    </span>
  )
}

export default WarrantyStatusBadge
