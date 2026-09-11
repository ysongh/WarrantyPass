import type { IsoDate } from '../types/product'
import { isValidIsoDate } from './warrantyDates'

/*
 * Converting between Postgres `date` values and the `uint64` timestamps the
 * registry stores.
 *
 * The convention, stated once so no caller has to guess:
 *
 *     YYYY-MM-DD  <->  Unix seconds at **UTC** midnight of that calendar day
 *
 * Why UTC, when `warrantyDates.ts` is deliberately all local time
 * --------------------------------------------------------------
 * The two modules answer different questions and must not be mixed.
 *
 * `warrantyDates.ts` is about *display and arithmetic for one viewer*: "how
 * many days do I have left?" is a question about the user's own calendar, so it
 * parses to local midnight. Feeding a `YYYY-MM-DD` to `new Date(string)` — which
 * is specified as UTC — is what makes a warranty expire a day early in the
 * Americas, which is the bug that module exists to prevent.
 *
 * This module is about *a value everyone in the world must agree on*. A record
 * is written once, permanently, and then read back by a different person, in a
 * different timezone, possibly years later. If the timestamp came from local
 * midnight, the same product registered in Tokyo and in Los Angeles would anchor
 * two different numbers for one purchase date, and the field-by-field comparison
 * that decides whether to show "Verified" would fail for anyone who moved.
 *
 * So: never route a chain conversion through `parseIsoDate`, and never hand a
 * chain timestamp to the local helpers. `Date.UTC` below builds the value from
 * the date's parts directly, so the host timezone cannot influence the result.
 *
 * The contract's reading of these values
 * --------------------------------------
 * `warrantyEnd` is the midnight that *starts* the final covered day, so
 * coverage runs through the end of that day and expiry is `warrantyEnd + 1 day`.
 * The registry's `isExpired` implements exactly that. Do not "fix" a comparison
 * by subtracting a day somewhere else.
 */

const SECONDS_PER_DAY = 86400n

/**
 * A date-only value as Unix seconds at UTC midnight, for a Solidity `uint64`.
 *
 * Returns a `bigint` because that is what viem requires for `uint64` arguments;
 * a `number` would be silently accepted in some positions and rejected in
 * others, and the type is the cheapest place to settle it.
 *
 * @throws if `value` is not a real calendar date. A malformed date must not
 * become a timestamp: registration is permanent, so a bad value cannot be
 * corrected afterwards.
 */
export function isoDateToChainTimestamp(value: IsoDate): bigint {
  if (!isValidIsoDate(value)) {
    throw new Error('A chain timestamp can only be derived from a valid YYYY-MM-DD date.')
  }

  const [year, month, day] = value.split('-').map(Number)

  // Date.UTC, not `new Date(...)`. The parts go in as UTC and come out as an
  // absolute instant, with no reference to the host's timezone at any step.
  return BigInt(Date.UTC(year, month - 1, day) / 1000)
}

/**
 * The inverse: a UTC-midnight timestamp back to `YYYY-MM-DD`.
 *
 * Used when reading a record back off the chain to compare it against what the
 * database holds. Formats with the UTC getters for the same reason the forward
 * direction uses `Date.UTC` — a local getter would shift the day for most of
 * the world.
 *
 * A timestamp that is not midnight-aligned is reported as the UTC day it falls
 * in. That is a faithful reading of an unexpected value, not a correction of
 * it; use `isMidnightAligned` if a caller needs to notice.
 */
export function chainTimestampToIsoDate(timestamp: bigint): IsoDate {
  const date = new Date(Number(timestamp * 1000n))

  const year = String(date.getUTCFullYear()).padStart(4, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

/**
 * `true` if the timestamp falls exactly on a UTC midnight.
 *
 * Everything this app writes is midnight-aligned by construction, so a value
 * that is not either came from somewhere else or was written by a different
 * client. Worth surfacing during reconciliation rather than rounding away.
 */
export function isMidnightAligned(timestamp: bigint): boolean {
  return timestamp % SECONDS_PER_DAY === 0n
}
