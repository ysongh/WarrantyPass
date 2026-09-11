import { keccak256, toHex } from 'viem'
import type { Hex } from 'viem'

/*
 * The onchain identifier for a product.
 *
 * The registry keys records by `bytes32`, and this is the one place that value
 * is derived. Every caller — reads, writes, reconciliation — must go through
 * `getProductKey`, because a key computed two different ways is two different
 * products as far as the chain is concerned, and the mistake is invisible until
 * a proof cannot be found.
 *
 * What it is derived from
 * -----------------------
 * `public_id`, and nothing else. Never a serial number, model, brand, wallet
 * address, email, user id or receipt content.
 *
 * That restriction is the entire privacy argument for putting anything onchain
 * at all. Chain data is public and permanent, so the key has to be opaque:
 * `public_id` is random (`wp_` + 32 hex from `gen_random_uuid()`), carries no
 * information about the product, and cannot be reversed into one. A key derived
 * from a serial number, by contrast, would let anyone holding that serial
 * number confirm the product is registered — and, because registration is
 * write-once and permanent, would let them squat the key first.
 *
 * The database UUID is deliberately not used either. It is the internal primary
 * key, it appears in application URLs, and `public_id` already exists precisely
 * to be the identifier that is safe to expose.
 */

/**
 * `wp_` followed by 32 lowercase hex characters. Mirrors the
 * `products_public_id_format` check constraint; a value that fails this did not
 * come from `create_product_with_warranty`.
 */
const PUBLIC_ID_PATTERN = /^wp_[0-9a-f]{32}$/

/** `true` if `value` is a well-formed product `public_id`. */
export function isPublicId(value: string): boolean {
  return PUBLIC_ID_PATTERN.test(value)
}

/**
 * The `bytes32` registry key for a product, as `keccak256(utf8 public_id)`.
 *
 * Hashes the UTF-8 bytes of the identifier itself — not a JSON wrapper, not a
 * concatenation with a salt or a chain id, and not the bytes the string happens
 * to decode to. The plainest possible definition is the point: anyone auditing
 * a record must be able to reproduce the key from a `public_id` without knowing
 * anything else about this application.
 *
 * Throws on a malformed id rather than hashing it anyway. A typo would
 * otherwise produce a perfectly valid-looking key pointing at a record that can
 * never be reconciled, and — since registration is permanent — the mistake
 * could not be undone.
 *
 * @param publicId An opaque product id, `wp_<32 hex>`.
 * @returns `0x` + 64 lowercase hex characters, ready to pass as `bytes32`.
 */
export function getProductKey(publicId: string): Hex {
  if (!isPublicId(publicId)) {
    throw new Error('A product key can only be derived from a valid public_id.')
  }

  // `toHex` encodes the string as UTF-8 bytes; `keccak256` returns lowercase
  // `0x` hex. viem does both — hashing is never hand-rolled here.
  return keccak256(toHex(publicId))
}
