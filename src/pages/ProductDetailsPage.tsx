import { useParams } from 'react-router'

function ProductDetailsPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Product details
      </h1>
      <p className="mt-3 max-w-2xl text-ink-muted text-pretty">
        A product's WarrantyPass will live here: its receipt, warranty status
        and expiry, service history, and the option to transfer it to a new
        owner.
      </p>
      <p className="mt-6 text-sm text-ink-muted">
        Product ID: <code className="text-ink">{id}</code>
      </p>
    </>
  )
}

export default ProductDetailsPage
