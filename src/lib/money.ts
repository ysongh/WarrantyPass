/**
 * Formats an amount in its own currency, falling back to the plain number and
 * code if the currency is one `Intl` does not know. An unexpected currency
 * code should not take a page down with it.
 *
 * Extracted from `ProductDetailsPage` when the receipt review became the
 * second caller.
 */
export function formatPrice(amount: number | null, currency: string): string | null {
  if (amount === null) return null

  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(
      amount,
    )
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}
