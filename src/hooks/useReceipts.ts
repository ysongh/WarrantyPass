import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createReceipt,
  createReceiptViewUrl,
  discardReceipt,
  getReceiptForProduct,
  parseReceipt,
} from '../lib/receipts'
import type { Receipt, ReceiptSummary } from '../types/receipt'
import { useAuthSession } from './useAuthSession'

/*
 * Receipt state, over the same TanStack Query cache as products.
 *
 * As in `useProducts`, the user id is part of every key: a cached receipt
 * belongs to one anonymous user, and a replaced session must not read the
 * previous one's cache.
 *
 * Note what is *not* here: no query that parses on mount, and no automatic
 * retry of a parse. Parsing costs money at an AI provider, so it happens only
 * when a person asks for it — which is why it is a mutation rather than a
 * query, even though it reads more than it writes.
 */

export const receiptKeys = {
  forProduct: (userId: string, productId: string) =>
    ['receipts', userId, 'product', productId] as const,
}

/** Validates, hashes and uploads a receipt, returning the draft row. */
export function useUploadReceipt() {
  return useMutation<Receipt, Error, File>({
    mutationFn: createReceipt,
  })
}

/**
 * Runs the parser. `force` comes from an explicit Re-scan; without it an
 * already-parsed receipt returns its stored extraction instead of paying for a
 * second reading of the same image.
 */
export function useParseReceipt() {
  return useMutation<Receipt, Error, { receiptId: string; force?: boolean }>({
    mutationFn: ({ receiptId, force }) => parseReceipt(receiptId, { force }),
  })
}

/** Discards an unattached draft: its row and its stored image. */
export function useDiscardReceipt() {
  return useMutation<void, Error, Pick<Receipt, 'id' | 'storagePath' | 'productId'>>({
    mutationFn: discardReceipt,
  })
}

/** The receipt attached to a product, for the private detail page. */
export function useProductReceipt(productId: string | undefined) {
  const { status, userId } = useAuthSession()

  return useQuery<ReceiptSummary | null>({
    queryKey: receiptKeys.forProduct(userId ?? 'anonymous', productId ?? ''),
    queryFn: () => getReceiptForProduct(productId!),
    enabled: status === 'ready' && Boolean(userId) && Boolean(productId),
  })
}

/**
 * Mints a short-lived signed URL to view a receipt.
 *
 * A mutation, not a query, and deliberately so: a query would generate a URL on
 * render and refresh it in the background, which means minting view links for
 * a private image nobody asked to look at. This one is created when the owner
 * clicks, and is never cached.
 */
export function useReceiptViewUrl() {
  return useMutation<string, Error, string>({
    mutationFn: createReceiptViewUrl,
  })
}

/**
 * Invalidates the receipt cached against a product. Called after creating a
 * product with a receipt, so the detail page shows it immediately.
 */
export function useInvalidateProductReceipt() {
  const queryClient = useQueryClient()
  const { userId } = useAuthSession()

  return (productId: string) => {
    if (!userId) return

    void queryClient.invalidateQueries({
      queryKey: receiptKeys.forProduct(userId, productId),
    })
  }
}
