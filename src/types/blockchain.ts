import type { OnchainWarrantyRecord, RecordMismatch } from '../lib/contracts/warrantyPass'

/*
 * Domain types for phase 4 onchain proof.
 *
 * Hand-written, like the other type modules, and for the same reason.
 *
 * A note on vocabulary, because it is load-bearing rather than stylistic: the
 * wallet on a record is a **registrant**. It is whoever paid for the
 * transaction. It is not an issuer, not a manufacturer, not a verified retailer,
 * and not the product's owner. Nothing in phase 4 models ownership.
 */

/** Mirrors the `blockchain_records_status_allowed` check constraint. */
export type RegistrationStatus = 'pending' | 'confirmed' | 'failed'

/**
 * A registration row. `user_id` is deliberately not mapped: the client has no
 * use for it, and RLS — not the app — confines these rows to their owner.
 */
export type BlockchainRecord = {
  id: string
  productId: string
  chainId: number
  /** Lowercase. Comparable to `registryAddress` with `===`. */
  contractAddress: string
  productKey: string
  /** The keccak digest actually sent, snapshotted at submission. */
  receiptHash: string | null
  transactionHash: string
  blockNumber: number | null
  registrationStatus: RegistrationStatus
  /** Lowercase address that signed. Data about an event, not an identity. */
  registeredWallet: string
  registeredAt: string | null
  createdAt: string
  updatedAt: string
}

/**
 * What the proof section should show.
 *
 * A discriminated union rather than a pile of booleans, because several of
 * these states are mutually exclusive in ways that are easy to get wrong — most
 * importantly, `conflict` and `confirmed` must never both be reachable, and
 * neither may be suppressed by the wallet being disconnected. Deriving one
 * value from all the inputs at once makes that structural.
 */
export type ProofState =
  /** No registry address configured. Nothing onchain is possible. */
  | { kind: 'registry-unconfigured' }
  /** The product has no receipt, so there is nothing to anchor. */
  | { kind: 'no-receipt' }
  /** A receipt exists but has not been hashed yet. Hashing is offered. */
  | { kind: 'unhashed' }
  /** No warranty on record; the contract requires dates. */
  | { kind: 'no-warranty' }
  /** Eligible, but no wallet is connected. */
  | { kind: 'wallet-disconnected' }
  /** Wallet connected to the wrong network. */
  | { kind: 'wrong-chain'; connectedChainId: number }
  /** Ready. The user may create the proof. */
  | { kind: 'ready' }
  /** Broadcast, not yet confirmed. */
  | { kind: 'pending'; record: BlockchainRecord }
  /**
   * Confirmed onchain, and every compared field agrees.
   *
   * `record` is null when the chain holds a matching registration that this
   * database has no row for — a proof created from another browser, or one
   * whose row was lost between broadcast and insert. That is a bookkeeping gap,
   * not an integrity problem: the chain is authoritative about whether a key is
   * registered, and all four compared fields matched. The UI says so, minus the
   * transaction link it has no way to know.
   */
  | {
      kind: 'confirmed'
      record: BlockchainRecord | null
      onchain: OnchainWarrantyRecord
    }
  /**
   * A record exists onchain that does not match this WarrantyPass. Never render
   * this as verified, and never resolve it by overwriting either side.
   */
  | {
      kind: 'conflict'
      onchain: OnchainWarrantyRecord
      mismatches: RecordMismatch[]
      record: BlockchainRecord | null
    }
  /** The last attempt reverted or was not mined. Retry is offered. */
  | { kind: 'failed'; record: BlockchainRecord }
