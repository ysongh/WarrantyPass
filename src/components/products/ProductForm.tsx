// React 19 deprecates `FormEvent` in favour of the specific event types.
import { useState, type SubmitEvent } from 'react'

import { addDays, addMonths, isValidIsoDate, todayIsoDate } from '../../lib/warrantyDates'
import type { CreateProductInput, WarrantyTransferability } from '../../types/product'
import Button from '../ui/Button'
import { SelectField, TextField } from '../ui/FormField'

/*
 * Manual product entry.
 *
 * Everything is typed by hand in phase 2 — receipt upload and parsing come
 * later. The form is deliberately forgiving: it validates on submit rather than
 * on every keystroke, keeps whatever the user typed when the save fails, and
 * never guesses a value the user has not confirmed.
 */

type DurationPreset = '90d' | '1y' | '2y' | '3y' | 'custom'

/**
 * Coverage lengths are stored as concrete `start_date` / `end_date`, never as
 * "1 year". A stored duration would have to be re-evaluated on every read and
 * would drift from whatever the manufacturer actually wrote down.
 */
const DURATION_PRESETS: readonly {
  value: DurationPreset
  label: string
  endDateFrom: ((start: string) => string | null) | null
}[] = [
  { value: '90d', label: '90 days', endDateFrom: (start) => addDays(start, 90) },
  { value: '1y', label: '1 year', endDateFrom: (start) => addMonths(start, 12) },
  { value: '2y', label: '2 years', endDateFrom: (start) => addMonths(start, 24) },
  { value: '3y', label: '3 years', endDateFrom: (start) => addMonths(start, 36) },
  { value: 'custom', label: 'Custom', endDateFrom: null },
]

const TRANSFERABILITY_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'transferable', label: 'Transferable' },
  { value: 'non_transferable', label: 'Non-transferable' },
  { value: 'unknown', label: "Unknown — I'm not sure" },
]

type Values = {
  brand: string
  model: string
  retailer: string
  purchaseDate: string
  purchasePrice: string
  serialNumber: string
  warrantyIssuer: string
  warrantyStartDate: string
  warrantyEndDate: string
  transferability: WarrantyTransferability
}

type FieldName = keyof Values

/**
 * Every field except `transferability`, which is a constrained union rather
 * than free text and so gets its own setter.
 */
type TextFieldName = Exclude<FieldName, 'transferability'>

type Errors = Partial<Record<FieldName, string>>

/** Submit focuses the first invalid control, in the order they appear. */
const FIELD_ORDER: readonly FieldName[] = [
  'brand',
  'model',
  'purchaseDate',
  'purchasePrice',
  'warrantyStartDate',
  'warrantyEndDate',
]

function initialValues(): Values {
  const today = todayIsoDate()

  return {
    brand: '',
    model: '',
    retailer: '',
    purchaseDate: today,
    purchasePrice: '',
    serialNumber: '',
    warrantyIssuer: '',
    // Defaults to the purchase date, and follows it until the user edits it.
    warrantyStartDate: today,
    warrantyEndDate: addMonths(today, 12) ?? '',
    transferability: 'unknown',
  }
}

function validate(values: Values): Errors {
  const errors: Errors = {}

  if (!values.brand.trim()) errors.brand = 'Enter the brand.'
  if (!values.model.trim()) errors.model = 'Enter the model.'

  if (!isValidIsoDate(values.purchaseDate)) {
    errors.purchaseDate = 'Enter the purchase date.'
  }

  if (values.purchasePrice.trim()) {
    const price = Number(values.purchasePrice)

    if (!Number.isFinite(price)) {
      errors.purchasePrice = 'Enter a number, for example 449.99.'
    } else if (price < 0) {
      errors.purchasePrice = 'Price cannot be negative.'
    }
  }

  if (!isValidIsoDate(values.warrantyStartDate)) {
    errors.warrantyStartDate = 'Enter the date coverage started.'
  }

  if (!isValidIsoDate(values.warrantyEndDate)) {
    errors.warrantyEndDate = 'Enter the date coverage ends.'
  } else if (
    isValidIsoDate(values.warrantyStartDate) &&
    values.warrantyEndDate < values.warrantyStartDate
  ) {
    // Both are zero-padded YYYY-MM-DD, so a string compare is a date compare.
    errors.warrantyEndDate = 'Coverage cannot end before it starts.'
  }

  return errors
}

function toInput(values: Values): CreateProductInput {
  const price = values.purchasePrice.trim()

  return {
    brand: values.brand.trim(),
    model: values.model.trim(),
    retailer: values.retailer.trim() || null,
    purchaseDate: values.purchaseDate,
    purchasePrice: price ? Number(price) : null,
    serialNumber: values.serialNumber.trim() || null,
    currency: 'USD',
    warrantyIssuer: values.warrantyIssuer.trim() || null,
    warrantyStartDate: values.warrantyStartDate,
    warrantyEndDate: values.warrantyEndDate,
    transferability: values.transferability,
  }
}

type Props = {
  onSubmit: (input: CreateProductInput) => void
  isSubmitting: boolean
  submitError?: string | null
}

