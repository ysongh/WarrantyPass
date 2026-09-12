import { readContract } from 'wagmi/actions'
import { arcTestnet } from 'wagmi/chains'
import { BaseError, ContractFunctionRevertedError } from 'viem'
import type { Address, Hex } from 'viem'

import { warrantyPassRegistryAbi } from '../../contracts/warrantyPassRegistry'
import { wagmiConfig } from '../wagmi'
import { isoDateToChainTimestamp } from '../chainDates'
import { getProductKey } from '../productKey'
import type { IsoDate, WarrantyTransferability } from '../../types/product'

/*
 * The typed boundary between the app and the registry.
 *
 * Every chain read and every set of write arguments goes through here, for the
 * same reason `src/lib/products.ts` owns every Supabase query: a second place
 * that builds contract arguments is a second place to get the encoding subtly
 * wrong, and an onchain mistake cannot be corrected afterwards.
 *
 * What this module does NOT do: send transactions. Writing needs a connected
 * wallet, a simulation and a user confirmation, all of which are React
 * concerns — see the register hook. This module builds the arguments and reads
 * the result back.
 */

/**
 * Arc Testnet. The only chain phase 4 targets.
 *
 * Arc is Circle's chain and USDC is its native gas token, so a registration is
 * paid for in USDC rather than ETH. Users fund from https://faucet.circle.com.
 * Arc is testnet-only today; there is no mainnet counterpart to fall back to.
 */
export const REGISTRY_CHAIN = arcTestnet

/** 5042002. Persisted on every blockchain_records row. */
export const REGISTRY_CHAIN_ID = arcTestnet.id

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/

/**
 * The deployed registry, or `null` when it is not configured.
 *
 * Nullable on purpose, exactly like the Supabase client: the app has to build
 * and run before a contract exists, and an unset address means "onchain proof
 * unavailable" — never a hardcoded fallback. A guessed or stale address would
 * point the UI at a contract that is not ours, and a read returning nothing
 * would look identical to a product that simply has no proof yet.
 *
 * Normalised to lowercase so it can be compared to a `blockchain_records` row
 * with a plain `===`. viem accepts a lowercase address anywhere it accepts a
 * checksummed one.
 */
export const registryAddress: Address | null = (() => {
  const configured = import.meta.env.VITE_WARRANTY_PASS_REGISTRY_ADDRESS?.trim()

  if (!configured) return null

  if (!ADDRESS_PATTERN.test(configured)) {
    console.error('VITE_WARRANTY_PASS_REGISTRY_ADDRESS is not a valid address; ignoring it.')
    return null
  }

  return configured.toLowerCase() as Address
})()

export const isRegistryConfigured = registryAddress !== null

/** A record as it exists on the chain, decoded. */
export type OnchainWarrantyRecord = {
  receiptHash: Hex
  purchaseDate: bigint
  warrantyEnd: bigint
  /** The wallet that paid for the registration. **Not** the product's owner. */
  registeredBy: Address
  /** 0 None, 1 Active, 2 Voided. `Voided` is unreachable in this version. */
  state: number
  warrantyTransferable: boolean
}

/**
 * Maps the app's three-valued transferability onto the contract's `bool`.
 *
 * `unknown` becomes `false`, and that asymmetry is deliberate. `unknown` means
 * the owner does not know the manufacturer's policy — it is an absence of
 * information, not a claim. Recording it as `true` would publish, permanently
 * and publicly, an assertion nobody actually made. `false` under-claims, which
 * is the survivable direction for a record that can never be edited.
 *
 * The precise value stays in Supabase, where all three states are preserved.
 */
export function isTransferableOnchain(value: WarrantyTransferability): boolean {
  return value === 'transferable'
}

/** Everything the contract needs, in the order `registerWarranty` declares. */
export type RegisterWarrantyArgs = readonly [Hex, Hex, bigint, bigint, boolean]

/**
 * Builds the arguments for `registerWarranty`.
 *
 * Deliberately takes the *source* values rather than pre-converted ones, so the
 * key derivation and the date conversion cannot be done differently by a
 * caller. Throws on anything malformed — a bad argument here becomes a
 * permanent record.
 */
export function buildRegisterWarrantyArgs(input: {
  publicId: string
  receiptKeccak256: string
  purchaseDate: IsoDate
  warrantyEndDate: IsoDate
  transferability: WarrantyTransferability
}): RegisterWarrantyArgs {
  const productKey = getProductKey(input.publicId)

  if (!/^0x[0-9a-f]{64}$/.test(input.receiptKeccak256)) {
    throw new Error('The receipt hash must be 0x-prefixed lowercase 32-byte hex.')
  }

  const purchaseDate = isoDateToChainTimestamp(input.purchaseDate)
  const warrantyEnd = isoDateToChainTimestamp(input.warrantyEndDate)

  // The contract rejects this too. Failing here means failing before a wallet
  // prompt rather than after one.
  if (warrantyEnd < purchaseDate) {
    throw new Error('A warranty cannot end before the purchase date.')
  }

  return [
    productKey,
    input.receiptKeccak256 as Hex,
    purchaseDate,
    warrantyEnd,
    isTransferableOnchain(input.transferability),
  ] as const
}

