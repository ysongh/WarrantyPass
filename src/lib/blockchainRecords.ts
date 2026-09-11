import type { SupabaseClient } from '@supabase/supabase-js'

import type { BlockchainRecord, ProofState, RegistrationStatus } from '../types/blockchain'
import type { Warranty } from '../types/product'
import { supabase } from './supabase'
import { toUserFacingError, type UserFacingMessages } from './supabaseErrors'
import {
  compareOnchainRecord,
  REGISTRY_CHAIN_ID,
  registryAddress,
  type ExpectedOnchainRecord,
  type OnchainWarrantyRecord,
} from './contracts/warrantyPass'

/*
 * Every Supabase read and write for blockchain records.
 *
 * Same rule as `products.ts`: nothing here filters by user, because RLS does
 * that at the database. A client-side filter would imply the app is the
 * boundary and would silently become the only check if a policy were dropped.
 *
 * `user_id` is written on insert because the column is NOT NULL, but it is read
 * from the session rather than accepted from a caller — and the insert policy
 * independently requires it to equal `auth.uid()`, so a wrong value is rejected
 * by the database rather than trusted.
 */

const RECORD_COLUMNS = `
  id,
  product_id,
  chain_id,
  contract_address,
  product_key,
  receipt_hash,
  transaction_hash,
  block_number,
  registration_status,
  registered_wallet,
  registered_at,
  created_at,
  updated_at
`

type RecordRow = {
  id: string
  product_id: string
  chain_id: number | string
  contract_address: string
  product_key: string
  receipt_hash: string | null
  transaction_hash: string
  block_number: number | string | null
  registration_status: string
  registered_wallet: string
  registered_at: string | null
  created_at: string
  updated_at: string
}

const STATUSES: readonly RegistrationStatus[] = ['pending', 'confirmed', 'failed']

const RECORD_MESSAGES: UserFacingMessages = {
  invalidInput: "That proof couldn't be saved. Check the details and try again.",
}

function toRecordError(context: string, error: unknown): Error {
  const shaped =
    typeof error === 'object' && error !== null
      ? (error as { code?: string | null; message?: string | null })
      : null

  return toUserFacingError(`blockchain: ${context}`, shaped, RECORD_MESSAGES)
}

function requireClient(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'WarrantyPass is not connected to a database. Add Supabase credentials to your environment.',
    )
  }

  return supabase
}

/** `bigint` and `numeric` can cross the wire as strings. */
function toNumber(value: number | string | null): number | null {
  if (value === null) return null
  const parsed = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(parsed) ? parsed : null
}

function toStatus(value: string): RegistrationStatus {
  return (STATUSES as readonly string[]).includes(value)
    ? (value as RegistrationStatus)
    : 'failed'
}

