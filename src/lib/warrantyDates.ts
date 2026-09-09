import type { IsoDate } from '../types/product'

/*
 * Date-only arithmetic and formatting.
 *
 * Postgres `date` columns arrive as plain `YYYY-MM-DD` strings with no time and
 * no zone. The trap is `new Date('2026-09-08')`, which the spec says to parse
 * as UTC midnight: west of Greenwich that renders as Sep 7, so a warranty
 * silently expires a day early for anyone in the Americas. Everything here
 * therefore parses and builds dates in *local* time, and formats from the parts
 * rather than round-tripping through a timestamp.
 *
 * No date library. These few functions are the whole requirement, and pulling
 * in a dependency to do them would be a worse trade.
 */

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Days in a given month, where `month` is 1-12. */
function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one, and the Date
  // constructor handles the leap-year rules for us.
  return new Date(year, month, 0).getDate()
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** `true` if `value` is a well-formed, real calendar date. */
export function isValidIsoDate(value: string | null | undefined): value is IsoDate {
  if (!value || !ISO_DATE_PATTERN.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  if (month < 1 || month > 12) return false

  return day >= 1 && day <= daysInMonth(year, month)
}

/**
 * Parses `YYYY-MM-DD` to a `Date` at **local** midnight, or `null` if the
 * string is not a real date. Use this instead of `new Date(value)`.
 */
export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!isValidIsoDate(value)) return null

  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Formats a local `Date` back to `YYYY-MM-DD`. */
export function toIsoDate(date: Date): IsoDate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Today in the viewer's own timezone, as `YYYY-MM-DD`. */
export function todayIsoDate(): IsoDate {
  return toIsoDate(new Date())
}

/**
 * Whole days from `from` to `to`, both date-only.
 *
 * Rounds rather than truncates: local midnights are 23 or 25 hours apart across
 * a daylight-saving boundary, and flooring that would drop or add a day.
 */
export function daysBetween(from: IsoDate, to: IsoDate): number | null {
  const start = parseIsoDate(from)
  const end = parseIsoDate(to)
  if (!start || !end) return null

  const millisecondsPerDay = 24 * 60 * 60 * 1000
  return Math.round((end.getTime() - start.getTime()) / millisecondsPerDay)
}

/** Adds (or subtracts) whole days. */
export function addDays(value: IsoDate, days: number): IsoDate | null {
  const date = parseIsoDate(value)
  if (!date) return null

  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

/**
 * Adds whole months, clamping to the end of the target month.
 *
 * The clamp is the leap-year case: 12 months from 2028-02-29 is 2029-02-28,
 * not 2029-03-01. Plain `setMonth` overflows into March and would quietly
 * extend the warranty past the date the manufacturer actually gave.
 */
export function addMonths(value: IsoDate, months: number): IsoDate | null {
  const date = parseIsoDate(value)
  if (!date) return null

  const year = date.getFullYear()
  const monthIndex = date.getMonth() + months

  const targetYear = year + Math.floor(monthIndex / 12)
  // Month index can go negative; `%` alone would keep the sign.
  const targetMonth = ((monthIndex % 12) + 12) % 12

  const day = Math.min(date.getDate(), daysInMonth(targetYear, targetMonth + 1))

  return toIsoDate(new Date(targetYear, targetMonth, day))
}

/** `Sep 8, 2026`. Returns an em dash for a missing or malformed date. */
export function formatIsoDate(value: string | null | undefined): string {
  const date = parseIsoDate(value)
  if (!date) return '—'

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
