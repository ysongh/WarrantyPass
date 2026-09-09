import { useNavigate } from 'react-router'

import SessionGate from '../components/auth/SessionGate'
import ProductForm from '../components/products/ProductForm'
import { useCreateProduct } from '../hooks/useProducts'

function AddProductPage() {
  const navigate = useNavigate()
  const createProduct = useCreateProduct()

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Add product
      </h1>
      <p className="mt-3 max-w-2xl text-ink-muted text-pretty">
        Enter the product and its warranty. Receipt scanning comes later — for
        now this is typed in by hand, and only you can see it.
      </p>

      <SessionGate>
        <ProductForm
          isSubmitting={createProduct.isPending}
          submitError={createProduct.error?.message ?? null}
          onSubmit={(input) => {
            createProduct.mutate(input, {
              // The mutation invalidates the product list first, so the
              // dashboard is already correct behind the detail page.
              onSuccess: ({ productId }) => navigate(`/products/${productId}`),
            })
          }}
        />
      </SessionGate>
    </>
  )
}

export default AddProductPage
