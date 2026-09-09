import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { createProductWithWarranty, getProductById, getProducts } from '../lib/products'
import type { CreatedProduct, CreateProductInput } from '../types/product'
import { useAuthSession } from './useAuthSession'

/*
 * TanStack Query is already in the tree — wagmi requires it — so product data
 * reuses it rather than introducing a second cache.
 *
 * The user id is part of every key. Cached rows belong to one anonymous user,
 * and if the session is ever replaced (or upgraded to a linked account later)
 * the new identity must not read the previous one's cache.
 */

export const productKeys = {
  all: (userId: string) => ['products', userId] as const,
  detail: (userId: string, productId: string) =>
    ['products', userId, productId] as const,
}

/** The current user's products. Idle until the anonymous session is ready. */
export function useProducts() {
  const { status, userId } = useAuthSession()

  return useQuery({
    queryKey: productKeys.all(userId ?? 'anonymous'),
    queryFn: getProducts,
    enabled: status === 'ready' && Boolean(userId),
  })
}

/**
 * One product. Resolves to `null` when it does not exist or is not the current
 * user's — both are a miss, and the page must not distinguish them.
 */
export function useProduct(productId: string | undefined) {
  const { status, userId } = useAuthSession()

  return useQuery({
    queryKey: productKeys.detail(userId ?? 'anonymous', productId ?? ''),
    queryFn: () => getProductById(productId!),
    enabled: status === 'ready' && Boolean(userId) && Boolean(productId),
  })
}

/**
 * Creates a product and its warranty, then refreshes the list so the dashboard
 * is already correct by the time the user navigates back to it.
 */
export function useCreateProduct() {
  const queryClient = useQueryClient()
  const { userId } = useAuthSession()

  return useMutation<CreatedProduct, Error, CreateProductInput>({
    mutationFn: createProductWithWarranty,
    onSuccess: () => {
      if (!userId) return

      void queryClient.invalidateQueries({ queryKey: productKeys.all(userId) })
    },
  })
}
