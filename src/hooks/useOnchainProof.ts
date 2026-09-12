import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAccount, useSwitchChain } from 'wagmi'
import {
  getBlock,
  getTransactionReceipt,
  simulateContract,
  waitForTransactionReceipt,
  writeContract,
} from 'wagmi/actions'
import type { Hex } from 'viem'

import { warrantyPassRegistryAbi } from '../contracts/warrantyPassRegistry'
import {
  confirmRecord,
  createPendingRecord,
  deriveProofState,
  failRecord,
  getBlockchainRecord,
  getLastFailedRecord,
} from '../lib/blockchainRecords'
import {
  buildRegisterWarrantyArgs,
  readWarrantyRecord,
  REGISTRY_CHAIN_ID,
  registryAddress,
} from '../lib/contracts/warrantyPass'
import { getProductKey } from '../lib/productKey'
import { hashReceipt } from '../lib/receipts'
import { wagmiConfig } from '../lib/wagmi'
import type { ProofState } from '../types/blockchain'
import type { ProductWithWarranty } from '../types/product'
import type { ReceiptSummary } from '../types/receipt'
import { useAuthSession } from './useAuthSession'
import { receiptKeys } from './useReceipts'

/*
 * Onchain proof state for one product.
 *
 * Two things here are deliberate and worth not undoing.
 *
 * **Nothing registers automatically.** There is no effect that sends a
 * transaction, and no query that writes. A wallet prompt appears only because
 * somebody pressed a button. The one thing that does happen on load is
 * *reconciliation*, which reads the chain and can update a stale local status —
 * it never broadcasts.
 *
 * **The chain is the authority.** Supabase can be stale, because a browser can
 * close between broadcasting a transaction and seeing it mined. The chain
 * cannot. So reconciliation only ever flows chain -> database, and a record is
 * marked confirmed only after a *successful* receipt has been read back, never
 * on the strength of a transaction hash.
 */

export const proofKeys = {
  record: (userId: string, productId: string) =>
    ['blockchain', userId, 'record', productId] as const,
  failed: (userId: string, productId: string) =>
    ['blockchain', userId, 'failed', productId] as const,
  onchain: (productKey: string) => ['blockchain', 'onchain', productKey] as const,
}

/** Where the create-proof flow currently is, for the button and status line. */
export type RegisterPhase =
  | 'idle'
  | 'hashing'
  | 'checking'
  | 'simulating'
  | 'awaiting-signature'
  | 'broadcasting'
  | 'waiting'
  | 'verifying'

