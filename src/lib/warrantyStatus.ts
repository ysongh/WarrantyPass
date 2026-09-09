import type { IsoDate, WarrantyStatus } from '../types/product'
import { daysBetween, todayIsoDate } from './warrantyDates'

/*
 * Warranty status is derived, never stored.
 *
 * A status column would be correct only until the next midnight, and would then
 * need a scheduled job to stay honest. Computing it from `end_date` on read
 * means it is right by construction.
 */

/** A warranty with this many days left or fewer reads as "expiring". */
export const EXPIRING_SOON_DAYS = 30

/**
 * Days from today until coverage ends, in the viewer's timezone. Negative once
 * the warranty has expired; `null` if the date is missing or malformed.
 *
 * The end date is inclusive — coverage runs through the end of that day — so a
 * warranty ending today returns 0 and still counts as covered.
 */
export function getDaysRemaining(
  endDate: IsoDate | null | undefined,
  today: IsoDate = todayIsoDate(),
): number | null {
  if (!endDate) return null

  return daysBetween(today, endDate)
}

/**
 * `expired` past the end date, `expiring` within the last
 * {@link EXPIRING_SOON_DAYS} days of cover, `active` otherwise. `null` when
 * there is no usable end date, so callers can tell "no warranty on record"
 * apart from "warranty has run out".
 */
export function getWarrantyStatus(
  endDate: IsoDate | null | undefined,
  today: IsoDate = todayIsoDate(),
): WarrantyStatus | null {
  const daysRemaining = getDaysRemaining(endDate, today)
  if (daysRemaining === null) return null

  if (daysRemaining < 0) return 'expired'
  if (daysRemaining <= EXPIRING_SOON_DAYS) return 'expiring'

  return 'active'
}

export const WARRANTY_STATUS_LABELS: Record<WarrantyStatus, string> = {
  active: 'Warranty active',
  expiring: 'Expiring soon',
  expired: 'Warranty expired',
}

/**
 * Human phrasing for the time left, e.g. `342 days remaining`, `Expires today`,
 * `Expired 12 days ago`.
 */
export function formatDaysRemaining(
  endDate: IsoDate | null | undefined,
  today: IsoDate = todayIsoDate(),
): string | null {
  const daysRemaining = getDaysRemaining(endDate, today)
  if (daysRemaining === null) return null

  if (daysRemaining === 0) return 'Expires today'

  if (daysRemaining < 0) {
    const elapsed = Math.abs(daysRemaining)
    return elapsed === 1 ? 'Expired 1 day ago' : `Expired ${elapsed} days ago`
  }

  return daysRemaining === 1 ? '1 day remaining' : `${daysRemaining} days remaining`
}