function toRecord(row: RecordRow): BlockchainRecord {
  return {
    id: row.id,
    productId: row.product_id,
    chainId: toNumber(row.chain_id) ?? 0,
    contractAddress: row.contract_address,
    productKey: row.product_key,
    receiptHash: row.receipt_hash,
    transactionHash: row.transaction_hash,
    blockNumber: toNumber(row.block_number),
    registrationStatus: toStatus(row.registration_status),
    registeredWallet: row.registered_wallet,
    registeredAt: row.registered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * The live record for a product on the configured registry, if any.
 *
 * Scoped to the current chain and contract address, so a record left over from
 * a previous deployment does not masquerade as a proof against the current one.
 * `failed` rows are excluded: they are kept for troubleshooting, not to be
 * rendered as the product's proof.
 */
export async function getBlockchainRecord(
  productId: string,
): Promise<BlockchainRecord | null> {
  if (!registryAddress) return null

  const client = requireClient()

  const { data, error } = await client
    .from('blockchain_records')
    .select(RECORD_COLUMNS)
    .eq('product_id', productId)
    .eq('chain_id', REGISTRY_CHAIN_ID)
    .eq('contract_address', registryAddress)
    .in('registration_status', ['pending', 'confirmed'])
    .maybeSingle<RecordRow>()

  if (error) throw toRecordError('Loading proof', error)

  return data ? toRecord(data) : null
}

/** The most recent failed attempt, so a retry can show what happened. */
export async function getLastFailedRecord(
  productId: string,
): Promise<BlockchainRecord | null> {
  if (!registryAddress) return null

  const client = requireClient()

  const { data, error } = await client
    .from('blockchain_records')
    .select(RECORD_COLUMNS)
    .eq('product_id', productId)
    .eq('chain_id', REGISTRY_CHAIN_ID)
    .eq('contract_address', registryAddress)
    .eq('registration_status', 'failed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<RecordRow>()

  if (error) throw toRecordError('Loading proof history', error)

  return data ? toRecord(data) : null
}

/**
 * Records a broadcast transaction as pending.
 *
 * Written immediately after the wallet returns a hash, before waiting for the
 * receipt, so that closing the browser mid-flight leaves a recoverable trace
 * rather than an orphaned transaction nobody can reconcile.
 *
 * Every hex value is lowercased here. wagmi hands back EIP-55 checksummed
 * addresses, which would fail the database's lowercase check constraints and,
 * worse, would silently not match on a later comparison.
 */
export async function createPendingRecord(input: {
  userId: string
  productId: string
  productKey: string
  receiptHash: string
  transactionHash: string
  registeredWallet: string
}): Promise<BlockchainRecord> {
  if (!registryAddress) {
    throw new Error('No registry is configured, so a proof cannot be recorded.')
  }

  const client = requireClient()

  const { data, error } = await client
    .from('blockchain_records')
    .insert({
      user_id: input.userId,
      product_id: input.productId,
      chain_id: REGISTRY_CHAIN_ID,
      contract_address: registryAddress,
      product_key: input.productKey.toLowerCase(),
      receipt_hash: input.receiptHash.toLowerCase(),
      transaction_hash: input.transactionHash.toLowerCase(),
      registration_status: 'pending',
      registered_wallet: input.registeredWallet.toLowerCase(),
    })
    .select(RECORD_COLUMNS)
    .single<RecordRow>()

  if (error) throw toRecordError('Saving proof', error)

  return toRecord(data)
}

/**
 * Marks a record confirmed.
 *
 * Only ever called after a *successful* transaction receipt has been read and
 * the onchain record compared field by field — never on a transaction hash
 * alone. The database enforces the same expectation from the other side:
 * `blockchain_records_confirmed_is_complete` rejects a confirmed row that is
 * missing its block number, timestamp or digest.
 */
export async function confirmRecord(
  recordId: string,
  input: { blockNumber: number; registeredAt: string },
): Promise<BlockchainRecord> {
  const client = requireClient()

  const { data, error } = await client
    .from('blockchain_records')
    .update({
      registration_status: 'confirmed',
      block_number: input.blockNumber,
      registered_at: input.registeredAt,
    })
    .eq('id', recordId)
    .select(RECORD_COLUMNS)
    .single<RecordRow>()

  if (error) throw toRecordError('Confirming proof', error)

  return toRecord(data)
}

/**
 * Marks a record failed, keeping the transaction hash.
 *
 * The hash is deliberately retained: it is the only way to look up what went
 * wrong on an explorer. The partial unique index excludes `failed`, so this
 * also frees the product for a retry.
 */
export async function failRecord(recordId: string): Promise<void> {
  const client = requireClient()

  const { error } = await client
    .from('blockchain_records')
    .update({ registration_status: 'failed' })
    .eq('id', recordId)

  if (error) throw toRecordError('Updating proof', error)
}

/**
 * Decides what the proof section shows, from every input at once.
 *
 * Pure, so the precedence rules below are testable without a chain or a
 * database. The order is the substance of this function:
 *
 *  1. **The chain wins.** A record that exists onchain and disagrees with the
 *     local data is a conflict, and that outcome outranks everything — including
 *     a database row that claims to be confirmed.
 *  2. **Chain truth does not depend on a wallet.** `confirmed` and `conflict`
 *     are decided before any wallet check, so disconnecting a wallet can never
 *     turn a verified proof back into "create one", and can never hide a
 *     conflict.
 *  3. Only then do the prerequisites for *writing* apply: registry, receipt,
 *     hash, warranty, wallet, network.
 */
export function deriveProofState(input: {
  receiptExists: boolean
  receiptKeccak256: string | null
  warranty: Warranty | null
  record: BlockchainRecord | null
  failedRecord: BlockchainRecord | null
  onchain: OnchainWarrantyRecord | null
  walletAddress: string | undefined
  connectedChainId: number | undefined
}): ProofState {
  const { record, onchain, warranty } = input

  if (!registryAddress) return { kind: 'registry-unconfigured' }

  // The chain is authoritative about whether a key is registered, so a record
  // found onchain is evaluated before anything the database says.
  if (onchain) {
    const expected: ExpectedOnchainRecord | null =
      warranty && input.receiptKeccak256
        ? {
            receiptKeccak256: input.receiptKeccak256,
            purchaseDate: warranty.startDate,
            warrantyEndDate: warranty.endDate,
            transferability: warranty.transferability,
          }
        : null

    // Without local values to compare against there is nothing to verify. A
    // record exists under this product's key but cannot be shown to describe
    // it, which is a conflict rather than a confirmation.
    if (!expected) {
      return { kind: 'conflict', onchain, mismatches: [], record }
    }

    const mismatches = compareOnchainRecord(onchain, expected)

    if (mismatches.length > 0) {
      return { kind: 'conflict', onchain, mismatches, record }
    }

    // Every compared field agrees, so this is verified — whatever the database
    // currently says. A row still marked `pending` is a stale local status, not
    // a reason to withhold a result the chain has already settled;
    // reconciliation updates it in the background.
    //
    // `record` may legitimately be null: the chain holds a matching
    // registration this database has no row for. Still verified, for the same
    // reason — the comparison passed against the local product's own values.
    return { kind: 'confirmed', record, onchain }
  }

  // Nothing onchain. A row still in `pending` is a transaction in flight or one
  // that never made it; either way the UI waits rather than offering a second.
  if (record && record.registrationStatus === 'pending') {
    return { kind: 'pending', record }
  }

  if (!input.receiptExists) return { kind: 'no-receipt' }
  if (!input.receiptKeccak256) return { kind: 'unhashed' }
  if (!warranty) return { kind: 'no-warranty' }

  if (input.failedRecord) return { kind: 'failed', record: input.failedRecord }

  if (!input.walletAddress) return { kind: 'wallet-disconnected' }

  if (input.connectedChainId !== REGISTRY_CHAIN_ID) {
    return { kind: 'wrong-chain', connectedChainId: input.connectedChainId ?? 0 }
  }

  return { kind: 'ready' }
}