export function useOnchainProof(
  product: ProductWithWarranty | undefined,
  receipt: ReceiptSummary | null | undefined,
) {
  const { userId } = useAuthSession()
  const { address, chainId } = useAccount()
  const queryClient = useQueryClient()

  const productKey = useMemo(() => {
    if (!product) return null

    try {
      return getProductKey(product.publicId)
    } catch {
      // A malformed public_id cannot be reconciled with anything onchain. Treat
      // it as "no proof possible" rather than crashing the page.
      return null
    }
  }, [product])

  const recordQuery = useQuery({
    queryKey: proofKeys.record(userId ?? 'anonymous', product?.id ?? ''),
    queryFn: () => getBlockchainRecord(product!.id),
    enabled: Boolean(userId && product && registryAddress),
  })

  const failedQuery = useQuery({
    queryKey: proofKeys.failed(userId ?? 'anonymous', product?.id ?? ''),
    queryFn: () => getLastFailedRecord(product!.id),
    enabled: Boolean(userId && product && registryAddress),
  })

  const onchainQuery = useQuery({
    queryKey: proofKeys.onchain(productKey ?? ''),
    queryFn: () => readWarrantyRecord(productKey as Hex),
    enabled: Boolean(productKey && registryAddress),
    // The chain's answer for a given key changes exactly once, ever — a record
    // is write-once. Re-reading it on every focus would be noise.
    staleTime: 30_000,
    retry: 1,
  })

  const state: ProofState = useMemo(
    () =>
      deriveProofState({
        receiptExists: Boolean(receipt),
        receiptKeccak256: receipt?.receiptKeccak256 ?? null,
        warranty: product?.warranty ?? null,
        record: recordQuery.data ?? null,
        failedRecord: failedQuery.data ?? null,
        onchain: onchainQuery.data ?? null,
        walletAddress: address,
        connectedChainId: chainId,
      }),
    [receipt, product, recordQuery.data, failedQuery.data, onchainQuery.data, address, chainId],
  )

  /*
   * Reconciliation.
   *
   * Covers the case the acceptance criteria care about: a transaction confirmed
   * onchain while the browser was closed, leaving Supabase saying `pending`.
   *
   * Runs at most once per record per mount — `reconciledRef` guards against a
   * re-render retriggering it — and only ever updates the database to agree
   * with the chain. It never writes to the chain and never rewrites a hash.
   */
  const reconciledRef = useRef<string | null>(null)

  useEffect(() => {
    const record = recordQuery.data
    if (!record || record.registrationStatus !== 'pending') return
    if (reconciledRef.current === record.id) return
    if (onchainQuery.isPending) return

    reconciledRef.current = record.id

    void (async () => {
      try {
        const txReceipt = await getTransactionReceipt(wagmiConfig, {
          hash: record.transactionHash as Hex,
          chainId: REGISTRY_CHAIN_ID,
        })

        if (txReceipt.status === 'reverted') {
          await failRecord(record.id)
        } else if (onchainQuery.data) {
          // Mined *and* the record is really there. Both conditions matter: a
          // successful receipt for some other transaction would not prove this
          // key was registered.
          const block = await getBlock(wagmiConfig, {
            blockNumber: txReceipt.blockNumber,
            chainId: REGISTRY_CHAIN_ID,
          })

          await confirmRecord(record.id, {
            blockNumber: Number(txReceipt.blockNumber),
            registeredAt: new Date(Number(block.timestamp) * 1000).toISOString(),
          })
        } else {
          // Receipt succeeded but the key is not registered. Do not touch the
          // row: this is exactly the situation a human should look at.
          return
        }

        await queryClient.invalidateQueries({
          queryKey: proofKeys.record(userId ?? 'anonymous', record.productId),
        })
        await queryClient.invalidateQueries({
          queryKey: proofKeys.failed(userId ?? 'anonymous', record.productId),
        })
      } catch {
        // A transaction that is not yet mined throws here, which is the normal
        // case while waiting. Leave the row pending and try again next mount.
        reconciledRef.current = null
      }
    })()
  }, [recordQuery.data, onchainQuery.data, onchainQuery.isPending, queryClient, userId])

  return {
    state,
    productKey,
    isPending: recordQuery.isPending || onchainQuery.isPending,
    /** A chain read failing is different from "no proof" — surface it. */
    chainError: onchainQuery.isError ? onchainQuery.error : null,
    refetch: async () => {
      await Promise.all([recordQuery.refetch(), failedQuery.refetch(), onchainQuery.refetch()])
    },
  }
}

/** Switches the wallet to Arc Testnet. */
export function useSwitchToRegistryChain() {
  const { switchChain, isPending, error } = useSwitchChain()

  return {
    switchToRegistryChain: () => switchChain({ chainId: REGISTRY_CHAIN_ID }),
    isPending,
    error,
  }
}

/**
 * Creates the onchain proof.
 *
 * The sequence, and why each step is there:
 *
 *   1. hash the receipt if it has not been hashed (server-side, from Storage)
 *   2. re-read the chain — someone may have registered this key already
 *   3. simulate — catches a duplicate or bad argument before a wallet prompt
 *   4. write — the only step that asks the user to sign
 *   5. persist `pending` immediately, so a closed browser is recoverable
 *   6. wait for a *successful* receipt
 *   7. read the record back and compare it field by field
 *   8. only then mark it confirmed
 *
 * A rejected signature leaves no database row at all: the product is simply
 * still offchain, which is a normal state, not a failure to record.
 */
