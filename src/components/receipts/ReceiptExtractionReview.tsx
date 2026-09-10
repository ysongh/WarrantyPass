import type { ReactNode } from 'react'

import { describeCandidate } from '../../lib/receiptExtraction'
import { formatPrice } from '../../lib/money'
import { formatIsoDate } from '../../lib/warrantyDates'
import {
  LOW_CONFIDENCE_THRESHOLD,
  type ReceiptExtraction,
} from '../../types/receipt'
import Button from '../ui/Button'

/*
 * What the receipt appeared to say, for the user to accept or correct.
 *
 * Nothing here is saved. This step exists precisely so that a machine reading
 * of a photograph is never the last word on what goes into someone's records —
 * the user reads it, picks the product they meant, and edits anything wrong in
 * the form that follows.
 */

const VERIFY = 'Please verify'

function Detail({
  label,
  value,
  unsure,
}: {
  label: string
  value: ReactNode
  unsure?: boolean
}) {
  return (
    <div>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-ink text-pretty">
        {value ?? <span className="text-ink-muted">Not found</span>}
        {unsure && (
          <span className="ml-2 text-sm font-medium text-warning-700">{VERIFY}</span>
        )}
      </dd>
    </div>
  )
}

type Props = {
  extraction: ReceiptExtraction
  selectedIndex: number
  onSelect: (index: number) => void
  onContinue: () => void
  onRescan: () => void
  isRescanning: boolean
}

function ReceiptExtractionReview({
  extraction,
  selectedIndex,
  onSelect,
  onContinue,
  onRescan,
  isRescanning,
}: Props) {
  const candidates = extraction.products
  const candidate = candidates[selectedIndex] ?? candidates[0]

  if (!candidate) return null

  const unsure = (score: number) => score <= LOW_CONFIDENCE_THRESHOLD
  const currency = extraction.currency ?? 'USD'

  return (
    <div className="space-y-6">
      {/*
       * Several plausible items means the receipt had several. Asking is the
       * only honest option: silently taking the first line item would attach a
       * warranty to whatever happened to be printed highest.
       */}
      {candidates.length > 1 && (
        <fieldset className="rounded-card border border-line bg-surface p-6 sm:p-8">
          <legend className="text-lg font-semibold text-ink">
            Which product would you like to add?
          </legend>
          <p className="mt-2 text-ink-muted text-pretty">
            This receipt lists more than one thing that might be worth covering.
          </p>

          <div className="mt-5 grid gap-3">
            {candidates.map((option, index) => (
              <div key={`${describeCandidate(option)}-${index}`}>
                <input
                  type="radio"
                  id={`candidate-${index}`}
                  name="candidate"
                  className="peer sr-only"
                  checked={index === selectedIndex}
                  onChange={() => onSelect(index)}
                />
                <label
                  htmlFor={`candidate-${index}`}
                  className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-card border border-line bg-surface p-4 transition-colors hover:bg-canvas peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600"
                >
                  <span className="font-medium text-ink">
                    {describeCandidate(option)}
                  </span>
                  <span className="text-sm text-ink-muted">
                    {formatPrice(option.price, currency) ?? 'No price found'}
                  </span>
                </label>
              </div>
            ))}
          </div>
        </fieldset>
      )}

      <section className="rounded-card border border-line bg-surface p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-ink">We found these details</h2>
        <p className="mt-2 text-ink-muted text-pretty">
          Check these details before continuing. Receipt scanning can make
          mistakes, and you can edit everything on the next step.
        </p>

        <dl className="mt-6 grid gap-5 sm:grid-cols-2">
          <Detail
            label="Brand"
            value={candidate.brand}
            unsure={Boolean(candidate.brand) && unsure(candidate.confidence.brand)}
          />
          <Detail
            label="Model"
            value={candidate.model}
            unsure={Boolean(candidate.model) && unsure(candidate.confidence.model)}
          />
          <Detail
            label="Retailer"
            value={extraction.retailer}
            unsure={
              Boolean(extraction.retailer) && unsure(extraction.confidence.retailer)
            }
          />
          <Detail
            label="Purchased"
            value={
              extraction.purchaseDate ? formatIsoDate(extraction.purchaseDate) : null
            }
            unsure={
              Boolean(extraction.purchaseDate) &&
              unsure(extraction.confidence.purchaseDate)
            }
          />
          <Detail
            label="Price"
            value={formatPrice(candidate.price, currency)}
            unsure={candidate.price !== null && unsure(candidate.confidence.price)}
          />
          <Detail
            label="Serial number"
            value={candidate.serialNumber}
            unsure={
              Boolean(candidate.serialNumber) &&
              unsure(candidate.confidence.serialNumber)
            }
          />
        </dl>

        <p className="mt-6 text-sm text-ink-muted text-pretty">
          Warranty details aren't read from receipts — you'll enter coverage
          dates and transferability yourself on the next step.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onContinue}>Continue</Button>
        <Button variant="secondary" disabled={isRescanning} onClick={onRescan}>
          {isRescanning ? 'Reading again…' : 'Re-scan receipt'}
        </Button>
      </div>
    </div>
  )
}

export default ReceiptExtractionReview