/** `true` if a viem error is the contract's own `WarrantyNotFound` revert. */
function isWarrantyNotFound(error: unknown): boolean {
  if (!(error instanceof BaseError)) return false

  const revert = error.walk((cause) => cause instanceof ContractFunctionRevertedError)

  return (
    revert instanceof ContractFunctionRevertedError &&
    revert.data?.errorName === 'WarrantyNotFound'
  )
}

/**
 * Reads a record, or `null` if the key has never been registered.
 *
 * `getWarranty` reverts for an unknown key rather than returning a zeroed
 * struct, so "not registered" arrives as a specific custom error. That error is
 * translated to `null` here; anything else — an RPC failure, a wrong address,
 * a different contract at that address — propagates, because those must not be
 * mistaken for "no proof exists".
 */
export async function readWarrantyRecord(
  productKey: Hex,
): Promise<OnchainWarrantyRecord | null> {
  if (!registryAddress) return null

  try {
    const record = await readContract(wagmiConfig, {
      address: registryAddress,
      abi: warrantyPassRegistryAbi,
      functionName: 'getWarranty',
      args: [productKey],
      chainId: REGISTRY_CHAIN_ID,
    })

    return {
      receiptHash: record.receiptHash,
      purchaseDate: record.purchaseDate,
      warrantyEnd: record.warrantyEnd,
      registeredBy: record.registeredBy.toLowerCase() as Address,
      state: Number(record.state),
      warrantyTransferable: record.warrantyTransferable,
    }
  } catch (cause) {
    if (isWarrantyNotFound(cause)) return null
    throw cause
  }
}

/** Whether a key is registered. Cheaper than a full read and never reverts. */
export async function warrantyRecordExists(productKey: Hex): Promise<boolean> {
  if (!registryAddress) return false

  return readContract(wagmiConfig, {
    address: registryAddress,
    abi: warrantyPassRegistryAbi,
    functionName: 'exists',
    args: [productKey],
    chainId: REGISTRY_CHAIN_ID,
  })
}

/** The values a local WarrantyPass expects to find onchain. */
export type ExpectedOnchainRecord = {
  receiptKeccak256: string
  purchaseDate: IsoDate
  warrantyEndDate: IsoDate
  transferability: WarrantyTransferability
}

/** A field whose onchain value disagrees with the local one. */
export type RecordMismatch = {
  field: 'receiptHash' | 'purchaseDate' | 'warrantyEnd' | 'warrantyTransferable'
  onchain: string
  expected: string
}

/**
 * Compares a chain record against the local WarrantyPass, field by field.
 *
 * An empty array means every compared field agrees. Anything else is an
 * integrity problem: show a warning, do **not** show "Verified", and do not
 * overwrite either side to make them agree.
 *
 * `registeredBy` is deliberately not compared. It is whoever paid for the
 * transaction — legitimately a different wallet from the one currently
 * connected, and not something the local record can be wrong about.
 */
export function compareOnchainRecord(
  onchain: OnchainWarrantyRecord,
  expected: ExpectedOnchainRecord,
): RecordMismatch[] {
  const mismatches: RecordMismatch[] = []

  const expectedHash = expected.receiptKeccak256.toLowerCase()
  const onchainHash = onchain.receiptHash.toLowerCase()

  if (onchainHash !== expectedHash) {
    mismatches.push({ field: 'receiptHash', onchain: onchainHash, expected: expectedHash })
  }

  const expectedPurchase = isoDateToChainTimestamp(expected.purchaseDate)
  if (onchain.purchaseDate !== expectedPurchase) {
    mismatches.push({
      field: 'purchaseDate',
      onchain: onchain.purchaseDate.toString(),
      expected: expectedPurchase.toString(),
    })
  }

  const expectedEnd = isoDateToChainTimestamp(expected.warrantyEndDate)
  if (onchain.warrantyEnd !== expectedEnd) {
    mismatches.push({
      field: 'warrantyEnd',
      onchain: onchain.warrantyEnd.toString(),
      expected: expectedEnd.toString(),
    })
  }

  const expectedTransferable = isTransferableOnchain(expected.transferability)
  if (onchain.warrantyTransferable !== expectedTransferable) {
    mismatches.push({
      field: 'warrantyTransferable',
      onchain: String(onchain.warrantyTransferable),
      expected: String(expectedTransferable),
    })
  }

  return mismatches
}

/*
 * Explorer links.
 *
 * Built from viem's own chain metadata rather than a hardcoded hostname, so
 * there is one place this is defined and it stays correct if the chain config
 * ever changes. Returns null when the chain has no known explorer instead of
 * guessing a URL.
 */
const explorerBaseUrl = REGISTRY_CHAIN.blockExplorers?.default.url ?? null

export function transactionUrl(transactionHash: string): string | null {
  return explorerBaseUrl ? `${explorerBaseUrl}/tx/${transactionHash}` : null
}

export function addressUrl(address: string): string | null {
  return explorerBaseUrl ? `${explorerBaseUrl}/address/${address}` : null
}