function ProductForm({ onSubmit, isSubmitting, submitError }: Props) {
  const [values, setValues] = useState<Values>(initialValues)
  const [errors, setErrors] = useState<Errors>({})
  const [preset, setPreset] = useState<DurationPreset>('1y')
  // Once the user edits the start date themselves, it stops tracking the
  // purchase date — changing the purchase date should not silently overwrite a
  // coverage date they deliberately set.
  const [startDateEdited, setStartDateEdited] = useState(false)

  function update(field: TextFieldName, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  function setTransferability(value: string) {
    // The options are ours, so anything else means the markup drifted; fall
    // back to `unknown` rather than writing a value the check constraint
    // would reject.
    const next: WarrantyTransferability = TRANSFERABILITY_OPTIONS.some(
      (option) => option.value === value,
    )
      ? (value as WarrantyTransferability)
      : 'unknown'

    setValues((previous) => ({ ...previous, transferability: next }))
  }

  function applyPreset(next: DurationPreset, startDate: string) {
    setPreset(next)

    const endDateFrom = DURATION_PRESETS.find((p) => p.value === next)?.endDateFrom
    if (!endDateFrom || !isValidIsoDate(startDate)) return

    const endDate = endDateFrom(startDate)
    if (endDate) update('warrantyEndDate', endDate)
  }

  function handlePurchaseDateChange(value: string) {
    update('purchaseDate', value)

    if (startDateEdited) return

    update('warrantyStartDate', value)
    applyPreset(preset, value)
  }

  function handleStartDateChange(value: string) {
    setStartDateEdited(true)
    update('warrantyStartDate', value)
    applyPreset(preset, value)
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()

    // Guards against a double submit slipping past the disabled button — a
    // second Enter press before React has re-rendered, for instance.
    if (isSubmitting) return

    const nextErrors = validate(values)
    setErrors(nextErrors)

    const firstInvalid = FIELD_ORDER.find((field) => nextErrors[field])

    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus()
      return
    }

    onSubmit(toInput(values))
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-8">
      <section
        aria-labelledby="product-information"
        className="rounded-card border border-line bg-surface p-6 sm:p-8"
      >
        <h2 id="product-information" className="text-lg font-semibold text-ink">
          Product information
        </h2>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <TextField
            id="brand"
            required
            label="Brand"
            autoComplete="off"
            placeholder="Sony"
            value={values.brand}
            error={errors.brand}
            onChange={(event) => update('brand', event.target.value)}
          />

          <TextField
            id="model"
            required
            label="Model"
            autoComplete="off"
            placeholder="WH-1000XM6"
            value={values.model}
            error={errors.model}
            onChange={(event) => update('model', event.target.value)}
          />

          <TextField
            id="purchaseDate"
            required
            label="Purchase date"
            type="date"
            value={values.purchaseDate}
            error={errors.purchaseDate}
            onChange={(event) => handlePurchaseDateChange(event.target.value)}
          />

          <TextField
            id="retailer"
            label="Retailer"
            optional
            autoComplete="off"
            placeholder="Best Buy"
            value={values.retailer}
            error={errors.retailer}
            onChange={(event) => update('retailer', event.target.value)}
          />

          <TextField
            id="purchasePrice"
            label="Purchase price"
            optional
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="449.99"
            hint="USD"
            value={values.purchasePrice}
            error={errors.purchasePrice}
            onChange={(event) => update('purchasePrice', event.target.value)}
          />

          <TextField
            id="serialNumber"
            label="Serial number"
            optional
            autoComplete="off"
            placeholder="TEST-SERIAL-001"
            hint="Kept private to you and hidden by default."
            value={values.serialNumber}
            error={errors.serialNumber}
            onChange={(event) => update('serialNumber', event.target.value)}
          />
        </div>
      </section>

      <section
        aria-labelledby="warranty-information"
        className="rounded-card border border-line bg-surface p-6 sm:p-8"
      >
        <h2 id="warranty-information" className="text-lg font-semibold text-ink">
          Warranty information
        </h2>

        <div className="mt-6 space-y-5">
          <fieldset>
            <legend className="text-sm font-medium text-ink">Coverage length</legend>
            <p className="mt-1.5 text-sm text-ink-muted">
              Sets the end date for you. You can always adjust it below.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {DURATION_PRESETS.map((option) => (
                <div key={option.value}>
                  <input
                    type="radio"
                    id={`duration-${option.value}`}
                    name="duration"
                    className="peer sr-only"
                    checked={preset === option.value}
                    onChange={() => applyPreset(option.value, values.warrantyStartDate)}
                  />
                  <label
                    htmlFor={`duration-${option.value}`}
                    className="inline-block cursor-pointer rounded-card border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-canvas peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600"
                  >
                    {option.label}
                  </label>
                </div>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              id="warrantyStartDate"
            required
              label="Coverage starts"
              type="date"
              hint="Defaults to the purchase date."
              value={values.warrantyStartDate}
              error={errors.warrantyStartDate}
              onChange={(event) => handleStartDateChange(event.target.value)}
            />

            <TextField
              id="warrantyEndDate"
            required
              label="Coverage ends"
              type="date"
              value={values.warrantyEndDate}
              error={errors.warrantyEndDate}
              onChange={(event) => {
                // A hand-picked end date is by definition not a preset length.
                setPreset('custom')
                update('warrantyEndDate', event.target.value)
              }}
            />

            <TextField
              id="warrantyIssuer"
              label="Warranty issuer"
              optional
              autoComplete="off"
              placeholder="Sony"
              hint="Who honours the warranty — often the brand or the retailer."
              value={values.warrantyIssuer}
              error={errors.warrantyIssuer}
              onChange={(event) => update('warrantyIssuer', event.target.value)}
            />

            <SelectField
              id="transferability"
              label="Transferability"
              options={TRANSFERABILITY_OPTIONS}
              hint="Pick Unknown if you're not sure — it won't be guessed for you."
              value={values.transferability}
              error={errors.transferability}
              onChange={(event) => setTransferability(event.target.value)}
            />
          </div>
        </div>
      </section>

      {submitError && (
        <div
          role="alert"
          className="rounded-card border border-danger-200 bg-danger-50 p-4 text-sm font-medium text-danger-700"
        >
          {submitError}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create WarrantyPass'}
        </Button>
        <p className="text-sm text-ink-muted">Only you can see this product.</p>
      </div>
    </form>
  )
}

export default ProductForm