export function useRegisterProof(
  product: ProductWithWarranty | undefined,
  receipt: ReceiptSummary | null | undefined,
) {
  const { userId } = useAuthSession()
  const { address } = useAccount()
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<RegisterPhase>('idle')

  const mutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      if (!product || !receipt || !userId || !address) {
        throw new Error('Connect a wallet and add a receipt before creating a proof.')
      }
      if (!registryAddress) {
        throw new Error('No registry is configured for this environment.')
      }

      const warranty = product.warranty
      if (!warranty) {
        throw new Error('This product has no warranty dates to register.')
      }

      // 1. Hash, if needed. Server-side, over the stored bytes.
      setPhase('hashing')
      const receiptKeccak256 =
        receipt.receiptKeccak256 ?? (await hashReceipt(receipt.id))

      const productKey = getProductKey(product.publicId)

      // 2. The chain may already hold this key — from another device, or from a
      // transaction this browser never saw confirm. Registering again would
      // revert and waste gas.
      setPhase('checking')
      const existing = await readWarrantyRecord(productKey)

      if (existing) {
        await queryClient.invalidateQueries({ queryKey: proofKeys.onchain(productKey) })
        throw new Error(
          'This product already has a proof onchain. Reload the page to see it.',
        )
      }

      const args = buildRegisterWarrantyArgs({
        publicId: product.publicId,
        receiptKeccak256,
        purchaseDate: warranty.startDate,
        warrantyEndDate: warranty.endDate,
        transferability: warranty.transferability,
      })

      // 3. Simulate. Turns a would-be revert into an error before the wallet
      // prompt, so the user is not asked to pay for a transaction that cannot
      // succeed.
      setPhase('simulating')
      const { request } = await simulateContract(wagmiConfig, {
        address: registryAddress,
        abi: warrantyPassRegistryAbi,
        functionName: 'registerWarranty',
        args,
        account: address,
        chainId: REGISTRY_CHAIN_ID,
      })

      // 4. Sign and broadcast.
      setPhase('awaiting-signature')
      const transactionHash = await writeContract(wagmiConfig, request)

      // 5. Persist before waiting. If the browser closes now, reconciliation
      // can still find this transaction on the next load.
      setPhase('broadcasting')
      const record = await createPendingRecord({
        userId,
        productId: product.id,
        productKey,
        receiptHash: receiptKeccak256,
        transactionHash,
        registeredWallet: address,
      })

      await queryClient.invalidateQueries({
        queryKey: proofKeys.record(userId, product.id),
      })

      // 6. Wait for the receipt. A hash alone proves nothing — the transaction
      // can still revert.
      setPhase('waiting')
      const txReceipt = await waitForTransactionReceipt(wagmiConfig, {
        hash: transactionHash,
        chainId: REGISTRY_CHAIN_ID,
      })

      if (txReceipt.status === 'reverted') {
        await failRecord(record.id)
        await queryClient.invalidateQueries({
          queryKey: proofKeys.record(userId, product.id),
        })
        throw new Error('The transaction was mined but reverted. No proof was created.')
      }

      // 7. Read it back from the chain and compare. Do not trust the write.
      setPhase('verifying')
      const onchain = await readWarrantyRecord(productKey)

      if (!onchain) {
        throw new Error(
          'The transaction succeeded but no record was found onchain. Reload before retrying.',
        )
      }

      const block = await getBlock(wagmiConfig, {
        blockNumber: txReceipt.blockNumber,
        chainId: REGISTRY_CHAIN_ID,
      })

      // 8. Confirmed. `deriveProofState` re-runs the field comparison on render,
      // so a mismatch here still surfaces as a conflict rather than a check mark.
      await confirmRecord(record.id, {
        blockNumber: Number(txReceipt.blockNumber),
        registeredAt: new Date(Number(block.timestamp) * 1000).toISOString(),
      })

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: proofKeys.record(userId, product.id) }),
        queryClient.invalidateQueries({ queryKey: proofKeys.onchain(productKey) }),
        queryClient.invalidateQueries({
          queryKey: receiptKeys.forProduct(userId, product.id),
        }),
      ])
    },
    onSettled: () => setPhase('idle'),
  })

  return { ...mutation, phase }
}

/** Hashes a receipt on demand, without registering anything. */
export function useHashReceipt(productId: string | undefined) {
  const { userId } = useAuthSession()
  const queryClient = useQueryClient()

  return useMutation<string, Error, string>({
    mutationFn: hashReceipt,
    onSuccess: async () => {
      if (!userId || !productId) return

      await queryClient.invalidateQueries({
        queryKey: receiptKeys.forProduct(userId, productId),
      })
    },
  })
}
